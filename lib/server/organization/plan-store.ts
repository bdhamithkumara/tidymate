import "server-only";

import { randomUUID } from "node:crypto";

import type { OrganizationPlan, ReviewablePlan } from "@/types/organization";

/** Plans older than this must be regenerated before they can be applied. */
export const PLAN_TTL_MS = 60 * 60 * 1000;

/** Only a handful of plans are ever in flight on a single-user local app. */
export const MAX_STORED_PLANS = 20;

type Entry = { plan: ReviewablePlan; expiresAtMs: number };

/**
 * In-memory, single-use store for generated plans. Applying a plan reads the
 * destinations and expected file metadata from here, so the browser can only
 * choose among suggestions the server itself produced.
 *
 * Plans are lost when the server restarts; the user then simply asks for
 * suggestions again. Kept on `globalThis` so dev-mode module reloads don't
 * drop plans mid-review.
 */
export class PlanStore {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly now: () => number = Date.now) {}

  remember(plan: OrganizationPlan): ReviewablePlan {
    this.prune();
    while (this.entries.size >= MAX_STORED_PLANS) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }

    const expiresAtMs = this.now() + PLAN_TTL_MS;
    const reviewable: ReviewablePlan = {
      ...plan,
      planId: randomUUID(),
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
    this.entries.set(reviewable.planId, { plan: reviewable, expiresAtMs });
    return reviewable;
  }

  /** Removes and returns a plan. A plan can be applied at most once. */
  take(planId: string): ReviewablePlan | undefined {
    const entry = this.entries.get(planId);
    this.entries.delete(planId);
    if (!entry || entry.expiresAtMs <= this.now()) {
      return undefined;
    }
    return entry.plan;
  }

  get size(): number {
    this.prune();
    return this.entries.size;
  }

  private prune() {
    const now = this.now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAtMs <= now) this.entries.delete(id);
    }
  }
}

const GLOBAL_KEY = Symbol.for("tidymate.planStore");

export function getPlanStore(): PlanStore {
  const holder = globalThis as typeof globalThis & { [GLOBAL_KEY]?: PlanStore };
  holder[GLOBAL_KEY] ??= new PlanStore();
  return holder[GLOBAL_KEY];
}
