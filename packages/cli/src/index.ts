/**
 * Library entry point for `@spencer0124/rtzr-cli` — the same package that
 * ships the `rtzr` binary also exposes its config-loading helpers for
 * reuse by other TS code (e.g. the roadmap `ilovertzr` web demo), mirroring
 * how `core` is consumed. See internal-docs/concept.md §2.
 */
export { loadCredentials, saveCredentials, configFilePath } from "./config.js";

// Re-export the core surface so consumers of this package don't also need
// to depend on @spencer0124/rtzr-core directly for basic usage.
export * from "@spencer0124/rtzr-core";
