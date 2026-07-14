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
  // API docs: `language` is required when modelName === "whisper".
  if (cfg.modelName === "whisper" && cfg.language === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "language is required when modelName is \"whisper\"",
      path: ["language"],
    });
  }
});

export type TranscribeConfigInput = z.infer<typeof baseTranscribeConfigSchema>;

export const rtzrCredentialsSchema = z.object({
  clientId: z.string().min(1, "clientId is required"),
  clientSecret: z.string().min(1, "clientSecret is required"),
});
