import { describe, expect, it } from "vitest";
import { toJson, toSrt, toTxt, toVtt } from "./formatters.js";
import type { TranscriptResult } from "./types.js";

const sample: TranscriptResult = {
  utterances: [
    { startAt: 0, duration: 1500, msg: "안녕하세요", spk: 0 },
    { startAt: 1500, duration: 2345, msg: "네, 반갑습니다", spk: 1 },
    // exercises hour-rollover and 3-digit ms padding
    { startAt: 3_661_007, duration: 500, msg: "테스트" },
  ],
  raw: { id: "job-123", status: "completed" },
};

describe("toSrt", () => {
  it("formats ms as HH:MM:SS,mmm timecodes with 1-based cue index", () => {
    const srt = toSrt(sample);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:01,500\n안녕하세요");
    expect(srt).toContain("2\n00:00:01,500 --> 00:00:03,845\n네, 반갑습니다");
  });

  it("rolls over hours correctly and pads milliseconds to 3 digits", () => {
    const srt = toSrt(sample);
    // 3,661,007 ms = 1h 01m 01s 007ms
    expect(srt).toContain("3\n01:01:01,007 --> 01:01:01,507\n테스트");
  });

  it("omits speaker labels by default even when spk is present", () => {
    const srt = toSrt(sample);
    expect(srt).not.toContain("[Speaker");
  });

  it("prefixes speaker labels when speakerLabels is true and spk is present", () => {
    const srt = toSrt(sample, { speakerLabels: true });
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:01,500\n[Speaker 0] 안녕하세요");
    expect(srt).toContain("2\n00:00:01,500 --> 00:00:03,845\n[Speaker 1] 네, 반갑습니다");
    // no spk on the third utterance -> no label even when requested
    expect(srt).toContain("\n테스트");
  });
});

describe("toVtt", () => {
  it("starts with the WEBVTT header and uses dot-separated milliseconds", () => {
    const vtt = toVtt(sample);
    expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> 00:00:01.500");
  });

  it("omits speaker labels by default even when spk is present", () => {
    expect(toVtt(sample)).not.toContain("[Speaker");
  });

  it("prefixes speaker labels when speakerLabels is true", () => {
    expect(toVtt(sample, { speakerLabels: true })).toContain("[Speaker 0] 안녕하세요");
  });
});

describe("toTxt", () => {
  it("joins utterance text without speaker labels by default", () => {
    expect(toTxt(sample)).toBe("안녕하세요\n네, 반갑습니다\n테스트");
  });

  it("prefixes speaker labels when speakerLabels is true", () => {
    const txt = toTxt(sample, { speakerLabels: true });
    expect(txt).toContain("[Speaker 0] 안녕하세요");
    expect(txt).toContain("[Speaker 1] 네, 반갑습니다");
    // no spk on the third utterance -> no label even when requested
    expect(txt).toContain("\n테스트");
  });
});

describe("toJson", () => {
  it("pretty-prints the raw API response", () => {
    expect(toJson(sample)).toBe(JSON.stringify(sample.raw, null, 2));
  });
});
