import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { baseTranscribeConfigSchema } from "@spencer0124/rtzr-core";
import { z } from "zod";
import { handleTranscribe, type RtzrHeaderCredentials } from "./handler.js";

/**
 * Thin Worker/MCP wiring — intentionally NOT unit tested, same as
 * packages/cli/src/cli.ts. All real logic (input resolution, calling core,
 * formatting, error handling) lives in handler.ts, which IS tested with a
 * mocked fetchImpl. This file is verified with `wrangler dev` + the MCP
 * Inspector / `claude mcp add` instead — see docs/concept.md §8.2.
 *
 * Stateless by design (createMcpHandler, no McpAgent/Durable Objects): the
 * `transcribe` tool is one self-contained call per request, so there's no
 * cross-request session state worth paying Durable Object complexity for.
 *
 * BYO-key: credentials come from the X-RTZR-CLIENT-ID / X-RTZR-CLIENT-SECRET
 * request headers and are only ever held in memory for the one request that
 * carried them — this Worker never stores an RTZR key.
 */

function createServer(creds: RtzrHeaderCredentials): McpServer {
  const server = new McpServer({ name: "rtzr-mcp", version: "0.1.0" });

  // Reuses core's schema for the two fields that share both name and shape
  // with TranscribeConfig (see packages/core/src/schema.ts's doc comment);
  // the rest (diarize/speakers/model/format/input/filename) are this tool's
  // own simplified, renamed surface per docs/concept.md §8.1 and don't map
  // 1:1 onto TranscribeConfig's field names.
  const { language, keywords } = baseTranscribeConfigSchema.pick({ language: true, keywords: true }).shape;

  server.registerTool(
    "transcribe",
    {
      description:
        "Transcribes audio via the RTZR (Return Zero) STT API. Supports speaker diarization, keyword " +
        "boosting, and ITN. `input` must be an http(s) URL or a base64-encoded audio string — this runs " +
        "on Cloudflare Workers' edge runtime, which has no local filesystem.",
      inputSchema: {
        input: z.string().describe("http(s) URL or base64-encoded audio bytes"),
        filename: z
          .string()
          .optional()
          .describe("filename hint for codec detection — required for base64 input unless the default (mp3) is correct"),
        model: z.enum(["sommers", "whisper"]).optional().describe("whisper requires `language` to also be set"),
        language,
        diarize: z.boolean().optional().describe("enable speaker diarization (default false)"),
        speakers: z.number().int().min(0).optional().describe("expected speaker count, 0 = auto (default)"),
        keywords,
        format: z.enum(["txt", "srt", "vtt", "json"]).optional().describe("output format (default txt)"),
      },
    },
    async (input) => handleTranscribe(input, creds),
  );

  return server;
}

export default {
  fetch: async (request: Request, env: unknown, ctx: ExecutionContext) => {
    const creds: RtzrHeaderCredentials = {
      clientId: request.headers.get("X-RTZR-CLIENT-ID"),
      clientSecret: request.headers.get("X-RTZR-CLIENT-SECRET"),
    };
    // A fresh McpServer per request — the MCP SDK doesn't allow reconnecting
    // an already-connected server to a new transport (see createMcpHandler's
    // own docs), and each request may carry different BYO-key credentials.
    const server = createServer(creds);
    return createMcpHandler(server)(request, env, ctx);
  },
};
