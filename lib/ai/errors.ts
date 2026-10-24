import "server-only";

import type { AiErrorCode } from "@/types/organization";

type ErrorDetails = {
  model?: string;
  timeoutMs?: number;
};

const RETRYABLE: Record<AiErrorCode, boolean> = {
  OLLAMA_UNAVAILABLE: true,
  MODEL_NOT_FOUND: true,
  TIMEOUT: true,
  HTTP_ERROR: true,
  INVALID_JSON: true,
  INVALID_OUTPUT: true,
  VALIDATION_FAILED: true,
  CANCELLED: true,
};

function safeMessage(code: AiErrorCode, { model = "the configured model", timeoutMs }: ErrorDetails): string {
  switch (code) {
    case "OLLAMA_UNAVAILABLE":
      return "TidyMate couldn't reach Ollama on this computer. Make sure Ollama is running, then try again.";
    case "MODEL_NOT_FOUND":
      return `The model "${model}" isn't installed in Ollama. Install it with "ollama pull ${model}", then try again.`;
    case "TIMEOUT": {
      const minutes = timeoutMs ? Math.max(1, Math.round(timeoutMs / 60_000)) : null;
      const limit = minutes ? ` after ${minutes} minute${minutes === 1 ? "" : "s"}` : "";
      return `Gemma didn't finish${limit}. Try a smaller folder, or raise OLLAMA_TIMEOUT_MS if your computer needs more time.`;
    }
    case "HTTP_ERROR":
      return "Ollama returned an unexpected error. Check that it's working, then try again.";
    case "INVALID_JSON":
      return "Gemma's answer wasn't readable. Local models sometimes stumble, so trying again usually helps.";
    case "INVALID_OUTPUT":
      return "Gemma's answer didn't match the format TidyMate expects. Trying again usually helps.";
    case "VALIDATION_FAILED":
      return "None of Gemma's suggestions passed TidyMate's safety checks, so nothing is shown. Try again.";
    case "CANCELLED":
      return "The request was cancelled.";
  }
}

/**
 * An expected AI failure. The message is safe to show the user; internal
 * details (status codes, raw responses) are kept out of it on purpose.
 */
export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;

  constructor(code: AiErrorCode, details: ErrorDetails = {}, options?: { cause?: unknown }) {
    super(safeMessage(code, details), options);
    this.name = "AiError";
    this.code = code;
    this.retryable = RETRYABLE[code];
  }
}
