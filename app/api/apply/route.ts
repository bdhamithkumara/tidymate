import { applyRequestSchema, MAX_APPLY_REQUEST_BYTES } from "@/lib/organization/apply-request";
import { ScanError } from "@/lib/server/files/errors";
import { isLoopbackRequest, isSameOriginRequest } from "@/lib/server/local-request";
import { applyPlan, runExclusiveApply } from "@/lib/server/organization/apply-plan";
import {
  ApplyError,
  applyHttpStatusFor,
  toApplyFailure,
} from "@/lib/server/organization/errors";
import { getPlanStore } from "@/lib/server/organization/plan-store";
import type { ApplyFailure, ApplyResponse } from "@/types/organization";

/**
 * POST /api/apply — the only endpoint that changes files.
 *
 * Body: `{ planId, sourcePaths }`. The plan is taken from server memory
 * (single use), the folder is re-scanned, every selected change is checked
 * again, and only then are files moved or renamed. Nothing is ever deleted
 * or overwritten.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isLoopbackRequest(request.headers) || !isSameOriginRequest(request.headers)) {
    return failure(new ScanError("NOT_LOCAL").toFailure());
  }

  const text = await request.text();
  if (text.length > MAX_APPLY_REQUEST_BYTES) {
    return failure(new ApplyError("INVALID_REQUEST").toFailure());
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return failure(new ApplyError("INVALID_REQUEST").toFailure());
  }

  const parsed = applyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return failure(new ApplyError("INVALID_REQUEST").toFailure());
  }

  try {
    const outcome = await runExclusiveApply(async () => {
      const plan = getPlanStore().take(parsed.data.planId);
      if (!plan) {
        throw new ApplyError("PLAN_NOT_FOUND");
      }
      return applyPlan(plan, parsed.data.sourcePaths);
    });

    if (outcome === "busy") {
      return failure(new ApplyError("BUSY").toFailure());
    }
    return json({ ok: true, result: outcome }, 200);
  } catch (error) {
    const safe = toApplyFailure(error);
    if (safe.code === "UNKNOWN") {
      console.error("[tidymate] unexpected apply failure", error);
    }
    return failure(safe);
  }
}

function failure(error: ApplyFailure): Response {
  return json({ ok: false, error }, applyHttpStatusFor(error.code));
}

function json(body: ApplyResponse, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
