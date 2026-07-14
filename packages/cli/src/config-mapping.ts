import type { TranscribeConfig } from "@spencer0124/rtzr-core";
import { transcribeConfigSchema } from "@spencer0124/rtzr-core";

export interface CliFlags {
  outputFormat: string;
  outputDir: string;
  language: string;
  model: string;
  diarize?: boolean;
  speakers?: string;
  keywords?: string[];
  itn: boolean;
  profanityFilter?: boolean;
  disfluencyFilter: boolean;
  wordTimestamps?: boolean;
  domain?: string;
  /** Only valid with --model whisper (see core schema rule #3). */
  languageCandidates?: string[];
  paragraphSplitter: boolean;
  paragraphMax?: string;
  json?: boolean;
}

/**
 * Maps parsed CLI flags -> the shared `TranscribeConfig` (validated by core's
 * zod schema). Pulled out of cli.ts so it's independently testable — this is
 * also where a "core added a field the CLI forgot to expose" regression
 * would show up (see the schema-coverage test in config-mapping.test.ts;
 * this exact gap is what happened before languageCandidates/paragraphSplitter
 * were added here, and separately in the MCP tool — see LESSONS.md).
 */
export function toTranscribeConfig(flags: CliFlags): TranscribeConfig {
  const cfg: TranscribeConfig = {
    modelName: flags.model as TranscribeConfig["modelName"],
    language: flags.language as TranscribeConfig["language"],
    languageCandidates: flags.languageCandidates,
    useDiarization: flags.diarize,
    spkCount: flags.speakers !== undefined ? Number(flags.speakers) : undefined,
    keywords: flags.keywords,
    useItn: flags.itn,
    useDisfluencyFilter: flags.disfluencyFilter,
    useProfanityFilter: flags.profanityFilter,
    useParagraphSplitter: flags.paragraphSplitter,
    paragraphSplitterMax: flags.paragraphMax !== undefined ? Number(flags.paragraphMax) : undefined,
    useWordTimestamp: flags.wordTimestamps,
    domain: flags.domain as TranscribeConfig["domain"],
  };
  return transcribeConfigSchema.parse(cfg) as TranscribeConfig;
}
