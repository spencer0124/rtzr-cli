import { describe, expect, it } from "vitest";
import { rtzrCredentialsSchema, transcribeConfigSchema } from "./schema.js";

// This schema is the single source of truth for CLI flag validation (and the
// roadmap MCP tool input schema) — see schema.ts's header comment. A silent
// regression here means the CLI would accept and forward a malformed request
// straight to the RTZR API instead of failing fast with a clear message.
describe("transcribeConfigSchema", () => {
  describe("whisper requires language (cross-field rule)", () => {
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

  describe("keywords", () => {
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

  describe("spkCount", () => {
    it("fails on a negative value", () => {
      const result = transcribeConfigSchema.safeParse({ spkCount: -1 });
      expect(result.success).toBe(false);
    });

    it("fails on a non-integer value", () => {
      const result = transcribeConfigSchema.safeParse({ spkCount: 1.5 });
      expect(result.success).toBe(false);
    });

    it("passes on 0 (auto-detect)", () => {
      const result = transcribeConfigSchema.safeParse({ spkCount: 0 });
      expect(result.success).toBe(true);
    });
  });

  describe("paragraphSplitterMax", () => {
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
