import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { baseTranscribeConfigSchema } from "@spencer0124/rtzr-core";
import { z } from "zod";
import { handleTranscribe, resolveCredentials, type RtzrDemoEnv, type RtzrHeaderCredentials } from "./handler.js";
import { signUploadToken, verifyUploadToken } from "./uploadUrl.js";

/** Worker bindings: the demo-key secrets, the R2 bucket backing presigned uploads, and its signing key. */
interface Env extends RtzrDemoEnv {
  UPLOADS_R2: R2Bucket;
  UPLOAD_SIGNING_SECRET?: string;
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB — generous for a demo, not "any size"
const UPLOAD_TTL_MS = 5 * 60_000;

/**
 * Thin Worker/MCP wiring — intentionally NOT unit tested, same as
 * packages/cli/src/cli.ts. All real logic (input resolution, calling core,
 * formatting, error handling, credential resolution, upload signing) lives
 * in handler.ts/uploadUrl.ts, which ARE tested. This file is verified with
 * `wrangler dev` + real tool/HTTP calls instead — see docs/concept.md §8.3.
 *
 * Stateless by design (createMcpHandler, no McpAgent/Durable Objects): the
 * `transcribe` tool is one self-contained call per request, so there's no
 * cross-request session state worth paying Durable Object complexity for.
 * request_upload_url/`/uploads/:id` don't change that — R2 objects are
 * addressed by a random id, not coordinated through any in-Worker state.
 *
 * BYO-key first, demo key fallback: credentials come from the X-RTZR-CLIENT-ID
 * / X-RTZR-CLIENT-SECRET request headers when present. If a caller omits them,
 * `resolveCredentials` falls back to RTZR_CLIENT_ID/RTZR_CLIENT_SECRET Worker
 * secrets (set via `wrangler secret put` — never a repo file) so anonymous
 * callers get a zero-setup demo instead of an auth error. Either way,
 * credentials only ever live in memory for the one request that used them.
 *
 * Presigned uploads (request_upload_url + /uploads/:id) exist because
 * base64-in-tool-call has a hard structural limit: the bytes flow through
 * the *calling model's own* context/output no matter how they're chunked
 * (see LESSONS.md #9 — a real client hit this transcribing a 50s clip).
 * A presigned PUT lets a caller's code-execution sandbox stream the file
 * directly to this Worker over plain HTTP, without the model ever having
 * to generate the file as text.
 */

/** If `input` is one of our own upload fetch URLs (`https://{host}/uploads/{id}`), returns the id. */
function ownUploadId(input: string, host: string): string | null {
  const match = new RegExp(`^https?://${host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/uploads/([^/?]+)$`).exec(input);
  return match?.[1] ?? null;
}

function createServer(creds: RtzrHeaderCredentials, host: string, uploads: R2Bucket, signingSecret: string | undefined): McpServer {
  const server = new McpServer({ name: "rtzr-mcp", version: "0.2.0" });

  // Reuses core's schema for the fields that share both name and shape with
  // TranscribeConfig (see packages/core/src/schema.ts's doc comment); diarize/
  // speakers/model/format/input/filename are this tool's own simplified,
  // renamed surface per docs/concept.md §8.1 and don't map 1:1 onto
  // TranscribeConfig's field names. Defaults quoted below are RTZR's actual
  // API defaults (confirmed against developers.rtzr.ai/docs/stt-file/,
  // 2026-07-14) — this tool previously omitted itn/disfluencyFilter/
  // profanityFilter/paragraphSplitter/wordTimestamps/languageCandidates
  // entirely, which is exactly the gap a real client hit trying to request
  // word timestamps (LESSONS.md).
  // Everything with an actual value constraint (enums, ranges) is reused from
  // core so the constraint lives in exactly one place — hand-declaring e.g.
  // `speakers: z.number().int().min(0)` here would silently diverge from
  // core's spkCount bound. Plain booleans and tool-only fields (input/
  // filename/format) carry no constraint, so reuse would add indirection for
  // nothing.
  const { language, languageCandidates, keywords, paragraphSplitterMax, domain } =
    baseTranscribeConfigSchema.pick({
      language: true,
      languageCandidates: true,
      keywords: true,
      paragraphSplitterMax: true,
      domain: true,
    }).shape;
  // These two are renamed on the tool surface, so they can't be `.pick()`ed.
  const { modelName: model, spkCount: speakers } = baseTranscribeConfigSchema.shape;

  server.registerTool(
    "transcribe",
    {
      description:
        "Transcribes audio via the RTZR (Return Zero) STT API. Supports speaker diarization, keyword " +
        "boosting, ITN, and per-word timestamps. `input` must be an http(s) URL or a base64-encoded audio " +
        "string — this runs on Cloudflare Workers' edge runtime, which has no local filesystem. IMPORTANT: " +
        "base64 is inlined directly into this tool call, so it must fit in your own context — only use it " +
        "for short clips (a few seconds, well under 3MB decoded). For anything longer, call " +
        "request_upload_url first and pass the http(s) URL it gives you here instead. Do not try to " +
        "re-read a large base64 string back through your own tools to verify it — that's what corrupts it.",
      inputSchema: {
        input: z.string().describe("http(s) URL or base64-encoded audio bytes (short clips only, see description)"),
        filename: z
          .string()
          .optional()
          .describe("filename hint for codec detection — required for base64 input unless the default (mp3) is correct"),
        model: model.describe("whisper requires `language` to also be set (default sommers)"),
        language,
        languageCandidates: languageCandidates.describe(
          "language detection candidates — only with model: whisper (default: ko/ja/zh/en)",
        ),
        diarize: z.boolean().optional().describe("enable speaker diarization (default false)"),
        speakers: speakers.describe("expected speaker count, 0 = auto — requires diarize: true"),
        keywords,
        itn: z.boolean().optional().describe("inverse text normalization, e.g. 이십삼 -> 23 (default true)"),
        disfluencyFilter: z.boolean().optional().describe("filter filler words / disfluencies (default true)"),
        profanityFilter: z.boolean().optional().describe("filter profanity (default false)"),
        paragraphSplitter: z.boolean().optional().describe("split output into paragraphs (default true)"),
        paragraphSplitterMax: paragraphSplitterMax.describe(
          "max characters per paragraph, only with paragraphSplitter on (default 50)",
        ),
        wordTimestamps: z
          .boolean()
          .optional()
          .describe("adds a words[] array (start/duration/text per word) to each utterance — only visible with format: \"json\" (default false)"),
        domain: domain.describe("audio domain hint (default GENERAL)"),
        format: z.enum(["txt", "srt", "vtt", "json"]).optional().describe("output format (default txt) — use json to see wordTimestamps"),
      },
    },
    async (input) => {
      const uploadId = ownUploadId(input.input, host);
      if (!uploadId) return handleTranscribe(input, creds);

      // Our own uploaded file: read it straight out of R2 in this same Worker
      // invocation instead of fetching our own public URL back — a Worker
      // calling its own zone isn't a reliable subrequest (production 522s).
      const object = await uploads.get(uploadId);
      if (!object) {
        return {
          content: [{ type: "text" as const, text: "Upload not found — expired, never uploaded, or already consumed." }],
          isError: true,
        };
      }
      const bytes = new Uint8Array(await object.arrayBuffer());
      await uploads.delete(uploadId); // single-use
      return handleTranscribe(input, creds, {
        preResolvedAudio: { bytes, filename: input.filename ?? "audio.mp3" },
      });
    },
  );

  server.registerTool(
    "request_upload_url",
    {
      description:
        "For audio too large to inline as base64 in transcribe (over ~3MB, more than a few seconds): " +
        "returns a one-time presigned URL. If you have code execution / shell access and the file is " +
        "available locally in your sandbox, run the returned curl command to PUT it directly to this " +
        "server — the file's bytes never pass through your own context, unlike base64. Your sandbox's " +
        "outbound network access may be off by default; if the curl fails with a network error, this " +
        "domain needs to be added to its allowed-domains list first (e.g. in Claude.ai: Settings -> " +
        "Capabilities -> Code execution and file creation -> Additional allowed domains) — ask the user " +
        "to add it, then retry. The URL expires in 5 minutes and works once. After uploading, call " +
        "transcribe with `input` set to the returned fetch URL.",
      inputSchema: {
        filename: z.string().optional().describe("local path or filename of the audio to upload, used in the example curl command"),
      },
    },
    async ({ filename }) => {
      if (!signingSecret) {
        return {
          content: [{ type: "text" as const, text: "Upload signing is not configured on this server." }],
          isError: true,
        };
      }
      const uploadId = crypto.randomUUID();
      const expiresAt = Date.now() + UPLOAD_TTL_MS;
      const sig = await signUploadToken(signingSecret, uploadId, expiresAt);
      const putUrl = `https://${host}/uploads/${uploadId}?expires=${expiresAt}&sig=${sig}`;
      const fetchUrl = `https://${host}/uploads/${uploadId}`;
      const curlCmd = `curl -X PUT -T "${filename ?? "/path/to/your/audio-file"}" "${putUrl}"`;
      return {
        content: [
          {
            type: "text" as const,
            text:
              `Presigned upload URL (expires in 5 minutes, single use, max ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB):\n` +
              `${putUrl}\n\n` +
              `Run this from your code execution sandbox:\n${curlCmd}\n\n` +
              `Then call transcribe with input: "${fetchUrl}"`,
          },
        ],
      };
    },
  );

  return server;
}

async function handleUploadPut(request: Request, uploadId: string, url: URL, env: Env): Promise<Response> {
  if (!env.UPLOAD_SIGNING_SECRET) {
    return new Response("upload signing is not configured on this server", { status: 500 });
  }
  const expiresParam = url.searchParams.get("expires");
  const sig = url.searchParams.get("sig");
  if (!expiresParam || !sig) {
    return new Response("missing expires/sig query parameters", { status: 400 });
  }
  const expiresAt = Number(expiresParam);
  const valid = await verifyUploadToken(env.UPLOAD_SIGNING_SECRET, uploadId, expiresAt, sig);
  if (!valid) {
    return new Response("invalid or expired upload token", { status: 403 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_UPLOAD_BYTES) {
    return new Response(`file too large — max ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`, { status: 413 });
  }

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return new Response(`file too large — max ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`, { status: 413 });
  }
  if (bytes.byteLength === 0) {
    return new Response("empty upload body", { status: 400 });
  }

  const contentType = request.headers.get("content-type") ?? "application/octet-stream";
  await env.UPLOADS_R2.put(uploadId, bytes, { httpMetadata: { contentType } });
  return new Response("ok", { status: 200 });
}

async function handleUploadGet(uploadId: string, env: Env): Promise<Response> {
  const object = await env.UPLOADS_R2.get(uploadId);
  if (!object) {
    return new Response("not found — expired, never uploaded, or already consumed", { status: 404 });
  }
  const body = await object.arrayBuffer();
  // Single-use: once transcribe (or anyone) has fetched it, the upload is spent.
  await env.UPLOADS_R2.delete(uploadId);
  return new Response(body, {
    status: 200,
    headers: { "content-type": object.httpMetadata?.contentType ?? "application/octet-stream" },
  });
}

export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    const uploadMatch = /^\/uploads\/([^/]+)$/.exec(url.pathname);
    if (uploadMatch?.[1]) {
      const uploadId = uploadMatch[1];
      if (request.method === "PUT") return handleUploadPut(request, uploadId, url, env);
      if (request.method === "GET") return handleUploadGet(uploadId, env);
      return new Response("method not allowed", { status: 405 });
    }

    const creds: RtzrHeaderCredentials = resolveCredentials(request.headers, env);
    // A fresh McpServer per request — the MCP SDK doesn't allow reconnecting
    // an already-connected server to a new transport (see createMcpHandler's
    // own docs), and each request may carry different BYO-key credentials.
    const server = createServer(creds, url.host, env.UPLOADS_R2, env.UPLOAD_SIGNING_SECRET);
    return createMcpHandler(server)(request, env, ctx);
  },
};
