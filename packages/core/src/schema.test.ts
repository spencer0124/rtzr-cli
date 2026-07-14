import { describe, expect, it } from "vitest";
import { rtzrCredentialsSchema, transcribeConfigSchema } from "./schema.js";

// This schema is the single source of truth for CLI flag validation (and the
// roadmap MCP tool input schema) — see schema.ts's header comment. A silent
// regression here means the CLI would accept and forward a malformed request
// straight to the RTZR API instead of failing fast with a clear message.
describe("transcribeConfigSchema", () => {
  // The four cross-field rules below are the hard constraints verified against
  // the live API in docs/rtzr-config-constraints.md §3-A (probe IDs in brackets).
  // Each one corresponds to a real HTTP 400 the API returns, so a regression
  // here means forwarding a request the API is guaranteed to reject.

  describe("#1 whisper requires language [T9]", () => {
    it("fails when modelName is whisper and language is omitted", () => {
      const result = transcribeConfigSchema.safeParse({ modelName: "whisper" });
      expect(result.success).toBe(false);
      if (!result.success) {
        // must be attached to the `language` field specifically, since that's
        // what the CLI/MCP surface would show the error against
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({ path: ["language"], message: 'language is required when modelName is "whisper"' }),
        );
      }
    });

    it("passes when modelName is whisper and language is provided", () => {
      const result = transcribeConfigSchema.safeParse({ modelName: "whisper", language: "en" });
      expect(result.success).toBe(true);
    });

    it("passes when modelName is sommers and language is omitted (rule only applies to whisper)", () => {
      const result = transcribeConfigSchema.safeParse({ modelName: "sommers" });
      expect(result.success).toBe(true);
    });
  });

  describe('#2 "detect"/"multi" language requires whisper [T6]', () => {
    // The `detect` and `multi` language modes are Whisper-only; sommers
    // supports ko/ja exactly. Without this rule a sommers request with
    // language "detect" would be forwarded to the API and rejected there
    // instead of failing fast with a clear local message.
    it('fails when language is "detect" and modelName is omitted (defaults to sommers)', () => {
      const result = transcribeConfigSchema.safeParse({ language: "detect" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({ path: ["language"] }),
        );
      }
    });

    it('fails when language is "multi" and modelName is sommers', () => {
      const result = transcribeConfigSchema.safeParse({ modelName: "sommers", language: "multi" });
      expect(result.success).toBe(false);
    });

    it('passes when language is "detect" and modelName is whisper', () => {
      const result = transcribeConfigSchema.safeParse({ modelName: "whisper", language: "detect" });
      expect(result.success).toBe(true);
    });

    it('passes when language is "multi" and modelName is whisper', () => {
      const result = transcribeConfigSchema.safeParse({ modelName: "whisper", language: "multi" });
      expect(result.success).toBe(true);
    });

    it('passes on a plain language ("ko") with sommers — rule only targets detect/multi', () => {
      const result = transcribeConfigSchema.safeParse({ modelName: "sommers", language: "ko" });
      expect(result.success).toBe(true);
    });
  });

  describe("#3 languageCandidates requires whisper [P1·P5·T7]", () => {
    // The docs claim candidates only apply to detect/multi, but probing showed
    // the real gate is the *model*: sommers + candidates = 400 regardless of
    // language [T7·P5], while whisper + ko + candidates = 200 [P1].
    it("fails when languageCandidates is set and modelName is sommers", () => {
      const result = transcribeConfigSchema.safeParse({
        modelName: "sommers",
        language: "ko",
        languageCandidates: ["ko", "en"],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({ path: ["languageCandidates"] }),
        );
      }
    });

    it("fails when languageCandidates is set and modelName is omitted (defaults to sommers)", () => {
      const result = transcribeConfigSchema.safeParse({ languageCandidates: ["ko", "en"] });
      expect(result.success).toBe(false);
    });

    it('passes with whisper even on a plain language ("ko") — the gate is the model, not detect/multi [P1]', () => {
      const result = transcribeConfigSchema.safeParse({
        modelName: "whisper",
        language: "ko",
        languageCandidates: ["ko", "en"],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("#4 spkCount requires useDiarization [T1·T2]", () => {
    // spk_count without use_diarization: true is a real API 400 ("diarization
    // cannot be used without use_diarization") — previously mapping.ts just
    // silently dropped spkCount in this case instead of failing fast.
    it("fails when spkCount is set and useDiarization is omitted", () => {
      const result = transcribeConfigSchema.safeParse({ spkCount: 2 });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(
          expect.objectContaining({ path: ["spkCount"] }),
        );
      }
    });

    it("fails when spkCount is set and useDiarization is explicitly false [T2]", () => {
      const result = transcribeConfigSchema.safeParse({ useDiarization: false, spkCount: 2 });
      expect(result.success).toBe(false);
    });

    it("passes when spkCount is set alongside useDiarization: true", () => {
      const result = transcribeConfigSchema.safeParse({ useDiarization: true, spkCount: 2 });
      expect(result.success).toBe(true);
    });
  });

  describe("keywords limits (B1 client-side guard)", () => {
    it("fails when a keyword exceeds 20 characters", () => {
      const result = transcribeConfigSchema.safeParse({ keywords: ["a".repeat(21)] });
      expect(result.success).toBe(false);
    });

    it("passes at the 20-character boundary", () => {
      const result = transcribeConfigSchema.safeParse({ keywords: ["a".repeat(20)] });
      expect(result.success).toBe(true);
    });

    it("fails when there are more than 500 keywords", () => {
      const result = transcribeConfigSchema.safeParse({ keywords: Array(501).fill("word") });
      expect(result.success).toBe(false);
    });

    it("passes at the 500-keyword boundary", () => {
      const result = transcribeConfigSchema.safeParse({ keywords: Array(500).fill("word") });
      expect(result.success).toBe(true);
    });
  });

  describe("spkCount range (B1 client-side guard)", () => {
    // useDiarization: true in every case so these only exercise the B1 range
    // bound, not the #4 cross-field rule above.
    it("fails on a negative value", () => {
      const result = transcribeConfigSchema.safeParse({ useDiarization: true, spkCount: -1 });
      expect(result.success).toBe(false);
    });

    it("fails on a non-integer value", () => {
      const result = transcribeConfigSchema.safeParse({ useDiarization: true, spkCount: 1.5 });
      expect(result.success).toBe(false);
    });

    it("passes on 0 (auto-detect)", () => {
      const result = transcribeConfigSchema.safeParse({ useDiarization: true, spkCount: 0 });
      expect(result.success).toBe(true);
    });
  });

  describe("paragraphSplitterMax range (B1 client-side guard)", () => {
    it("fails on 0 (must be at least 1)", () => {
      const result = transcribeConfigSchema.safeParse({ paragraphSplitterMax: 0 });
      expect(result.success).toBe(false);
    });

    it("passes on 1", () => {
      const result = transcribeConfigSchema.safeParse({ paragraphSplitterMax: 1 });
      expect(result.success).toBe(true);
    });
  });

  describe("enum fields", () => {
    it("fails on an unknown modelName", () => {
      const result = transcribeConfigSchema.safeParse({ modelName: "foo" });
      expect(result.success).toBe(false);
    });

    it("fails on an unknown domain", () => {
      const result = transcribeConfigSchema.safeParse({ domain: "OTHER" });
      expect(result.success).toBe(false);
    });
  });

  it("passes on an empty object — every field is optional", () => {
    const result = transcribeConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("rtzrCredentialsSchema", () => {
  it("fails with a specific message when clientId is empty", () => {
    const result = rtzrCredentialsSchema.safeParse({ clientId: "", clientSecret: "secret" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ["clientId"], message: "clientId is required" }),
      );
    }
  });

  it("fails with a specific message when clientSecret is empty", () => {
    const result = rtzrCredentialsSchema.safeParse({ clientId: "id", clientSecret: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: ["clientSecret"], message: "clientSecret is required" }),
      );
    }
  });

  it("passes when both fields are non-empty", () => {
    const result = rtzrCredentialsSchema.safeParse({ clientId: "id", clientSecret: "secret" });
    expect(result.success).toBe(true);
  });
});
