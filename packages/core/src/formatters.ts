import type { TranscriptResult } from "./types.js";

/**
 * Output formatters, mirroring Whisper's `--output_format` options.
 * Pure functions — no I/O, no network — so unlike `client.ts` these are
 * fully implemented (and unit-tested) in Phase 1 already.
 */

/** ms -> "HH:MM:SS,mmm" (SRT timecode format, comma-separated milliseconds). */
function toSrtTimecode(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const millis = totalMs % 1_000;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
}

/** ms -> "HH:MM:SS.mmm" (WebVTT timecode format, dot-separated milliseconds). */
function toVttTimecode(ms: number): string {
  return toSrtTimecode(ms).replace(",", ".");
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

export function toTxt(
  result: TranscriptResult,
  opts: { speakerLabels?: boolean } = {},
): string {
  return result.utterances
    .map((u) => {
      if (opts.speakerLabels && u.spk !== undefined) {
        return `[Speaker ${u.spk}] ${u.msg}`;
      }
      return u.msg;
    })
    .join("\n");
}

/**
 * BUGFIX (found during live E2E, Phase 2): toSrt/toVtt originally checked only
 * `u.spk !== undefined` to decide whether to print a speaker label — unlike toTxt,
 * which already gated on `opts.speakerLabels`. That was wrong: the RTZR API returns
 * `spk` (e.g. 0) even when diarization was never requested (single-channel audio
 * still gets a speaker index), so every SRT/VTT was showing a misleading
 * "[Speaker 0]" regardless of --diarize. All three formatters must require the
 * explicit `opts.speakerLabels` opt-in — see CLAUDE.md "실수/교훈" for the full story.
 */
export function toSrt(
  result: TranscriptResult,
  opts: { speakerLabels?: boolean } = {},
): string {
  return result.utterances
    .map((u, i) => {
      const start = toSrtTimecode(u.startAt);
      const end = toSrtTimecode(u.startAt + u.duration);
      const text = opts.speakerLabels && u.spk !== undefined ? `[Speaker ${u.spk}] ${u.msg}` : u.msg;
      return `${i + 1}\n${start} --> ${end}\n${text}\n`;
    })
    .join("\n");
}

export function toVtt(
  result: TranscriptResult,
  opts: { speakerLabels?: boolean } = {},
): string {
  const cues = result.utterances
    .map((u) => {
      const start = toVttTimecode(u.startAt);
      const end = toVttTimecode(u.startAt + u.duration);
      const text = opts.speakerLabels && u.spk !== undefined ? `[Speaker ${u.spk}] ${u.msg}` : u.msg;
      return `${start} --> ${end}\n${text}\n`;
    })
    .join("\n");
  return `WEBVTT\n\n${cues}`;
}

export function toJson(result: TranscriptResult): string {
  return JSON.stringify(result.raw, null, 2);
}
