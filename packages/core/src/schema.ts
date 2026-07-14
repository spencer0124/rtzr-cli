import { z } from "zod";

/**
 * Single source of truth for `TranscribeConfig` validation.
 *
 * The CLI derives its flag validation from this schema, and `packages/mcp-worker`
 * derives its `transcribe` tool's inputSchema from the same object — so a new
 * option added here is automatically enforced in both surfaces without
 * redefining it twice. See docs/concept.md §5.
 *
 * Exported as the *unrefined* object (not `transcribeConfigSchema` below) because
 * MCP's `server.registerTool()` needs a plain `ZodObject`/shape, not a `ZodEffects` —
 * `.superRefine()` strips `.shape`. The whisper+language cross-field rule below
 * still applies to CLI input via `transcribeConfigSchema`; the MCP worker re-runs
 * that same refined schema by hand inside its handler (see mcp-worker/src/handler.ts).
 */
// Range bounds below (keywords ≤20 chars/≤500 words, spkCount ≥0,
// paragraphSplitterMax ≥1) come from the API docs but the API itself does NOT
// enforce them — they exist purely as client-side guards (B1 in
// docs/rtzr-config-constraints.md §3-C).
export const baseTranscribeConfigSchema = z.object({
  modelName: z.enum(["sommers", "whisper"]).optional(),
  language: z.enum(["ko", "ja", "en", "detect", "multi"]).optional(),
  languageCandidates: z.array(z.string()).optional(),
  useDiarization: z.boolean().optional(),
  spkCount: z.number().int().min(0).optional(),
  /** Plain keyword strings — the API has no per-word score/weight syntax. Max 20 chars, max 500 words. */
  keywords: z.array(z.string().max(20)).max(500).optional(),
  useItn: z.boolean().optional(),
  useDisfluencyFilter: z.boolean().optional(),
  useProfanityFilter: z.boolean().optional(),
  useParagraphSplitter: z.boolean().optional(),
  paragraphSplitterMax: z.number().int().min(1).optional(),
  useWordTimestamp: z.boolean().optional(),
  domain: z.enum(["GENERAL", "CALL"]).optional(),
});

export const transcribeConfigSchema = baseTranscribeConfigSchema.superRefine((cfg, ctx) => {
  // The four hard cross-field constraints, verified against the live API on
  // 2026-07-14 — see docs/rtzr-config-constraints.md §3-A (probe IDs in
  // brackets). Each is a combination the API rejects with HTTP 400, so we
  // fail fast locally with a clear message instead of forwarding it.
  // Softer doc'd rules (itn/paragraph-max/keywords applicability) are NOT
  // enforced here: the API accepts and ignores those, see §3-B.

  // #1 modelName "whisper" → language is required [T9]
  if (cfg.modelName === "whisper" && cfg.language === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "language is required when modelName is \"whisper\"",
      path: ["language"],
    });
  }

  // #2 language "detect"/"multi" → modelName must be "whisper" [T6]
  //    (modelName omitted = the API default sommers, so it fails there too)
  if ((cfg.language === "detect" || cfg.language === "multi") && cfg.modelName !== "whisper") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "language \"detect\"/\"multi\" is only supported when modelName is \"whisper\"",
      path: ["language"],
    });
  }

  // #3 languageCandidates → modelName must be "whisper" [P1·P5·T7]
  //    (the docs tie candidates to detect/multi, but probing showed the real
  //    gate is the model: whisper+ko+candidates = 200, sommers+candidates = 400)
  if (cfg.languageCandidates !== undefined && cfg.modelName !== "whisper") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "languageCandidates is only supported when modelName is \"whisper\"",
      path: ["languageCandidates"],
    });
  }

  // #4 spkCount → useDiarization must be true [T1·T2]
  if (cfg.spkCount !== undefined && cfg.useDiarization !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "spkCount requires useDiarization",
      path: ["spkCount"],
    });
  }
});

export type TranscribeConfigInput = z.infer<typeof baseTranscribeConfigSchema>;

export const rtzrCredentialsSchema = z.object({
  clientId: z.string().min(1, "clientId is required"),
  clientSecret: z.string().min(1, "clientSecret is required"),
});
