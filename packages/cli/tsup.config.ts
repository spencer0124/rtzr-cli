import { defineConfig } from "tsup";

export default defineConfig([
  // Library entry point (`exports`) — dual ESM/CJS like core, for reuse
  // by other TS code (e.g. the roadmap `ilovertzr` web demo).
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    target: "es2022",
  },
  // Binary entry point (`bin`) — ESM only, ships the shebang tsup
  // preserves from the source file's first line.
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    dts: false,
    sourcemap: true,
    clean: false,
    target: "es2022",
  },
]);
