import { describe, expect, it, vi } from "vitest";
import { handleTranscribe, resolveAudioInput } from "./handler.js";

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
});

describe("handleTranscribe", () => {
  it("rejects when RTZR credentials are missing from the request headers", async () => {
    const result = await handleTranscribe({ input: "aGk=" }, { clientId: null, clientSecret: null });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/X-RTZR-CLIENT-ID/);
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
