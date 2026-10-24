import { getOrganizationProvider } from "@/lib/ai/get-provider";
import { MAX_SUGGEST_REQUEST_BYTES, suggestRequestSchema } from "@/lib/organization/suggest-request";
import { ScanError } from "@/lib/server/files/errors";
import { isLoopbackRequest, isSameOriginRequest } from "@/lib/server/local-request";
import {
  httpStatusFor,
  INVALID_REQUEST_FAILURE,
  toSuggestFailure,
} from "@/lib/server/organization/errors";
import { generateOrganizationPlan } from "@/lib/server/organization/generate-plan";
import { getPlanStore } from "@/lib/server/organization/plan-store";
import type { SuggestFailure, SuggestResponse } from "@/types/organization";

/**
 * POST /api/suggestions — read-only.
 *
 * Re-scans the requested folder, asks the local model for a plan, validates
 * it, remembers it server-side under a single-use `planId`, and returns the
 * suggestions. Nothing on disk is changed. A route handler is
 * used (rather than a Server Action) so that the browser can cancel a long
 * generation: `request.signal` is passed through to the Ollama request.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isLoopbackRequest(request.headers) || !isSameOriginRequest(request.headers)) {
    return failure({ ...new ScanError("NOT_LOCAL").toFailure(), retryable: false });
  }

  const text = await request.text();
  if (text.length > MAX_SUGGEST_REQUEST_BYTES) {
    return failure(INVALID_REQUEST_FAILURE);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return failure(INVALID_REQUEST_FAILURE);
  }

  const parsed = suggestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return failure(INVALID_REQUEST_FAILURE);
  }

  try {
    const plan = await generateOrganizationPlan(parsed.data.folderPath, {
      provider: getOrganizationProvider(),
      signal: request.signal,
    });
    return json({ ok: true, plan: getPlanStore().remember(plan) }, 200);
  } catch (error) {
    const safe = toSuggestFailure(error);
    if (safe.code === "UNKNOWN") {
      console.error("[tidymate] unexpected suggestion failure", error);
    }
    return failure(safe);
  }
}

function failure(error: SuggestFailure): Response {
  return json({ ok: false, error }, httpStatusFor(error.code));
}

function json(body: SuggestResponse, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
