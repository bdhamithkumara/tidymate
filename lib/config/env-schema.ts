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
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  return serverEnvSchema.parse({
    OLLAMA_BASE_URL: source.OLLAMA_BASE_URL || undefined,
    OLLAMA_MODEL: source.OLLAMA_MODEL || undefined,
  });
}
