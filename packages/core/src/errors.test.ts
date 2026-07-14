import { describe, expect, it } from "vitest";
import { formatConfigError, type ConfigFieldLabels } from "./errors.js";
import { transcribeConfigSchema } from "./schema.js";

// Exercises the formatter against *real* ZodErrors produced by the actual
// config schema — not hand-built issue objects — so these tests break if the
// schema's message wording and the formatter's substitution drift apart.

const CLI_STYLE_LABELS: ConfigFieldLabels = {
  modelName: "--model",
  language: "--language",
  languageCandidates: "--language-candidates",
  useDiarization: "--diarize",
  spkCount: "--speakers",
};

function schemaError(config: unknown) {
  const result = transcribeConfigSchema.safeParse(config);
  if (result.success) throw new Error("expected the config to fail validation");
  return result.error;
}

describe("formatConfigError", () => {
  it("returns undefined for non-ZodError values (caller falls back to its own handling)", () => {
    expect(formatConfigError(new Error("boom"), CLI_STYLE_LABELS)).toBeUndefined();
    expect(formatConfigError("just a string", CLI_STYLE_LABELS)).toBeUndefined();
    expect(formatConfigError(undefined, CLI_STYLE_LABELS)).toBeUndefined();
  });

  it("substitutes core field names in the message text with surface labels (rule #4)", () => {
    const err = schemaError({ spkCount: 2 });
    expect(formatConfigError(err, CLI_STYLE_LABELS)).toBe("--speakers requires --diarize");
  });

  it("substitutes multiple field tokens in one message (rule #1)", () => {
    const err = schemaError({ modelName: "whisper" });
    expect(formatConfigError(err, CLI_STYLE_LABELS)).toBe('--language is required when --model is "whisper"');
  });

  it("does not corrupt languageCandidates via the shorter `language` token (rule #3)", () => {
    const err = schemaError({ modelName: "sommers", language: "ko", languageCandidates: ["ko", "en"] });
    expect(formatConfigError(err, CLI_STYLE_LABELS)).toBe(
      '--language-candidates is only supported when --model is "whisper"',
    );
  });

  it("prefixes the field label when the message itself doesn't name the field (B1 zod default messages)", () => {
    const err = schemaError({ useDiarization: true, spkCount: -1 });
    expect(formatConfigError(err, CLI_STYLE_LABELS)).toBe(
      "--speakers: Number must be greater than or equal to 0",
    );
  });

  it('joins multiple issues with "; "', () => {
    // whisper without language (#1) + spkCount without diarization (#4)
    const err = schemaError({ modelName: "whisper", spkCount: 2 });
    expect(formatConfigError(err, CLI_STYLE_LABELS)).toBe(
      '--language is required when --model is "whisper"; --speakers requires --diarize',
    );
  });

  it("falls back to the raw core field name when a label is missing from the map", () => {
    const err = schemaError({ spkCount: 2 });
    expect(formatConfigError(err, {})).toBe("spkCount requires useDiarization");
  });
});
