/**
 * Library entry point for `@seungyongcho/rtzr-cli` — the same package that
 * ships the `rtzr` binary also exposes its config-loading helpers for
 * reuse by other TS code (e.g. the roadmap `ilovertzr` web demo), mirroring
 * how `core` is consumed. See docs/concept.md §2.
 */
export { loadCredentials, saveCredentials, configFilePath } from "./config.js";

// Re-export the core surface so consumers of this package don't also need
// to depend on @seungyongcho/rtzr-core directly for basic usage.
export * from "@seungyongcho/rtzr-core";
