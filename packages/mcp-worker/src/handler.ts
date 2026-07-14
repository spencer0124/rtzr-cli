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

/** BYO-key credentials read from the request's X-RTZR-CLIENT-ID / X-RTZR-CLIENT-SECRET headers. */
export interface RtzrHeaderCredentials {
  clientId: string | null;
  clientSecret: string | null;
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

  return { bytes: base64ToBytes(input), filename: filename ?? "audio.mp3" };
}

/** Orchestrates one `transcribe` tool call: validate -> resolve audio -> call core -> format. */
export async function handleTranscribe(
  toolInput: TranscribeToolInput,
  creds: RtzrHeaderCredentials,
  opts: { fetchImpl?: typeof fetch } = {},
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
    const { bytes, filename } = await resolveAudioInput(toolInput.input, toolInput.filename, fetchImpl);
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
