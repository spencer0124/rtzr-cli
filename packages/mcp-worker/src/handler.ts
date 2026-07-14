import {
  RtzrApiError,
  RtzrClient,
  RtzrTimeoutError,
  toJson,
  toSrt,
  toTxt,
  toVtt,
  transcribeConfigSchema,
  type TranscribeConfig,
} from "@spencer0124/rtzr-core";

/**
 * This file is the testable orchestration layer for the `transcribe` MCP tool —
 * everything here is a plain function taking an injectable `fetchImpl`, so it's
 * tested the same way as core/client.test.ts (no Workers runtime needed).
 * `src/index.ts` is the thin, untested Worker/MCP wiring on top of this
 * (mirrors packages/cli/src/cli.ts being thin while packages/core is the
 * heavily-tested layer — see CLAUDE.md "테스트 / TDD").
 */

export type OutputFormat = "txt" | "srt" | "vtt" | "json";

export interface TranscribeToolInput {
  /** Audio as an http(s) URL, or a base64-encoded string (edge runtime has no local filesystem). */
  input: string;
  /** Overrides the filename RTZR sees — needed for base64 input, optional for URL input. */
  filename?: string;
  model?: TranscribeConfig["modelName"];
  language?: TranscribeConfig["language"];
  diarize?: boolean;
  speakers?: number;
  keywords?: string[];
  format?: OutputFormat;
}

/** BYO-key credentials, resolved from the request headers (or the demo fallback — see resolveCredentials). */
export interface RtzrHeaderCredentials {
  clientId: string | null;
  clientSecret: string | null;
}

/** Worker secrets holding the demo fallback key (set via `wrangler secret put`, never committed). */
export interface RtzrDemoEnv {
  RTZR_CLIENT_ID?: string;
  RTZR_CLIENT_SECRET?: string;
}

/**
 * BYO-key headers take priority; a demo fallback key (Worker secret, `wrangler
 * secret put` — never a repo file) is used for whichever field a caller didn't
 * supply, so anonymous callers get a zero-setup trial instead of an auth error.
 * They share the demo key's RTZR quota with everyone else who omits headers —
 * bring your own key for real use. clientId/clientSecret resolve independently
 * so a header for one doesn't accidentally suppress the env fallback for the
 * other.
 */
export function resolveCredentials(headers: Headers, env: RtzrDemoEnv): RtzrHeaderCredentials {
  return {
    clientId: headers.get("X-RTZR-CLIENT-ID") ?? env.RTZR_CLIENT_ID ?? null,
    clientSecret: headers.get("X-RTZR-CLIENT-SECRET") ?? env.RTZR_CLIENT_SECRET ?? null,
  };
}

export interface McpToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  // the MCP SDK's CallToolResult type is an index-signature-widened object;
  // this keeps our stricter shape assignable to it at the index.ts boundary
  // without loosening what handler.ts itself reads/writes.
  [key: string]: unknown;
}

function textResult(text: string, isError = false): McpToolResult {
  return isError ? { content: [{ type: "text", text }], isError: true } : { content: [{ type: "text", text }] };
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/flac": "flac",
};

/**
 * Base64 has to be inlined directly into the tool call (MCP/JSON-RPC has no
 * binary framing), which means it flows through the *calling model's own*
 * context/output budget. A real client hit this in practice: it tried to
 * base64-encode a ~50s clip, then re-read that huge string through its own
 * (truncating) file-read tool to double-check it, corrupting the data before
 * it ever reached us. Failing fast here with a clear alternative (URL or
 * upload_chunk) is cheaper than letting a caller discover the limit by
 * fighting with it — see LESSONS.md #9.
 */
export const MAX_INLINE_BASE64_BYTES = 3 * 1024 * 1024; // ~3MB decoded, roughly a minute of compressed voice

function basenameFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const base = pathname.split("/").filter(Boolean).pop();
    // only trust it as a filename if it actually looks like one (has an extension)
    return base && base.includes(".") ? base : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves the tool's `input` (URL or base64) into raw bytes + a filename RTZR
 * can use to infer the audio codec. `fetchImpl` is injectable for tests.
 */
export async function resolveAudioInput(
  input: string,
  filename: string | undefined,
  // bound, not bare — see the matching note in packages/core/src/client.ts
  fetchImpl: typeof fetch = fetch.bind(globalThis),
  // upload.ts's finishUpload passes Infinity here: chunked uploads already
  // enforce their own per-chunk/total-chunk limits before reassembly, so this
  // single-shot guard (meant for one giant blob in one tool call) doesn't apply.
  maxInlineBytes: number = MAX_INLINE_BASE64_BYTES,
): Promise<{ bytes: Uint8Array; filename: string }> {
  if (isHttpUrl(input)) {
    const res = await fetchImpl(input);
    if (!res.ok) {
      throw new Error(`failed to fetch audio from URL: HTTP ${res.status}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
    const resolvedName = filename ?? basenameFromUrl(input) ?? `audio.${extension ?? "mp3"}`;
    return { bytes, filename: resolvedName };
  }

  // Cheap pre-check on the *encoded* length before spending CPU/memory on
  // atob() — base64 expands raw bytes by ~4/3, so we can estimate first.
  const estimatedBytes = Math.floor((input.length * 3) / 4);
  if (estimatedBytes > maxInlineBytes) {
    const mb = (estimatedBytes / (1024 * 1024)).toFixed(1);
    const limitMb = maxInlineBytes / (1024 * 1024);
    throw new Error(
      `base64 input is ~${mb}MB, over the ${limitMb}MB inline limit. Base64 must fit inside the tool ` +
        "call itself, so it's only practical for short clips. For longer audio, host the file and pass " +
        "an http(s) URL instead, or use the upload_chunk tool to send it in pieces.",
    );
  }

  return { bytes: base64ToBytes(input), filename: filename ?? "audio.mp3" };
}

export interface HandleTranscribeOptions {
  fetchImpl?: typeof fetch;
  /** Override for resolveAudioInput's inline-base64 guard — see its own doc comment. */
  maxInlineBase64Bytes?: number;
  /**
   * Skips resolveAudioInput entirely when the caller already has the bytes in
   * hand — used by index.ts for its own uploaded files (read directly out of
   * R2 in the same Worker invocation). Reusing resolveAudioInput's URL-fetch
   * path there would mean the Worker calling its own public URL, which
   * Cloudflare's edge doesn't reliably support for same-zone subrequests
   * (observed as intermittent 522s in production — see LESSONS.md #9).
   */
  preResolvedAudio?: { bytes: Uint8Array; filename: string };
}

/** Orchestrates one `transcribe` tool call: validate -> resolve audio -> call core -> format. */
export async function handleTranscribe(
  toolInput: TranscribeToolInput,
  creds: RtzrHeaderCredentials,
  opts: HandleTranscribeOptions = {},
): Promise<McpToolResult> {
  if (!creds.clientId || !creds.clientSecret) {
    return textResult(
      "Missing RTZR credentials — pass them via the X-RTZR-CLIENT-ID / X-RTZR-CLIENT-SECRET request headers.",
      true,
    );
  }

  // Mirror the CLI's `-l/--language` default of "ko" (docs/concept.md §8.1) — except
  // when modelName is "whisper" and no language was given: silently defaulting there
  // would hide the fact that whisper requires an explicit language, so we leave it
  // undefined and let transcribeConfigSchema's cross-field rule catch it below.
  const language = toolInput.language ?? (toolInput.model === "whisper" ? undefined : "ko");

  const cfg: TranscribeConfig = {
    modelName: toolInput.model,
    language,
    useDiarization: toolInput.diarize ?? false,
    spkCount: toolInput.speakers,
    keywords: toolInput.keywords,
  };

  const validated = transcribeConfigSchema.safeParse(cfg);
  if (!validated.success) {
    return textResult(`Invalid transcribe options: ${validated.error.issues.map((i) => i.message).join("; ")}`, true);
  }

  const fetchImpl = opts.fetchImpl;

  try {
    const { bytes, filename } = opts.preResolvedAudio
      ? opts.preResolvedAudio
      : await resolveAudioInput(
          toolInput.input,
          toolInput.filename,
          fetchImpl,
          opts.maxInlineBase64Bytes ?? MAX_INLINE_BASE64_BYTES,
        );
    const client = new RtzrClient({ clientId: creds.clientId, clientSecret: creds.clientSecret }, { fetchImpl });
    const result = await client.transcribe(bytes, filename, validated.data);

    const format = toolInput.format ?? "txt";
    const speakerLabels = toolInput.diarize ?? false;
    const text =
      format === "srt"
        ? toSrt(result, { speakerLabels })
        : format === "vtt"
          ? toVtt(result, { speakerLabels })
          : format === "json"
            ? toJson(result)
            : toTxt(result, { speakerLabels });

    return textResult(text);
  } catch (err) {
    if (err instanceof RtzrApiError) {
      return textResult(
        `RTZR API error (HTTP ${err.httpStatus}${err.code ? `, ${err.code}` : ""}): ${err.apiMsg ?? err.message}`,
        true,
      );
    }
    if (err instanceof RtzrTimeoutError) {
      return textResult(err.message, true);
    }
    return textResult(err instanceof Error ? err.message : String(err), true);
  }
}
