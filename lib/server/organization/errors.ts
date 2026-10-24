import "server-only";

import { AiError } from "@/lib/ai/errors";
import { ScanError } from "@/lib/server/files/errors";
import type { SuggestErrorCode, SuggestFailure } from "@/types/organization";

export const INVALID_REQUEST_FAILURE: SuggestFailure = {
  code: "INVALID_REQUEST",
  message: "TidyMate couldn't understand that request. Reload the page and try again.",
  retryable: false,
};

const UNKNOWN_FAILURE: SuggestFailure = {
  code: "UNKNOWN",
  message: "Something went wrong while preparing suggestions. Nothing was changed.",
  retryable: true,
};

/** Maps any error to a message that is safe to show in the browser. */
export function toSuggestFailure(error: unknown): SuggestFailure {
  if (error instanceof AiError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  if (error instanceof ScanError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  return UNKNOWN_FAILURE;
}

const STATUS_BY_CODE: Record<SuggestErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_PATH: 400,
  NOT_FOUND: 404,
  NOT_A_DIRECTORY: 400,
  PROTECTED_PATH: 400,
  PERMISSION_DENIED: 403,
  NOT_LOCAL: 403,
  OLLAMA_UNAVAILABLE: 503,
  MODEL_NOT_FOUND: 503,
  TIMEOUT: 504,
  HTTP_ERROR: 502,
  INVALID_JSON: 502,
  INVALID_OUTPUT: 502,
  VALIDATION_FAILED: 502,
  CANCELLED: 499,
  UNKNOWN: 500,
};

export function httpStatusFor(code: SuggestErrorCode): number {
  return STATUS_BY_CODE[code];
}
