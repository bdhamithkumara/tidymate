import { describe, expect, it } from "vitest";

import { MAX_STORED_PLANS, PLAN_TTL_MS, PlanStore } from "@/lib/server/organization/plan-store";
import type { OrganizationPlan } from "@/types/organization";

const plan: OrganizationPlan = {
  rootPath: "/data/inbox",
  rootName: "inbox",
  model: "gemma3:4b",
  generatedAt: "2026-01-01T00:00:00.000Z",
  durationMs: 1,
  suggestions: [],
  unchangedCount: 0,
  rejected: [],
  consideredFileCount: 0,
  totalFileCount: 0,
};

describe("PlanStore", () => {
  it("assigns a random id and an expiry", () => {
    const store = new PlanStore(() => 1_000);
    const a = store.remember(plan);
    const b = store.remember(plan);

    expect(a.planId).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.planId).not.toBe(b.planId);
    expect(a.expiresAt).toBe(new Date(1_000 + PLAN_TTL_MS).toISOString());
    expect(a).toMatchObject(plan);
  });

  it("returns a plan once, then forgets it", () => {
    const store = new PlanStore();
    const stored = store.remember(plan);

    expect(store.take(stored.planId)).toEqual(stored);
    expect(store.take(stored.planId)).toBeUndefined();
  });

  it("returns nothing for unknown ids", () => {
    expect(new PlanStore().take("00000000-0000-4000-8000-000000000000")).toBeUndefined();
  });

  it("expires plans", () => {
    let now = 0;
    const store = new PlanStore(() => now);
    const stored = store.remember(plan);

    now = PLAN_TTL_MS;
    expect(store.take(stored.planId)).toBeUndefined();
  });

  it("keeps a bounded number of plans, dropping the oldest", () => {
    const store = new PlanStore();
    const first = store.remember(plan);
    for (let i = 0; i < MAX_STORED_PLANS; i += 1) store.remember(plan);

    expect(store.size).toBe(MAX_STORED_PLANS);
    expect(store.take(first.planId)).toBeUndefined();
  });
});
