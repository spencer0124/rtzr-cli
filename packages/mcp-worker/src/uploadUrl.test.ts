import { describe, expect, it } from "vitest";
import { signUploadToken, verifyUploadToken } from "./uploadUrl.js";

const SECRET = "test-signing-secret";
const UPLOAD_ID = "11111111-1111-1111-1111-111111111111";

describe("signUploadToken / verifyUploadToken", () => {
  it("accepts a token it just signed, before expiry", async () => {
    const expiresAt = Date.now() + 5 * 60_000;
    const sig = await signUploadToken(SECRET, UPLOAD_ID, expiresAt);

    await expect(verifyUploadToken(SECRET, UPLOAD_ID, expiresAt, sig)).resolves.toBe(true);
  });

  it("is deterministic — same inputs produce the same signature", async () => {
    const expiresAt = Date.now() + 5 * 60_000;
    const sig1 = await signUploadToken(SECRET, UPLOAD_ID, expiresAt);
    const sig2 = await signUploadToken(SECRET, UPLOAD_ID, expiresAt);

    expect(sig1).toBe(sig2);
  });

  it("rejects a tampered signature", async () => {
    const expiresAt = Date.now() + 5 * 60_000;
    const sig = await signUploadToken(SECRET, UPLOAD_ID, expiresAt);
    const tampered = sig.slice(0, -1) + (sig.at(-1) === "a" ? "b" : "a");

    await expect(verifyUploadToken(SECRET, UPLOAD_ID, expiresAt, tampered)).resolves.toBe(false);
  });

  it("rejects a signature computed for a different uploadId", async () => {
    const expiresAt = Date.now() + 5 * 60_000;
    const sig = await signUploadToken(SECRET, UPLOAD_ID, expiresAt);

    await expect(verifyUploadToken(SECRET, "22222222-2222-2222-2222-222222222222", expiresAt, sig)).resolves.toBe(
      false,
    );
  });

  it("rejects a signature computed for a different expiresAt", async () => {
    const expiresAt = Date.now() + 5 * 60_000;
    const sig = await signUploadToken(SECRET, UPLOAD_ID, expiresAt);

    await expect(verifyUploadToken(SECRET, UPLOAD_ID, expiresAt + 1000, sig)).resolves.toBe(false);
  });

  it("rejects a signature signed with a different secret", async () => {
    const expiresAt = Date.now() + 5 * 60_000;
    const sig = await signUploadToken(SECRET, UPLOAD_ID, expiresAt);

    await expect(verifyUploadToken("wrong-secret", UPLOAD_ID, expiresAt, sig)).resolves.toBe(false);
  });

  it("rejects an otherwise-valid token that has expired", async () => {
    const expiresAt = Date.now() - 1000; // already in the past
    const sig = await signUploadToken(SECRET, UPLOAD_ID, expiresAt);

    await expect(verifyUploadToken(SECRET, UPLOAD_ID, expiresAt, sig)).resolves.toBe(false);
  });
});
