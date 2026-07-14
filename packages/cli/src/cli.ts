#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { createInterface } from "node:readline/promises";
import { Command, Option } from "commander";
import { glob, isDynamicPattern } from "tinyglobby";
import type { TranscribeConfig } from "@seungyongcho/rtzr-core";
import { RtzrApiError, RtzrClient, RtzrTimeoutError, toJson, transcribeConfigSchema } from "@seungyongcho/rtzr-core";
import { configFilePath, loadCredentials, saveCredentials } from "./config.js";
import { resolveFormats, writeOutputs } from "./output.js";

interface CliFlags {
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
  json?: boolean;
}

/** Maps parsed CLI flags -> the shared `TranscribeConfig` (validated by core's zod schema). */
function toTranscribeConfig(flags: CliFlags): TranscribeConfig {
  const cfg: TranscribeConfig = {
    modelName: flags.model as TranscribeConfig["modelName"],
    language: flags.language as TranscribeConfig["language"],
    useDiarization: flags.diarize,
    spkCount: flags.speakers !== undefined ? Number(flags.speakers) : undefined,
    keywords: flags.keywords,
    useItn: flags.itn,
    useDisfluencyFilter: flags.disfluencyFilter,
    useProfanityFilter: flags.profanityFilter,
    useWordTimestamp: flags.wordTimestamps,
    domain: flags.domain as TranscribeConfig["domain"],
  };
  return transcribeConfigSchema.parse(cfg) as TranscribeConfig;
}

/** Expands glob patterns (e.g. "*.wav") via tinyglobby; passes literal paths through unchanged. */
async function resolveAudioFiles(patterns: string[]): Promise<string[]> {
  const resolved: string[] = [];
  for (const pattern of patterns) {
    if (isDynamicPattern(pattern)) {
      const matches = await glob(pattern, { onlyFiles: true });
      resolved.push(...matches);
    } else {
      resolved.push(pattern);
    }
  }
  return [...new Set(resolved)];
}

/** Strips the audio file's extension to form the output base name, e.g. "sample.wav" -> "sample". */
function baseNameOf(filePath: string): string {
  const name = basename(filePath);
  const ext = extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

const program = new Command();

program
  .name("rtzr")
  .description(
    "Whisper-style CLI for the RTZR (Return Zero) STT API — speaker diarization, keyword boosting, ITN.",
  )
  .version("0.1.0");

program
  .argument("<audio...>", "audio file path(s) or glob(s)")
  .addOption(
    new Option("-f, --output-format <fmt>", "txt|srt|vtt|json|all").default("txt"),
  )
  .option("-o, --output-dir <dir>", "output directory", ".")
  .addOption(
    new Option("-l, --language <lang>", "ko|ja|en|detect|multi").default("ko"),
  )
  .addOption(
    new Option("--model <name>", "sommers|whisper").default("sommers"),
  )
  .option("--diarize", "enable speaker diarization (use_diarization)")
  .option("--speakers <n>", "expected speaker count, 0 = auto (spk_count)")
  .option("--keywords <kw...>", "keyword boosting words (no per-word score syntax)")
  .option("--itn", "enable inverse text normalization (default: on)", true)
  .option("--no-itn", "disable inverse text normalization")
  .option("--profanity-filter", "enable profanity filter")
  .option("--disfluency-filter", "enable disfluency filter (default: on)", true)
  .option("--no-disfluency-filter", "disable disfluency filter")
  .option("--word-timestamps", "include per-word timestamps")
  .addOption(new Option("--domain <domain>", "GENERAL|CALL"))
  .option("--json", "print the raw API response JSON to stdout instead of writing files")
  .action(async (audioPatterns: string[], flags: CliFlags) => {
    const creds = loadCredentials();
    if (!creds) {
      console.error(
        "No RTZR credentials found. Run `rtzr configure`, or set RTZR_CLIENT_ID / RTZR_CLIENT_SECRET.",
      );
      process.exitCode = 1;
      return;
    }

    const audioFiles = await resolveAudioFiles(audioPatterns);
    if (audioFiles.length === 0) {
      console.error(`No audio files matched: ${audioPatterns.join(", ")}`);
      process.exitCode = 1;
      return;
    }

    const cfg = toTranscribeConfig(flags);
    const formats = flags.json ? [] : resolveFormats(flags.outputFormat);
    const client = new RtzrClient(creds);
    let hadFailure = false;

    // Sequential, not parallel: RTZR enforces a concurrent-processing cap
    // (https://developers.rtzr.ai/docs/rate_limit/), and jobs are processed
    // in submission order anyway, so parallel submission buys nothing.
    for (const filePath of audioFiles) {
      const filename = basename(filePath);
      try {
        const bytes = await readFile(filePath);
        console.error(`[rtzr] ${filename}: uploading...`);

        const result = await client.transcribe(bytes, filename, cfg, {
          onTick: (status) => console.error(`[rtzr] ${filename}: ${status}`),
        });

        if (flags.json) {
          console.log(toJson(result));
        } else {
          const written = writeOutputs(result, formats, flags.outputDir, baseNameOf(filePath), {
            speakerLabels: flags.diarize,
          });
          for (const path of written) {
            console.error(`[rtzr] ${filename}: wrote ${path}`);
          }
        }
      } catch (err) {
        hadFailure = true;
        if (err instanceof RtzrApiError) {
          console.error(
            `[rtzr] ${filename}: RTZR API error (HTTP ${err.httpStatus}${err.code ? `, ${err.code}` : ""}): ${err.apiMsg ?? err.message}`,
          );
        } else if (err instanceof RtzrTimeoutError) {
          console.error(`[rtzr] ${filename}: ${err.message}`);
        } else {
          console.error(`[rtzr] ${filename}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    if (hadFailure) process.exitCode = 1;
  });

program
  .command("configure")
  .description("interactively store RTZR_CLIENT_ID / RTZR_CLIENT_SECRET in a local config file")
  .action(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const clientId = await rl.question("RTZR_CLIENT_ID: ");
      const clientSecret = await rl.question("RTZR_CLIENT_SECRET: ");
      saveCredentials({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
      console.log(`Saved to ${configFilePath()}`);
    } finally {
      rl.close();
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
