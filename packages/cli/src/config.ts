import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import envPaths from "env-paths";
import type { RtzrCredentials } from "@seungyongcho/rtzr-core";

/**
 * Key loading lives in the CLI, not in `core` — core stays environment-neutral
 * (docs/concept.md §5) and only ever receives credentials as arguments.
 *
 * Priority: environment variables > local config file > none (caller decides
 * what to do, e.g. prompt the user to run `rtzr configure`).
 */

const paths = envPaths("rtzr", { suffix: "" });
const CONFIG_FILE = join(paths.config, "config.json");

interface StoredConfig {
  clientId?: string;
  clientSecret?: string;
}

function readStoredConfig(): StoredConfig {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as StoredConfig;
  } catch {
    return {};
  }
}

export function loadCredentials(): RtzrCredentials | undefined {
  const envId = process.env.RTZR_CLIENT_ID;
  const envSecret = process.env.RTZR_CLIENT_SECRET;
  if (envId && envSecret) {
    return { clientId: envId, clientSecret: envSecret };
  }

  const stored = readStoredConfig();
  if (stored.clientId && stored.clientSecret) {
    return { clientId: stored.clientId, clientSecret: stored.clientSecret };
  }

  return undefined;
}

/** Persists credentials to the user's home config folder (outside the repo). */
export function saveCredentials(creds: RtzrCredentials): void {
  mkdirSync(paths.config, { recursive: true });
  writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ clientId: creds.clientId, clientSecret: creds.clientSecret }, null, 2),
    { encoding: "utf-8" },
  );
}

export function configFilePath(): string {
  return CONFIG_FILE;
}
