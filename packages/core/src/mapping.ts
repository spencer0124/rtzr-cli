import type { TranscribeConfig, TranscriptResult, Utterance } from "./types.js";

/**
 * Pure mapping functions between our camelCase `TranscribeConfig`/`TranscriptResult`
 * and the RTZR API's snake_case wire format. Kept separate from client.ts so they're
 * trivially unit-testable without mocking fetch. See internal-docs/concept.md §5.
 */

/**
 * Builds the `config` JSON object sent as a multipart field to POST /v1/transcribe.
 * Two API quirks this must get right (see internal-docs/concept.md — corrected from initial
 * assumptions after reading the real API docs):
 *  - `spk_count` is nested under `diarization`, not a flat field.
 *  - `keywords` is a plain string array; there is no per-word score/weight syntax.
 * Fields left undefined in the input are omitted entirely rather than sent as null,
 * so the API's own defaults apply.
 */
export function buildRequestConfig(cfg: TranscribeConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  if (cfg.modelName !== undefined) out.model_name = cfg.modelName;
  if (cfg.language !== undefined) out.language = cfg.language;
  if (cfg.languageCandidates !== undefined) out.language_candidates = cfg.languageCandidates;

  if (cfg.useDiarization !== undefined) {
    out.use_diarization = cfg.useDiarization;
    if (cfg.useDiarization) {
      out.diarization = { spk_count: cfg.spkCount ?? 0 };
    }
  }

  if (cfg.useItn !== undefined) out.use_itn = cfg.useItn;
  if (cfg.useDisfluencyFilter !== undefined) out.use_disfluency_filter = cfg.useDisfluencyFilter;
  if (cfg.useProfanityFilter !== undefined) out.use_profanity_filter = cfg.useProfanityFilter;

  if (cfg.useParagraphSplitter !== undefined) out.use_paragraph_splitter = cfg.useParagraphSplitter;
  // Deliberately not gated on useParagraphSplitter: the API accepts
  // paragraph_splitter.max on its own (it only has *effect* when the splitter
  // is on) — see docs/rtzr-config-constraints.md C6/T3.
  if (cfg.paragraphSplitterMax !== undefined) {
    out.paragraph_splitter = { max: cfg.paragraphSplitterMax };
  }

  if (cfg.domain !== undefined) out.domain = cfg.domain;
  if (cfg.useWordTimestamp !== undefined) out.use_word_timestamp = cfg.useWordTimestamp;
  if (cfg.keywords !== undefined) out.keywords = cfg.keywords;

  return out;
}

interface RawWordTimestamp {
  start_at: number;
  duration: number;
  text: string;
}

interface RawUtterance {
  start_at: number;
  duration: number;
  msg: string;
  spk?: number;
  spk_type?: string;
  lang?: string;
  /** Present only when the request set `use_word_timestamp: true`. */
  words?: RawWordTimestamp[];
}

interface RawCompletedResponse {
  id: string;
  status: "completed";
  results?: { utterances?: RawUtterance[] };
}

/** Parses a `status: "completed"` GET /v1/transcribe/{id} response into our TranscriptResult. */
export function parseTranscript(raw: unknown): TranscriptResult {
  const body = raw as RawCompletedResponse;
  const rawUtterances = body.results?.utterances ?? [];

  const utterances: Utterance[] = rawUtterances.map((u) => ({
    startAt: u.start_at,
    duration: u.duration,
    msg: u.msg,
    spk: u.spk,
    spkType: u.spk_type,
    lang: u.lang,
    words: u.words?.map((w) => ({ startAt: w.start_at, duration: w.duration, text: w.text })),
  }));

  return { utterances, raw };
}
