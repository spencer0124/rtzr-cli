/**
 * HMAC-SHA256 signing for presigned upload URLs — the `request_upload_url`
 * MCP tool hands out `/uploads/{id}?expires=...&sig=...` for a caller's code
 * execution sandbox to `curl -X PUT` directly (bypassing the model's own
 * context entirely, unlike base64-in-tool-call). See docs/concept.md §8.3
 * and LESSONS.md #9 for why chunked base64 wasn't a real fix.
 *
 * Uses the Web Crypto API (`crypto.subtle`), which is a global in both
 * Cloudflare Workers and Node 18+, so this is testable under plain vitest
 * with no Workers runtime needed.
 */

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string comparison — avoids leaking signature bytes via response-time differences. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Signs `{uploadId}.{expiresAt}` with HMAC-SHA256, hex-encoded. */
export async function signUploadToken(secret: string, uploadId: string, expiresAt: number): Promise<string> {
  const key = await hmacKey(secret);
  const message = new TextEncoder().encode(`${uploadId}.${expiresAt}`);
  const signature = await crypto.subtle.sign("HMAC", key, message);
  return toHex(signature);
}

/**
 * Verifies a presigned upload token: recomputes the expected signature and
 * compares it in constant time, and separately rejects anything past
 * `expiresAt` — a tampered uploadId/expiresAt/secret all produce a
 * non-matching signature, so there's only one check to get right.
 */
export async function verifyUploadToken(
  secret: string,
  uploadId: string,
  expiresAt: number,
  sig: string,
): Promise<boolean> {
  if (Date.now() > expiresAt) return false;
  const expected = await signUploadToken(secret, uploadId, expiresAt);
  return timingSafeEqual(expected, sig);
}
