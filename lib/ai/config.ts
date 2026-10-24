import "server-only";

import { getServerEnv } from "@/lib/config/env";

export type OllamaConfig = {
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

/** Generation settings tuned for small local models producing JSON. */
export const OLLAMA_GENERATION_OPTIONS = {
  /** Low temperature keeps plans conservative and repeatable. */
  temperature: 0.2,
  /** Prompt, 30 files and a full answer fit comfortably. */
  num_ctx: 8192,
  /** Hard cap on answer length so a runaway generation ends. */
  num_predict: 3072,
} as const;

/**
 * Keep the model loaded between requests. Loading Gemma 3 4B from disk can
 * take minutes on modest machines, so a scan followed by a retry shouldn't
 * pay that cost twice.
 */
export const OLLAMA_KEEP_ALIVE = "15m";

export function getOllamaConfig(): OllamaConfig {
  const env = getServerEnv();
  return {
    baseUrl: env.OLLAMA_BASE_URL,
    model: env.OLLAMA_MODEL,
    timeoutMs: env.OLLAMA_TIMEOUT_MS,
  };
}
