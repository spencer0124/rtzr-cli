import { describe, expect, it, vi } from "vitest";
import { RtzrClient, transcribe } from "./client.js";
import { RtzrApiError, RtzrTimeoutError, errorFromResponse } from "./errors.js";

const CREDS = { clientId: "id-1", clientSecret: "secret-1" };

function jsonResponse(status: number, body: unknown, statusText = ""): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "content-type": "application/json" },
  });
}

function authOk(expireAtUnixSeconds: number) {
  return jsonResponse(200, { access_token: "tok-abc", expire_at: expireAtUnixSeconds });
}

const noopSleep = async () => {};

describe("RtzrClient.authenticate", () => {
  it("caches the token across calls until it's close to expiring", async () => {
    const farFutureExpiry = Math.floor(Date.now() / 1000) + 6 * 3600; // 6h from now
    const fetchImpl = vi.fn().mockResolvedValue(authOk(farFutureExpiry));
    const client = new RtzrClient(CREDS, { fetchImpl, sleepImpl: noopSleep });

    const t1 = await client.authenticate();
    const t2 = await client.authenticate();

    expect(t1).toBe("tok-abc");
    expect(t2).toBe("tok-abc");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("re-authenticates once the cached token is within the refresh skew of expiring", async () => {
    const almostExpired = Math.floor(Date.now() / 1000) + 30; // 30s from now < 60s skew
    // A fresh Response per call — Response bodies can only be read once, so
    // reusing a single instance across calls would break the second .json().
    const fetchImpl = vi.fn().mockImplementation(async () => authOk(almostExpired));
    const client = new RtzrClient(CREDS, { fetchImpl, sleepImpl: noopSleep });

    await client.authenticate();
    await client.authenticate();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("sends client_id/client_secret as x-www-form-urlencoded", async () => {
    const farFutureExpiry = Math.floor(Date.now() / 1000) + 3600;
    const fetchImpl = vi.fn().mockResolvedValue(authOk(farFutureExpiry));
    const client = new RtzrClient(CREDS, { fetchImpl, sleepImpl: noopSleep });

    await client.authenticate();

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://openapi.vito.ai/v1/authenticate");
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(init.body).toBeInstanceOf(URLSearchParams);
    expect((init.body as URLSearchParams).get("client_id")).toBe("id-1");
    expect((init.body as URLSearchParams).get("client_secret")).toBe("secret-1");
  });

  it("throws RtzrApiError on a non-2xx auth response", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () => jsonResponse(401, { code: "H0002", msg: "invalid credential" }));
    const client = new RtzrClient(CREDS, { fetchImpl, sleepImpl: noopSleep });

    await expect(client.authenticate()).rejects.toThrow(RtzrApiError);
    await expect(client.authenticate()).rejects.toMatchObject({ httpStatus: 401, code: "H0002" });
  });
});

describe("RtzrClient.submit", () => {
  it("uploads file + config as multipart form data with a bearer token", async () => {
    const farFutureExpiry = Math.floor(Date.now() / 1000) + 3600;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authOk(farFutureExpiry))
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-1" }));
    const client = new RtzrClient(CREDS, { fetchImpl, sleepImpl: noopSleep });

    const id = await client.submit(new Uint8Array([1, 2, 3]), "sample.wav", {
      useDiarization: true,
      spkCount: 2,
    });

    expect(id).toBe("job-1");
    const [url, init] = fetchImpl.mock.calls[1];
    expect(url).toBe("https://openapi.vito.ai/v1/transcribe");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer tok-abc");
    expect(init.body).toBeInstanceOf(FormData);

    const fd = init.body as FormData;
    const file = fd.get("file") as File;
    expect(file.name).toBe("sample.wav");
    const config = JSON.parse(fd.get("config") as string);
    expect(config).toEqual({ use_diarization: true, diarization: { spk_count: 2 } });
  });

  it("throws RtzrApiError on a non-2xx submit response", async () => {
    const farFutureExpiry = Math.floor(Date.now() / 1000) + 3600;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authOk(farFutureExpiry))
      .mockResolvedValueOnce(jsonResponse(413, { code: "H0005", msg: "file too large" }));
    const client = new RtzrClient(CREDS, { fetchImpl, sleepImpl: noopSleep });

    await expect(
      client.submit(new Uint8Array([1]), "big.wav", {}),
    ).rejects.toMatchObject({ httpStatus: 413, code: "H0005" });
  });

  it("accepts a Blob directly instead of wrapping it (audio instanceof Blob branch)", async () => {
    const farFutureExpiry = Math.floor(Date.now() / 1000) + 3600;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authOk(farFutureExpiry))
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-2" }));
    const client = new RtzrClient(CREDS, { fetchImpl, sleepImpl: noopSleep });

    const id = await client.submit(new Blob(["fake audio bytes"]), "sample.wav", {});

    expect(id).toBe("job-2");
    const fd = fetchImpl.mock.calls[1][1].body as FormData;
    const file = fd.get("file") as File;
    expect(file.name).toBe("sample.wav");
    expect(await file.text()).toBe("fake audio bytes");
  });
});

describe("RtzrClient.poll", () => {
  const farFutureExpiry = Math.floor(Date.now() / 1000) + 3600;

  it("polls until status transitions to completed and parses the result", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authOk(farFutureExpiry))
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-1", status: "transcribing" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: "job-1",
          status: "completed",
          results: { utterances: [{ start_at: 0, duration: 100, msg: "hi", spk: 0 }] },
        }),
      );
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const client = new RtzrClient(CREDS, { fetchImpl, sleepImpl });
    const onTick = vi.fn();

    const result = await client.poll("job-1", { onTick });

    expect(onTick.mock.calls.map((c) => c[0])).toEqual(["transcribing", "completed"]);
    expect(result.utterances).toEqual([{ startAt: 0, duration: 100, msg: "hi", spk: 0, spkType: undefined, lang: undefined }]);
    expect(sleepImpl).toHaveBeenCalledTimes(1);
  });

  it("throws RtzrApiError when status is failed", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authOk(farFutureExpiry))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: "job-1",
          status: "failed",
          error: { code: "E500", message: "internal server error" },
        }),
      );
    const client = new RtzrClient(CREDS, { fetchImpl, sleepImpl: noopSleep });

    await expect(client.poll("job-1")).rejects.toMatchObject({
      code: "E500",
      apiMsg: "internal server error",
    });
  });

  it("throws RtzrTimeoutError when the deadline is exceeded", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authOk(farFutureExpiry))
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-1", status: "transcribing" }));
    const client = new RtzrClient(CREDS, { fetchImpl, sleepImpl: noopSleep });

    await expect(client.poll("job-1", { timeoutMs: 0 })).rejects.toThrow(RtzrTimeoutError);
  });

  it("throws RtzrApiError on a non-2xx poll response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authOk(farFutureExpiry))
      .mockResolvedValueOnce(jsonResponse(404, { code: "H0004", msg: "not found" }));
    const client = new RtzrClient(CREDS, { fetchImpl, sleepImpl: noopSleep });

    await expect(client.poll("missing-job")).rejects.toMatchObject({
      httpStatus: 404,
      code: "H0004",
    });
  });
});

describe("RtzrClient.transcribe", () => {
  it("submits then polls to a completed result, reusing the cached token across both calls", async () => {
    const farFutureExpiry = Math.floor(Date.now() / 1000) + 3600;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authOk(farFutureExpiry)) // authenticate, triggered by submit
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-9" })) // submit
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: "job-9",
          status: "completed",
          results: { utterances: [{ start_at: 0, duration: 10, msg: "hi" }] },
        }),
      ); // poll
    const client = new RtzrClient(CREDS, { fetchImpl, sleepImpl: noopSleep });

    const result = await client.transcribe(new Uint8Array([1]), "sample.wav", {});

    expect(result.utterances).toEqual([
      { startAt: 0, duration: 10, msg: "hi", spk: undefined, spkType: undefined, lang: undefined },
    ]);
    // exactly 3 calls (auth + submit + poll) — if poll had re-authenticated
    // instead of reusing the token cached during submit, this would be 4.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe("RtzrClient baseUrl handling", () => {
  it("strips a trailing slash from a custom baseUrl before building request URLs", async () => {
    const farFutureExpiry = Math.floor(Date.now() / 1000) + 3600;
    const fetchImpl = vi.fn().mockResolvedValue(authOk(farFutureExpiry));
    const client = new RtzrClient(CREDS, {
      baseUrl: "https://custom.example.com/",
      fetchImpl,
      sleepImpl: noopSleep,
    });

    await client.authenticate();

    const [url] = fetchImpl.mock.calls[0];
    // a naive string concat would produce a double slash: ".../v1/authenticate" not ".../..//v1/authenticate"
    expect(url).toBe("https://custom.example.com/v1/authenticate");
  });
});

describe("transcribe (standalone function)", () => {
  it("builds a fresh client from the given credentials/baseUrl and forwards the remaining config", async () => {
    const farFutureExpiry = Math.floor(Date.now() / 1000) + 3600;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(authOk(farFutureExpiry))
      .mockResolvedValueOnce(jsonResponse(200, { id: "job-5" }))
      .mockResolvedValueOnce(
        jsonResponse(200, { id: "job-5", status: "completed", results: { utterances: [] } }),
      );
    // the standalone function has no fetchImpl injection point (it always
    // constructs its own RtzrClient), so global fetch has to be stubbed here.
    vi.stubGlobal("fetch", fetchImpl);

    try {
      const result = await transcribe(new Uint8Array([1]), "sample.wav", {
        clientId: "id-1",
        clientSecret: "secret-1",
        baseUrl: "https://custom.example.com",
        useDiarization: true,
        spkCount: 2,
      });

      expect(result.utterances).toEqual([]);
      for (const [url] of fetchImpl.mock.calls) {
        expect(url as string).toMatch(/^https:\/\/custom\.example\.com\/v1\//);
      }
      // clientId/clientSecret/baseUrl must NOT leak into the transcribe config
      // body — only the remaining TranscribeConfig fields should reach it.
      const submitInit = fetchImpl.mock.calls[1][1] as RequestInit;
      const config = JSON.parse((submitInit.body as FormData).get("config") as string);
      expect(config).toEqual({ use_diarization: true, diarization: { spk_count: 2 } });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("errorFromResponse", () => {
  it("falls back to statusText when the error response body isn't JSON", async () => {
    const response = new Response("<html>Bad Gateway</html>", { status: 502, statusText: "Bad Gateway" });

    const error = await errorFromResponse(response, "poll");

    expect(error).toBeInstanceOf(RtzrApiError);
    expect(error.httpStatus).toBe(502);
    expect(error.code).toBeUndefined();
    expect(error.apiMsg).toBeUndefined();
    expect(error.message).toBe("poll failed with HTTP 502 (Bad Gateway)");
  });

  it("falls back to statusText when the body has a code but no msg", async () => {
    const response = jsonResponse(500, { code: "E999" }, "Internal Server Error");

    const error = await errorFromResponse(response, "submit");

    expect(error.code).toBe("E999");
    expect(error.apiMsg).toBeUndefined();
    // detail composition only kicks in when apiMsg is present — code alone
    // isn't enough, so this must read statusText, not "E999: undefined".
    expect(error.message).toBe("submit failed with HTTP 500 (Internal Server Error)");
  });
});
