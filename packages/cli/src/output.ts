import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toJson, toSrt, toTxt, toVtt } from "@spencer0124/rtzr-core";
import type { TranscriptResult } from "@spencer0124/rtzr-core";

export type OutputFormat = "txt" | "srt" | "vtt" | "json" | "all";

// `opts` (speakerLabels) must be forwarded to txt/srt/vtt alike — see the BUGFIX
// note in core/src/formatters.ts. An earlier version of this map called
// `toSrt(r)`/`toVtt(r)` without `opts`, which is what let the bug through here.
const FORMATTERS: Record<
  Exclude<OutputFormat, "all">,
  { ext: string; render: (r: TranscriptResult, opts: { speakerLabels?: boolean }) => string }
> = {
  txt: { ext: "txt", render: (r, opts) => toTxt(r, opts) },
  srt: { ext: "srt", render: (r, opts) => toSrt(r, opts) },
  vtt: { ext: "vtt", render: (r, opts) => toVtt(r, opts) },
  json: { ext: "json", render: (r) => toJson(r) },
};

/** Resolves `-f`/`--output-format` ("all" or a single format) into the concrete formats to write. */
export function resolveFormats(format: string): Exclude<OutputFormat, "all">[] {
  if (format === "all") return ["txt", "srt", "vtt", "json"];
  if (format in FORMATTERS) return [format as Exclude<OutputFormat, "all">];
  throw new Error(`Unsupported --output-format "${format}". Expected txt|srt|vtt|json|all.`);
}

/**
 * Writes one file per requested format as `<outputDir>/<baseName>.<ext>`, always
 * UTF-8 (internal-docs/concept.md §6.5 — avoids cp949 mangling on Windows consoles).
 * Returns the written file paths.
 */
export function writeOutputs(
  result: TranscriptResult,
  formats: Exclude<OutputFormat, "all">[],
  outputDir: string,
  baseName: string,
  opts: { speakerLabels?: boolean } = {},
): string[] {
  mkdirSync(outputDir, { recursive: true });

  return formats.map((fmt) => {
    const { ext, render } = FORMATTERS[fmt];
    const path = join(outputDir, `${baseName}.${ext}`);
    writeFileSync(path, render(result, opts), { encoding: "utf-8" });
    return path;
  });
}
