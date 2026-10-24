import type {
  ApplyFailure,
  ApplyResponse,
  SuggestFailure,
  SuggestResponse,
} from "@/types/organization";

const SERVER_UNREACHABLE: SuggestFailure = {
  code: "UNKNOWN",
  message: "TidyMate's local server didn't respond. Make sure it's still running, then try again.",
  retryable: true,
};

/**
 * Asks the local TidyMate server for suggestions. Only the folder path is
 * sent; the server re-scans the folder itself. Aborting `signal` cancels the
 * request (and the server stops waiting on the model). An `AbortError` is
 * re-thrown so callers can tell cancellation apart from failure.
 */
export async function requestOrganizationPlan(
  folderPath: string,
  signal: AbortSignal,
): Promise<SuggestResponse> {
  let response: Response;
  try {
    response = await fetch("/api/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath }),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    return { ok: false, error: SERVER_UNREACHABLE };
  }

  try {
    const body: unknown = await response.json();
    if (isSuggestResponse(body)) {
      return body;
    }
  } catch (error) {
    if (signal.aborted) throw error;
  }
  return { ok: false, error: SERVER_UNREACHABLE };
}

function isSuggestResponse(value: unknown): value is SuggestResponse {
  if (typeof value !== "object" || value === null || !("ok" in value)) {
    return false;
  }
  return value.ok === true ? "plan" in value : "error" in value;
}

const APPLY_UNREACHABLE: ApplyFailure = {
  code: "UNKNOWN",
  message:
    "TidyMate's local server didn't respond, so the outcome is unknown. Scan the folder again to see its current state.",
};

/**
 * Asks the server to apply the selected suggestions of a stored plan. Only
 * the plan id and the selected source paths are sent.
 */
export async function requestApply(planId: string, sourcePaths: string[]): Promise<ApplyResponse> {
  let response: Response;
  try {
    response = await fetch("/api/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, sourcePaths }),
    });
  } catch {
    return { ok: false, error: APPLY_UNREACHABLE };
  }

  try {
    const body: unknown = await response.json();
    if (isApplyResponse(body)) {
      return body;
    }
  } catch {
    // Fall through to the generic error.
  }
  return { ok: false, error: APPLY_UNREACHABLE };
}

function isApplyResponse(value: unknown): value is ApplyResponse {
  if (typeof value !== "object" || value === null || !("ok" in value)) {
    return false;
  }
  return value.ok === true ? "result" in value : "error" in value;
}
