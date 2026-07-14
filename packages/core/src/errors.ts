/**
 * Error types for the RTZR API client.
 *
 * RTZR's failure responses are consistently shaped as `{ code, msg }` across
 * all three endpoints (see docs/concept.md and the RTZR API docs' error
 * tables), so a single error class covers auth, submit, and poll failures.
 */
export class RtzrApiError extends Error {
  readonly httpStatus: number;
  readonly code?: string;
  readonly apiMsg?: string;

  constructor(httpStatus: number, message: string, opts?: { code?: string; apiMsg?: string }) {
    super(message);
    this.name = "RtzrApiError";
    this.httpStatus = httpStatus;
    this.code = opts?.code;
    this.apiMsg = opts?.apiMsg;
  }
}

/** Builds an RtzrApiError from a non-2xx HTTP response body, which is usually `{code, msg}`. */
export async function errorFromResponse(response: Response, context: string): Promise<RtzrApiError> {
  let code: string | undefined;
  let apiMsg: string | undefined;
  try {
    const body = (await response.json()) as { code?: string; msg?: string };
    code = body.code;
    apiMsg = body.msg;
  } catch {
    // response body wasn't JSON (or was empty) — fall back to status text only
  }

  const detail = apiMsg ? `${code ? `${code}: ` : ""}${apiMsg}` : response.statusText;
  return new RtzrApiError(
    response.status,
    `${context} failed with HTTP ${response.status}${detail ? ` (${detail})` : ""}`,
    { code, apiMsg },
  );
}

/** Thrown by RtzrClient.poll() when the job doesn't reach a terminal state before timeoutMs. */
export class RtzrTimeoutError extends Error {
  constructor(transcribeId: string, timeoutMs: number) {
    super(`Transcription ${transcribeId} did not complete within ${timeoutMs}ms`);
    this.name = "RtzrTimeoutError";
  }
}
