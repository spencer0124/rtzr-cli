import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

// Runs the *built* CLI (`pnpm build` happens in the package's test script) —
// these are the CLI counterparts of handler.test.ts's "rejects ... before ever
// calling the RTZR API" tests, pinning what a unit test on config-mapping.ts
// can't: the real exit code and the fact that validation runs before any
// file/network I/O in cli.ts's untested wiring.
const CLI_PATH = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

// Env credentials take priority over the user's stored config file
// (config.ts loadCredentials), so these dummies guarantee the test never
// reads real credentials — and could never authenticate even if a request
// somehow slipped out.
const ENV = { ...process.env, RTZR_CLIENT_ID: "dummy-test-id", RTZR_CLIENT_SECRET: "dummy-test-secret" };

const MISSING_AUDIO = "/nonexistent-rtzr-cli-test.mp3";

async function runCli(args: string[]): Promise<{ exitCode: number; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI_PATH, ...args], { env: ENV });
    return { exitCode: 0, output: stdout + stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: e.code ?? -1, output: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

describe("cli surfacing of core schema errors", () => {
  // A subprocess can't take an injected fetch mock, so "no API call" is proven
  // structurally instead: the control test below shows a *valid* config gets
  // as far as reading the audio file (ENOENT), while the invalid configs die
  // on the schema field token — i.e. validation runs strictly before file and
  // network I/O. Assertions match field tokens only (not full message text),
  // so the planned error-formatting pass won't break them.

  it("rejects --speakers without --diarize: exit code 1, error speaks flag vocabulary (schema rule #4)", { timeout: 15_000 }, async () => {
    const { exitCode, output } = await runCli([MISSING_AUDIO, "--speakers", "2"]);

    expect(exitCode).toBe(1);
    // flag names, not core internals — the user typed --speakers, not spkCount
    expect(output).toMatch(/--speakers/);
    expect(output).toMatch(/--diarize/);
    expect(output).not.toMatch(/spkCount|useDiarization/);
    // one human-readable line, not ZodError's raw JSON issue dump
    expect(output).not.toMatch(/"code":|"path":/);
    expect(output).not.toMatch(/ENOENT/); // died at validation, never reached file I/O
  });

  it("rejects --language-candidates on the default (sommers) model: exit code 1, error names the flag (schema rule #3)", { timeout: 15_000 }, async () => {
    const { exitCode, output } = await runCli([MISSING_AUDIO, "--language-candidates", "ko", "en"]);

    expect(exitCode).toBe(1);
    expect(output).toMatch(/--language-candidates/);
    expect(output).not.toMatch(/"code":|"path":/);
    expect(output).not.toMatch(/ENOENT/);
  });

  it("control: a valid config passes validation and proceeds to file I/O (ENOENT)", { timeout: 15_000 }, async () => {
    const { exitCode, output } = await runCli([
      MISSING_AUDIO,
      "--model",
      "whisper",
      "--language-candidates",
      "ko",
      "en",
    ]);

    expect(exitCode).toBe(1);
    expect(output).toMatch(/ENOENT/);
    expect(output).not.toMatch(/--speakers|only supported/);
  });
});
