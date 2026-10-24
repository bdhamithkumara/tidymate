import { z } from "zod";

/**
 * Server-side configuration for the local AI runtime.
 *
 * Kept free of `server-only` so it can be unit tested; import it through
 * `@/lib/config/env` in application code.
 */
export const serverEnvSchema = z.object({
  OLLAMA_BASE_URL: z.url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().trim().min(1).default("gemma3:4b"),
  /** Local models can be slow on modest hardware, so the default is generous. */
  OLLAMA_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(3_600_000)
    .default(300_000),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  return serverEnvSchema.parse({
    OLLAMA_BASE_URL: source.OLLAMA_BASE_URL || undefined,
    OLLAMA_MODEL: source.OLLAMA_MODEL || undefined,
    OLLAMA_TIMEOUT_MS: source.OLLAMA_TIMEOUT_MS || undefined,
  });
}
