import { ZodError } from "zod";

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

/**
 * Core field name -> surface-specific display name, e.g. `spkCount` is
 * `"--speakers"` on the CLI and `"speakers"` on the MCP tool.
 */
export type ConfigFieldLabels = Record<string, string>;

/**
 * Formats a config-validation ZodError into one human-readable line, spoken in
 * the *surface's* vocabulary: schema messages deliberately embed core field
 * names in their text ("language is required when modelName is ..."), so each
 * surface passes a label map and gets errors naming the flags/params the user
 * actually typed ("--language is required when --model is ...") — per
 * clig.dev's "suggest the fix by the name the user can act on" and the MCP
 * guidance that tool errors should let the model self-correct its own inputs.
 *
 * Returns undefined when `err` isn't a ZodError, so callers can pass any
 * caught value and fall back to their own handling — and so CLI/MCP don't
 * need their own zod import just for the instanceof check.
 */
export function formatConfigError(err: unknown, labels: ConfigFieldLabels): string | undefined {
  if (!(err instanceof ZodError)) return undefined;

  // One alternation regex, one pass: replacements are never re-scanned, so a
  // label containing word boundaries (e.g. "--language-candidates") can't be
  // re-matched by a shorter field token ("language") afterwards. Longest
  // names first so the alternation prefers `languageCandidates` over
  // `language` at the same position.
  const fieldNames = Object.keys(labels).sort((a, b) => b.length - a.length);
  const fieldPattern = fieldNames.length > 0 ? new RegExp(`\\b(?:${fieldNames.join("|")})\\b`, "g") : undefined;

  const lines = err.issues.map((issue) => {
    // `?? name` never fires (the pattern only matches keys of `labels`) but
    // keeps the replacer total for noUncheckedIndexedAccess.
    let text = fieldPattern ? issue.message.replace(fieldPattern, (name) => labels[name] ?? name) : issue.message;
    if (issue.path.length > 0) {
      // zod's own messages ("Number must be greater than or equal to 0")
      // don't name the field — prefix it from the issue path. Our schema
      // messages already do (labeled above, or raw when unlabeled), so they
      // get no prefix.
      const field = String(issue.path[0]);
      if (!new RegExp(`\\b${field}\\b`).test(issue.message)) {
        text = `${labels[field] ?? field}: ${text}`;
      }
    }
    return text;
  });

  return lines.join("; ");
}
