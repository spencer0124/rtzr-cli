/**
 * Core domain types for the RTZR STT client.
 *
 * These types are environment-neutral by design: no `fs`, no `process.env`.
 * Audio is always bytes (`Blob | Uint8Array`), credentials are always passed
 * as arguments. See docs/concept.md §5 for the design rationale — this is
 * what lets the same `core` run unmodified in Node CLI, Cloudflare Workers
 * (MCP), and (roadmap) a Pages Functions web backend.
 */

export interface RtzrCredentials {
  clientId: string;
  clientSecret: string;
}

export interface TranscribeConfig {
  /** RTZR model. `sommers` = RTZR's own model, `whisper` = hosted Whisper. Default: "sommers". */
  modelName?: "sommers" | "whisper";
  /** Default: "ko". */
  language?: "ko" | "ja" | "en" | "detect" | "multi";
  /** Language detection candidates. Only applies when language is "detect" or "multi". */
  languageCandidates?: string[];
  /** Enable speaker diarization (RTZR's differentiator vs. open-source Whisper). */
  useDiarization?: boolean;
  /** Expected speaker count. 0 or undefined = auto-detect. Sent as the nested `diarization.spk_count` field. */
  spkCount?: number;
  /**
   * Keyword boosting: plain words, no per-word score/weight syntax (API has none).
   * `sommers` model: must be spelled out in Korean phonetics (e.g. "에스티티", not "STT").
   * `whisper` model: Korean, English abbreviations, or digits (requires language="ko").
   * Max 20 chars/word, max 500 words.
   */
  keywords?: string[];
  /** Inverse text normalization (e.g. "이십삼" -> "23"). Mirrors API default: true. */
  useItn?: boolean;
  /** Filter disfluencies (um, uh, filler words). Mirrors API default: true. */
  useDisfluencyFilter?: boolean;
  useProfanityFilter?: boolean;
  /** Split output into paragraphs. Mirrors API default: true. */
  useParagraphSplitter?: boolean;
  /** Max characters per paragraph. Only applies when useParagraphSplitter is true. Sent as nested `paragraph_splitter.max`. */
  paragraphSplitterMax?: number;
  useWordTimestamp?: boolean;
  domain?: "GENERAL" | "CALL";
}

export interface Utterance {
  /** Start offset in milliseconds. */
  startAt: number;
  /** Duration in milliseconds. */
  duration: number;
  msg: string;
  /** Speaker index, present only when diarization is enabled. */
  spk?: number;
  /** Speaker type as reported by the API (e.g. "NORMAL"), present alongside spk. */
  spkType?: string;
  /** ISO 639-1 language code: the configured language, or the model's detected language for detect/multi. */
  lang?: string;
}

export interface TranscriptResult {
  utterances: Utterance[];
  /** Raw API response, preserved for --json passthrough and debugging. */
  raw: unknown;
}
