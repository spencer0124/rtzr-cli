import type {
  RtzrCredentials,
  TranscribeConfig,
  TranscriptResult,
} from "./types.js";
import { buildRequestConfig, parseTranscript } from "./mapping.js";
import { errorFromResponse, RtzrApiError, RtzrTimeoutError } from "./errors.js";

/**
 * ⚠ Environment-neutral by design (internal-docs/concept.md §5):
 * this file must never import `fs` or read `process.env` directly.
 * Audio comes in as bytes, credentials come in as arguments — that's what
 * lets the exact same class run in a Node CLI and a Cloudflare Worker.
 *
 * Real RTZR (VITO) OpenAPI flow, confirmed against https://developers.rtzr.ai/docs/:
 *   POST /v1/authenticate      (form-urlencoded)  -> { access_token, expire_at }
 *   POST /v1/transcribe        (multipart)         -> { id }
 *   GET  /v1/transcribe/{id}                        -> { status, results?, error? }
 */

const DEFAULT_BASE_URL = "https://openapi.vito.ai";
/** Refresh the token slightly before it actually expires to avoid racing a 401. */
const TOKEN_REFRESH_SKEW_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_POLL_TIMEOUT_MS = 60 * 60_000; // 1 hour

async function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RtzrClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Injectable for tests — defaults to a real setTimeout-based sleep. */
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onTick?: (status: "transcribing" | "completed" | "failed") => void;
}

interface AuthResponse {
  access_token: string;
  expire_at: number; // unix seconds
}

interface SubmitResponse {
  id: string;
}

interface PollResponse {
  id: string;
  status: "transcribing" | "completed" | "failed";
  results?: unknown;
  error?: { code?: string; message?: string };
}

/**
 * Class-form client: holds an in-memory token cache so repeated
 * submit/poll calls don't re-authenticate on every request.
 */
export class RtzrClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private cachedToken?: { accessToken: string; expireAtMs: number };

  constructor(
    private readonly creds: RtzrCredentials,
    opts: RtzrClientOptions = {},
  ) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    // Bind, don't pass the bare reference: calling `this.fetchImpl(...)` below
    // invokes it with `this` = the RtzrClient instance, not the receiver the
    // Workers/browser fetch implementation expects, which throws "Illegal
    // invocation" at runtime. Node's fetch is lenient about this and never
    // catches it under vitest — only surfaced by actually running on
    // Cloudflare Workers (see packages/mcp-worker, LESSONS.md #8).
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
    this.sleepImpl = opts.sleepImpl ?? defaultSleep;
  }

  /** Authenticates and caches the bearer token in memory until it's close to expiring. */
  async authenticate(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && now < this.cachedToken.expireAtMs - TOKEN_REFRESH_SKEW_MS) {
      return this.cachedToken.accessToken;
    }

    const body = new URLSearchParams({
      client_id: this.creds.clientId,
      client_secret: this.creds.clientSecret,
    });

    const res = await this.fetchImpl(`${this.baseUrl}/v1/authenticate`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!res.ok) {
      throw await errorFromResponse(res, "authenticate");
    }

    const json = (await res.json()) as AuthResponse;
    this.cachedToken = {
      accessToken: json.access_token,
      expireAtMs: json.expire_at * 1000,
    };
    return this.cachedToken.accessToken;
  }

  /** Uploads audio + config, returns the transcription job id. */
  async submit(
    audio: Blob | Uint8Array,
    filename: string,
    cfg: TranscribeConfig,
  ): Promise<string> {
    const token = await this.authenticate();

    const fd = new FormData();
    const blob = audio instanceof Blob ? audio : new Blob([audio]);
    fd.append("file", blob, filename);
    fd.append("config", JSON.stringify(buildRequestConfig(cfg)));

    const res = await this.fetchImpl(`${this.baseUrl}/v1/transcribe`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
      body: fd,
    });

    if (!res.ok) {
      throw await errorFromResponse(res, "submit");
    }

    const json = (await res.json()) as SubmitResponse;
    return json.id;
  }

  /** Polls a transcription job until it completes, fails, or times out. */
  async poll(id: string, opts: PollOptions = {}): Promise<TranscriptResult> {
    const intervalMs = opts.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const timeoutMs = opts.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const token = await this.authenticate();
      const res = await this.fetchImpl(`${this.baseUrl}/v1/transcribe/${id}`, {
        headers: { accept: "application/json", authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw await errorFromResponse(res, "poll");
      }

      const json = (await res.json()) as PollResponse;
      opts.onTick?.(json.status);

      if (json.status === "completed") {
        return parseTranscript(json);
      }

      if (json.status === "failed") {
        throw new RtzrApiError(
          res.status,
          `transcription ${id} failed${json.error?.message ? `: ${json.error.message}` : ""}`,
          { code: json.error?.code, apiMsg: json.error?.message },
        );
      }

      if (Date.now() >= deadline) {
        throw new RtzrTimeoutError(id, timeoutMs);
      }

      await this.sleepImpl(intervalMs);
    }
  }

  /** Convenience: submit + poll in one call. */
  async transcribe(
    audio: Blob | Uint8Array,
    filename: string,
    cfg: TranscribeConfig,
    pollOpts?: PollOptions,
  ): Promise<TranscriptResult> {
    const id = await this.submit(audio, filename, cfg);
    return this.poll(id, pollOpts);
  }
}

/**
 * Functional convenience wrapper for one-shot callers (e.g. a web server
 * Function that doesn't need to hold a client instance across requests).
 */
export async function transcribe(
  audio: Blob | Uint8Array,
  filename: string,
  opts: RtzrCredentials & TranscribeConfig & { baseUrl?: string },
): Promise<TranscriptResult> {
  const { clientId, clientSecret, baseUrl, ...cfg } = opts;
  const client = new RtzrClient({ clientId, clientSecret }, { baseUrl });
  return client.transcribe(audio, filename, cfg);
}
