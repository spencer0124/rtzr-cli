import { baseTranscribeConfigSchema } from "@spencer0124/rtzr-core";
import { describe, expect, it, vi } from "vitest";
import { buildTranscribeConfig, handleTranscribe, MCP_FIELD_LABELS, resolveAudioInput, resolveCredentials } from "./handler.js";

const CREDS = { clientId: "id-1", clientSecret: "secret-1" };

function jsonResponse(status: number, body: unknown, statusText = ""): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "content-type": "application/json" },
  });
}

function authOk() {
  const expireAtUnixSeconds = Math.floor(Date.now() / 1000) + 3600;
  return jsonResponse(200, { access_token: "tok-abc", expire_at: expireAtUnixSeconds });
}

function completedPoll(msg: string) {
  return jsonResponse(200, {
    id: "job-1",
    status: "completed",
    results: { utterances: [{ start_at: 0, duration: 100, msg }] },
  });
}

describe("resolveAudioInput", () => {
  it("fetches bytes from an http(s) URL and derives the filename from the path", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } }),
    );

    const { bytes, filename } = await resolveAudioInput("https://example.com/samples/hello.mp3", undefined, fetchImpl);

    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(filename).toBe("hello.mp3");
    expect(fetchImpl).toHaveBeenCalledWith("https://example.com/samples/hello.mp3");
  });

  it("falls back to a Content-Type-derived extension when the URL path has no filename", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      async () => new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "audio/wav" } }),
    );

    const { filename } = await resolveAudioInput("https://example.com/download?id=42", undefined, fetchImpl);

    expect(filename).toBe("audio.wav");
  });

  it("prefers an explicit filename override even for a URL input", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      async () => new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "audio/mpeg" } }),
    );

    const { filename } = await resolveAudioInput("https://example.com/samples/hello.mp3", "custom.wav", fetchImpl);

    expect(filename).toBe("custom.wav");
  });

  it("throws when fetching the URL fails", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response("not found", { status: 404 }));

    await expect(resolveAudioInput("https://example.com/missing.mp3", undefined, fetchImpl)).rejects.toThrow(
      /HTTP 404/,
    );
  });

  it("decodes a non-URL input as base64 and defaults the filename", async () => {
    // "hi" base64-encoded
    const { bytes, filename } = await resolveAudioInput("aGk=", undefined);

    expect(new TextDecoder().decode(bytes)).toBe("hi");
    expect(filename).toBe("audio.mp3");
  });

  it("uses an explicit filename for base64 input", async () => {
    const { filename } = await resolveAudioInput("aGk=", "clip.wav");
    expect(filename).toBe("clip.wav");
  });

  it("decodes a base64 input just under the inline size limit without throwing", async () => {
    // 1,000,000 raw bytes (~1MB) — comfortably under the 3MB guard
    const oneMbBase64 = btoa("x".repeat(1_000_000));
    const { bytes } = await resolveAudioInput(oneMbBase64, undefined);
    expect(bytes.length).toBe(1_000_000);
  });

  it("rejects base64 input over the inline size limit with a message pointing to URL/upload_chunk", async () => {
    // length chosen so the *estimated* decoded size (length * 3/4) clears 3MB
    // without actually needing to construct real audio data.
    const oversized = "A".repeat(4_300_000);
    await expect(resolveAudioInput(oversized, undefined)).rejects.toThrow(/upload_chunk/);
    await expect(resolveAudioInput(oversized, undefined)).rejects.toThrow(/http\(s\) URL/);
  });
});

describe("resolveCredentials", () => {
  it("prefers BYO-key headers over the demo fallback env secret", () => {
    const headers = new Headers({ "X-RTZR-CLIENT-ID": "header-id", "X-RTZR-CLIENT-SECRET": "header-secret" });

    const creds = resolveCredentials(headers, { RTZR_CLIENT_ID: "env-id", RTZR_CLIENT_SECRET: "env-secret" });

    expect(creds).toEqual({ clientId: "header-id", clientSecret: "header-secret" });
  });

  it("falls back to the env demo secret when no BYO-key headers are sent", () => {
    const headers = new Headers();

    const creds = resolveCredentials(headers, { RTZR_CLIENT_ID: "env-id", RTZR_CLIENT_SECRET: "env-secret" });

    expect(creds).toEqual({ clientId: "env-id", clientSecret: "env-secret" });
  });

  it("resolves clientId and clientSecret independently (no mixing a header value with the wrong env fallback)", () => {
    const headers = new Headers({ "X-RTZR-CLIENT-ID": "header-id" }); // secret header omitted

    const creds = resolveCredentials(headers, { RTZR_CLIENT_ID: "env-id", RTZR_CLIENT_SECRET: "env-secret" });

    expect(creds).toEqual({ clientId: "header-id", clientSecret: "env-secret" });
  });

  it("returns nulls when neither headers nor env demo secrets are configured", () => {
    const creds = resolveCredentials(new Headers(), {});

    expect(creds).toEqual({ clientId: null, clientSecret: null });
  });
});

describe("buildTranscribeConfig", () => {
  it("defaults language to ko when model isn't whisper", () => {
    const cfg = buildTranscribeConfig({ input: "aGk=" });
    expect(cfg.language).toBe("ko");
  });

  it("leaves language undefined for whisper with no language given (lets the schema's cross-field check catch it)", () => {
    const cfg = buildTranscribeConfig({ input: "aGk=", model: "whisper" });
    expect(cfg.language).toBeUndefined();
  });

  it("maps languageCandidates/itn/disfluencyFilter/profanityFilter/paragraphSplitter/paragraphSplitterMax/wordTimestamps", () => {
    const cfg = buildTranscribeConfig({
      input: "aGk=",
      languageCandidates: ["ko", "en"],
      itn: false,
      disfluencyFilter: false,
      profanityFilter: true,
      paragraphSplitter: false,
      paragraphSplitterMax: 80,
      wordTimestamps: true,
    });

    expect(cfg.languageCandidates).toEqual(["ko", "en"]);
    expect(cfg.useItn).toBe(false);
    expect(cfg.useDisfluencyFilter).toBe(false);
    expect(cfg.useProfanityFilter).toBe(true);
    expect(cfg.useParagraphSplitter).toBe(false);
    expect(cfg.paragraphSplitterMax).toBe(80);
    expect(cfg.useWordTimestamp).toBe(true);
  });

  // Regression test for the exact gap that motivated this: core's
  // baseTranscribeConfigSchema grew fields (languageCandidates, itn,
  // disfluencyFilter, profanityFilter, paragraphSplitter/Max, wordTimestamps)
  // that this tool's inputSchema didn't expose — a real client hit this
  // trying to request word timestamps. Filling every tool input field and
  // checking the built config covers every schema field catches that class
  // of drift instead of relying on someone remembering to update both places.
  it("covers every field in core's baseTranscribeConfigSchema (no silently-dropped options)", () => {
    const cfg = buildTranscribeConfig({
      input: "aGk=",
      model: "whisper",
      language: "en",
      languageCandidates: ["ko", "en"],
      diarize: true,
      speakers: 2,
      keywords: ["word"],
      itn: true,
      disfluencyFilter: true,
      profanityFilter: true,
      paragraphSplitter: true,
      paragraphSplitterMax: 50,
      wordTimestamps: true,
      domain: "GENERAL",
    }) as Record<string, unknown>;

    for (const field of Object.keys(baseTranscribeConfigSchema.shape)) {
      expect(cfg, `expected the built config to set ${field}`).toHaveProperty(field);
      expect(cfg[field], `built config had an undefined ${field} — is a tool input field missing?`).not.toBeUndefined();
    }
  });

  // Same drift guard as above, for the error-label map: a core field without a
  // label would make validation errors leak the core-internal name (e.g.
  // "spkCount") instead of the tool parameter the model sent ("speakers").
  it("MCP_FIELD_LABELS labels every field in core's baseTranscribeConfigSchema", () => {
    for (const field of Object.keys(baseTranscribeConfigSchema.shape)) {
      expect(MCP_FIELD_LABELS[field], `no tool-param label for core field ${field}`).toBeTruthy();
    }
  });
});

describe("handleTranscribe", () => {
  it("rejects when RTZR credentials are missing from the request headers", async () => {
    const result = await handleTranscribe({ input: "aGk=" }, { clientId: null, clientSecret: null });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/X-RTZR-CLIENT-ID/);
  });

  it("uses preResolvedAudio directly, skipping resolveAudioInput/fetch entirely for `input`", async () => {
    // index.ts uses this for its own uploaded files (read straight out of R2 in
    // the same Worker invocation) — a Worker fetching its own public URL back
    // isn't reliable (production 522s), so this path never touches `input` at all.
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authOk())
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-1" }))
      .mockResolvedValueOnce(completedPoll("from upload"));

    const result = await handleTranscribe({ input: "ignored-should-never-be-read" }, CREDS, {
      fetchImpl,
      preResolvedAudio: { bytes: new Uint8Array([1, 2, 3]), filename: "clip.mp3" },
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("from upload");
    // only auth+submit+poll — no extra fetch for `input` itself
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("transcribes base64 input and returns plain text by default", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authOk())
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-1" }))
      .mockResolvedValueOnce(completedPoll("안녕하세요"));

    const result = await handleTranscribe({ input: "aGk=" }, CREDS, { fetchImpl });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe("안녕하세요");
  });

  it("fetches a URL input, then submits+polls, then formats as srt with speaker labels when diarize is set", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })) // audio fetch
      .mockResolvedValueOnce(authOk())
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-2" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: "job-2",
          status: "completed",
          results: { utterances: [{ start_at: 0, duration: 1000, msg: "hi", spk: 0 }] },
        }),
      );

    const result = await handleTranscribe(
      { input: "https://example.com/a.wav", diarize: true, format: "srt" },
      CREDS,
      { fetchImpl },
    );

    expect(result.content[0].text).toContain("[Speaker 0] hi");
    expect(result.content[0].text).toContain("00:00:00,000 --> 00:00:01,000");
  });

  it("returns json format as the raw API response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authOk())
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-1" }))
      .mockResolvedValueOnce(completedPoll("json test"));

    const result = await handleTranscribe({ input: "aGk=", format: "json" }, CREDS, { fetchImpl });

    // toJson serializes the raw *poll* response body (what completedPoll returns),
    // not the submit response — its id is what's expected here.
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe("job-1");
    expect(parsed.status).toBe("completed");
  });

  it("rejects whisper without a language before ever calling the RTZR API", async () => {
    const fetchImpl = vi.fn();

    const result = await handleTranscribe({ input: "aGk=", model: "whisper", language: undefined }, CREDS, {
      fetchImpl,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/language/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // The two rejections below are core schema rules #3/#4 (verified API 400s,
  // docs/rtzr-config-constraints.md §3-A) — the rules themselves are covered
  // by core's schema.test.ts; these only check they surface as tool errors
  // before any API call.
  it("rejects speakers without diarize before ever calling the RTZR API, in tool-param vocabulary", async () => {
    const fetchImpl = vi.fn();

    const result = await handleTranscribe({ input: "aGk=", speakers: 2 }, CREDS, { fetchImpl });

    expect(result.isError).toBe(true);
    // names the params the calling model actually sent, not core internals —
    // that's what lets it self-correct the next call
    expect(result.content[0].text).toMatch(/speakers/);
    expect(result.content[0].text).toMatch(/diarize/);
    expect(result.content[0].text).not.toMatch(/spkCount|useDiarization/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects languageCandidates on a non-whisper model before ever calling the RTZR API", async () => {
    const fetchImpl = vi.fn();

    const result = await handleTranscribe(
      { input: "aGk=", model: "sommers", languageCandidates: ["ko", "en"] },
      CREDS,
      { fetchImpl },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/languageCandidates/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces an RtzrApiError from the RTZR API as a tool error result", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authOk())
      .mockResolvedValueOnce(jsonResponse(413, { code: "H0005", msg: "file too large" }));

    const result = await handleTranscribe({ input: "aGk=" }, CREDS, { fetchImpl });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/H0005/);
    expect(result.content[0].text).toMatch(/file too large/);
  });
});
