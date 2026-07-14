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
  /**
   * Language detection candidates. Whisper-only — the API 400s on sommers even
   * with a plain language, contrary to the docs' "detect/multi only" claim
   * (docs/rtzr-config-constraints.md #3).
   */
  languageCandidates?: string[];
  /** Enable speaker diarization (RTZR's differentiator vs. open-source Whisper). */
  useDiarization?: boolean;
  /**
   * Expected speaker count. 0 or undefined = auto-detect. Sent as the nested
   * `diarization.spk_count` field. Setting it requires useDiarization: true —
   * the API 400s otherwise (docs/rtzr-config-constraints.md #4).
   */
  spkCount?: number;
  /**
   * Keyword boosting: plain words, no per-word score/weight syntax (API has none).
   * `sommers` model: must be spelled out in Korean phonetics (e.g. "에스티티", not "STT").
   * `whisper` model: Korean, English abbreviations, or digits.
   * Only has effect on Korean transcription — the API accepts (and ignores)
   * keywords on other languages rather than rejecting them
   * (docs/rtzr-config-constraints.md C7). Max 20 chars/word, max 500 words.
   */
  keywords?: string[];
  /**
   * Inverse text normalization (e.g. "이십삼" -> "23"). Mirrors API default: true.
   * Only has effect on sommers + ko — the API accepts (and ignores) it elsewhere
   * (docs/rtzr-config-constraints.md C4).
   */
  useItn?: boolean;
  /** Filter disfluencies (um, uh, filler words). Mirrors API default: true. */
  useDisfluencyFilter?: boolean;
  useProfanityFilter?: boolean;
  /** Split output into paragraphs. Mirrors API default: true. */
  useParagraphSplitter?: boolean;
  /**
   * Max characters per paragraph. Sent as nested `paragraph_splitter.max`.
   * Only has effect when useParagraphSplitter is true — the API accepts (and
   * ignores) it with the splitter off (docs/rtzr-config-constraints.md C6).
   */
  paragraphSplitterMax?: number;
  useWordTimestamp?: boolean;
  domain?: "GENERAL" | "CALL";
}

/** One word's timing, present only when `useWordTimestamp` was set. */
export interface WordTimestamp {
  /** Start offset in milliseconds. */
  startAt: number;
  /** Duration in milliseconds. */
  duration: number;
  text: string;
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
  /** Per-word timing, present only when `useWordTimestamp: true` was requested. */
  words?: WordTimestamp[];
}

export interface TranscriptResult {
  utterances: Utterance[];
  /** Raw API response, preserved for --json passthrough and debugging. */
  raw: unknown;
}
