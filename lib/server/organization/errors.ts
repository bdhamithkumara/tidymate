import "server-only";

import { AiError } from "@/lib/ai/errors";
import { ScanError } from "@/lib/server/files/errors";
import type {
  ApplyErrorCode,
  ApplyFailure,
  SuggestErrorCode,
  SuggestFailure,
} from "@/types/organization";

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

/* ---------- Applying a plan ---------- */

const APPLY_MESSAGES: Record<Exclude<ApplyErrorCode, ScanError["code"]>, string> = {
  INVALID_REQUEST: "TidyMate couldn't understand that request. Reload the page and try again.",
  PLAN_NOT_FOUND:
    "These suggestions are no longer available. They expire after an hour, after being applied once, or when TidyMate restarts. Ask for suggestions again.",
  ROOT_CHANGED: "The folder has moved or changed since the suggestions were made. Scan it again.",
  BUSY: "TidyMate is already applying changes. Wait for that to finish, then try again.",
};

/** An expected failure of the whole apply request. Nothing was changed. */
export class ApplyError extends Error {
  readonly code: ApplyErrorCode;

  constructor(code: keyof typeof APPLY_MESSAGES) {
    super(APPLY_MESSAGES[code]);
    this.name = "ApplyError";
    this.code = code;
  }

  toFailure(): ApplyFailure {
    return { code: this.code, message: this.message };
  }
}

export function toApplyFailure(error: unknown): ApplyFailure {
  if (error instanceof ApplyError || error instanceof ScanError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "UNKNOWN",
    message: "Something went wrong before any changes were made. Nothing was changed.",
  };
}

const APPLY_STATUS_BY_CODE: Record<ApplyErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_PATH: 400,
  NOT_FOUND: 404,
  NOT_A_DIRECTORY: 400,
  PROTECTED_PATH: 400,
  PERMISSION_DENIED: 403,
  NOT_LOCAL: 403,
  PLAN_NOT_FOUND: 410,
  ROOT_CHANGED: 409,
  BUSY: 409,
  UNKNOWN: 500,
};

export function applyHttpStatusFor(code: ApplyErrorCode): number {
  return APPLY_STATUS_BY_CODE[code];
}
