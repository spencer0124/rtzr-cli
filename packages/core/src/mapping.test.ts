import { describe, expect, it } from "vitest";
import { buildRequestConfig, parseTranscript } from "./mapping.js";

describe("buildRequestConfig", () => {
  it("maps camelCase fields to snake_case", () => {
    const out = buildRequestConfig({
      modelName: "sommers",
      language: "ko",
      useItn: false,
      useDisfluencyFilter: true,
      useProfanityFilter: true,
      useWordTimestamp: true,
      domain: "CALL",
    });
    expect(out).toEqual({
      model_name: "sommers",
      language: "ko",
      use_itn: false,
      use_disfluency_filter: true,
      use_profanity_filter: true,
      use_word_timestamp: true,
      domain: "CALL",
    });
  });

  it("maps languageCandidates to language_candidates", () => {
    const out = buildRequestConfig({ languageCandidates: ["ko", "en"] });
    expect(out).toEqual({ language_candidates: ["ko", "en"] });
  });

  it("nests spk_count under diarization when useDiarization is true", () => {
    const out = buildRequestConfig({ useDiarization: true, spkCount: 3 });
    expect(out).toEqual({
      use_diarization: true,
      diarization: { spk_count: 3 },
    });
  });

  it("defaults spk_count to 0 (auto) when useDiarization is true but spkCount is omitted", () => {
    const out = buildRequestConfig({ useDiarization: true });
    expect(out).toEqual({
      use_diarization: true,
      diarization: { spk_count: 0 },
    });
  });

  it("does not emit a diarization object when useDiarization is false", () => {
    // (no spkCount here — spkCount without useDiarization: true is rejected
    // upstream by transcribeConfigSchema rule #4, so mapping never sees it)
    const out = buildRequestConfig({ useDiarization: false });
    expect(out).toEqual({ use_diarization: false });
    expect(out.diarization).toBeUndefined();
  });

  it("passes keywords through as a plain string array (no score/weight syntax)", () => {
    const out = buildRequestConfig({ keywords: ["에스티티", "에이피아이"] });
    expect(out).toEqual({ keywords: ["에스티티", "에이피아이"] });
  });

  it("nests paragraph_splitter.max alongside use_paragraph_splitter", () => {
    const out = buildRequestConfig({ useParagraphSplitter: true, paragraphSplitterMax: 80 });
    expect(out).toEqual({
      use_paragraph_splitter: true,
      paragraph_splitter: { max: 80 },
    });
  });

  it("emits paragraph_splitter.max even without the useParagraphSplitter flag", () => {
    // paragraph_splitter.max has no hard coupling to use_paragraph_splitter —
    // the API accepts max on its own (docs/rtzr-config-constraints.md T3), so
    // silently dropping it here would hide the caller's intent for no reason.
    const out = buildRequestConfig({ paragraphSplitterMax: 80 });
    expect(out).toEqual({ paragraph_splitter: { max: 80 } });
  });

  it("omits undefined fields entirely rather than sending null", () => {
    const out = buildRequestConfig({});
    expect(out).toEqual({});
    expect(Object.keys(out)).toHaveLength(0);
  });
});

describe("parseTranscript", () => {
  it("maps snake_case utterance fields to camelCase and preserves raw", () => {
    const raw = {
      id: "abc123",
      status: "completed",
      results: {
        utterances: [
          { start_at: 4737, duration: 2360, msg: "안녕하세요.", spk: 0, spk_type: "NORMAL", lang: "ko" },
          { start_at: 8197, duration: 3280, msg: "네, 안녕하세요? 반갑습니다.", spk: 1, lang: "ko" },
        ],
      },
    };

    const result = parseTranscript(raw);

    expect(result.utterances).toEqual([
      { startAt: 4737, duration: 2360, msg: "안녕하세요.", spk: 0, spkType: "NORMAL", lang: "ko" },
      { startAt: 8197, duration: 3280, msg: "네, 안녕하세요? 반갑습니다.", spk: 1, spkType: undefined, lang: "ko" },
    ]);
    expect(result.raw).toBe(raw);
  });

  it("returns an empty utterances array when results is missing", () => {
    const raw = { id: "abc123", status: "completed" };
    expect(parseTranscript(raw).utterances).toEqual([]);
  });

  it("maps per-word timestamps (use_word_timestamp: true response) to camelCase", () => {
    // Shape confirmed against https://developers.rtzr.ai/docs/stt-file/word_timestamp/
    const raw = {
      id: "abc123",
      status: "completed",
      results: {
        utterances: [
          {
            start_at: 3108,
            duration: 1590,
            spk: 1,
            spk_type: "NORMAL",
            msg: "안녕하세요, 리턴제로입니다.",
            words: [
              { start_at: 3108, duration: 540, text: "안녕하세요," },
              { start_at: 3648, duration: 1050, text: "리턴제로입니다." },
            ],
          },
        ],
      },
    };

    const result = parseTranscript(raw);

    expect(result.utterances[0].words).toEqual([
      { startAt: 3108, duration: 540, text: "안녕하세요," },
      { startAt: 3648, duration: 1050, text: "리턴제로입니다." },
    ]);
  });

  it("leaves words undefined when the API didn't include it (use_word_timestamp: false/default)", () => {
    const raw = {
      id: "abc123",
      status: "completed",
      results: { utterances: [{ start_at: 0, duration: 100, msg: "hi" }] },
    };

    expect(parseTranscript(raw).utterances[0].words).toBeUndefined();
  });
});
