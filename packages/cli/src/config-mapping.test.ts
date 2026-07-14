import { baseTranscribeConfigSchema } from "@spencer0124/rtzr-core";
import { describe, expect, it } from "vitest";
import { toTranscribeConfig, type CliFlags } from "./config-mapping.js";

describe("toTranscribeConfig", () => {
  it("maps the basic flags", () => {
    const cfg = toTranscribeConfig({
      outputFormat: "txt",
      outputDir: ".",
      language: "ko",
      model: "sommers",
      itn: true,
      disfluencyFilter: true,
      paragraphSplitter: true,
    });

    expect(cfg.modelName).toBe("sommers");
    expect(cfg.language).toBe("ko");
  });

  it("maps --diarize/--speakers to useDiarization/spkCount (string -> number)", () => {
    const cfg = toTranscribeConfig({
      outputFormat: "txt",
      outputDir: ".",
      language: "ko",
      model: "sommers",
      itn: true,
      disfluencyFilter: true,
      paragraphSplitter: true,
      diarize: true,
      speakers: "2",
    });

    expect(cfg.useDiarization).toBe(true);
    expect(cfg.spkCount).toBe(2);
  });

  it("maps --language-candidates", () => {
    // whisper: languageCandidates is whisper-only (core schema rule #3), and
    // "detect" itself is whisper-only (rule #2) — sommers here would throw.
    const cfg = toTranscribeConfig({
      outputFormat: "txt",
      outputDir: ".",
      language: "detect",
      model: "whisper",
      itn: true,
      disfluencyFilter: true,
      paragraphSplitter: true,
      languageCandidates: ["ko", "en", "ja"],
    });

    expect(cfg.languageCandidates).toEqual(["ko", "en", "ja"]);
  });

  it("maps --paragraph-splitter/--paragraph-max (string -> number)", () => {
    const cfg = toTranscribeConfig({
      outputFormat: "txt",
      outputDir: ".",
      language: "ko",
      model: "sommers",
      itn: true,
      disfluencyFilter: true,
      paragraphSplitter: false,
      paragraphMax: "80",
    });

    expect(cfg.useParagraphSplitter).toBe(false);
    expect(cfg.paragraphSplitterMax).toBe(80);
  });

  it("maps --word-timestamps", () => {
    const cfg = toTranscribeConfig({
      outputFormat: "txt",
      outputDir: ".",
      language: "ko",
      model: "sommers",
      itn: true,
      disfluencyFilter: true,
      paragraphSplitter: true,
      wordTimestamps: true,
    });

    expect(cfg.useWordTimestamp).toBe(true);
  });

  // Regression test for exactly the gap that motivated this: core's
  // baseTranscribeConfigSchema previously grew fields (languageCandidates,
  // useParagraphSplitter/paragraphSplitterMax) that neither the CLI nor the
  // MCP tool exposed. This fills in every CLI flag and asserts the resulting
  // TranscribeConfig has a defined value for every field the schema knows
  // about — if a new core field ships without a matching flag + mapping,
  // this fails instead of silently dropping the option again.
  it("covers every field in core's baseTranscribeConfigSchema (no silently-dropped options)", () => {
    const allFlags: CliFlags = {
      outputFormat: "txt",
      outputDir: ".",
      language: "detect",
      model: "whisper",
      diarize: true,
      speakers: "2",
      keywords: ["word"],
      itn: true,
      profanityFilter: true,
      disfluencyFilter: true,
      wordTimestamps: true,
      domain: "GENERAL",
      languageCandidates: ["ko", "en"],
      paragraphSplitter: true,
      paragraphMax: "50",
    };

    const cfg = toTranscribeConfig(allFlags) as Record<string, unknown>;

    for (const field of Object.keys(baseTranscribeConfigSchema.shape)) {
      expect(cfg, `expected TranscribeConfig.${field} to be set by some CLI flag`).toHaveProperty(field);
      expect(cfg[field], `CLI flags produced an undefined ${field} — is a flag missing?`).not.toBeUndefined();
    }
  });
});
