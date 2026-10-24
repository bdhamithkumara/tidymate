import { afterEach, describe, expect, it, vi } from "vitest";

import { requestApply, requestOrganizationPlan } from "@/lib/organization/client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestOrganizationPlan", () => {
  it("sends only the folder path as JSON", async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true, plan: { suggestions: [] } }));
    vi.stubGlobal("fetch", fetch);

    const result = await requestOrganizationPlan("/data/inbox", new AbortController().signal);

    expect(result).toEqual({ ok: true, plan: { suggestions: [] } });
    expect(fetch).toHaveBeenCalledWith(
      "/api/suggestions",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath: "/data/inbox" }),
      }),
    );
  });

  it("passes through safe server errors", async () => {
    const error = { code: "TIMEOUT", message: "Too slow.", retryable: true };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error }, { status: 504 })));

    await expect(requestOrganizationPlan("/x", new AbortController().signal)).resolves.toEqual({
      ok: false,
      error,
    });
  });

  it("turns network failures and unexpected bodies into a friendly error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(requestOrganizationPlan("/x", new AbortController().signal)).resolves.toMatchObject({
      ok: false,
      error: { code: "UNKNOWN", retryable: true },
    });

    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>oops</html>", { status: 500 })));
    await expect(requestOrganizationPlan("/x", new AbortController().signal)).resolves.toMatchObject({
      ok: false,
      error: { code: "UNKNOWN" },
    });
  });

  it("re-throws when cancelled", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        controller.abort();
        throw new DOMException("Aborted", "AbortError");
      }),
    );
    await expect(requestOrganizationPlan("/x", controller.signal)).rejects.toThrow("Aborted");
  });
});

describe("requestApply", () => {
  it("sends only the plan id and selected source paths", async () => {
    const result = { requestedCount: 1, appliedCount: 1 };
    const fetch = vi.fn(async () => Response.json({ ok: true, result }));
    vi.stubGlobal("fetch", fetch);

    await expect(requestApply("plan-1", ["a.jpg"])).resolves.toEqual({ ok: true, result });
    expect(fetch).toHaveBeenCalledWith(
      "/api/apply",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ planId: "plan-1", sourcePaths: ["a.jpg"] }),
      }),
    );
  });

  it("passes through safe server errors", async () => {
    const error = { code: "PLAN_NOT_FOUND", message: "Expired." };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error }, { status: 410 })));
    await expect(requestApply("p", ["a"])).resolves.toEqual({ ok: false, error });
  });

  it("never claims success when the server can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const response = await requestApply("p", ["a"]);
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.message).toContain("outcome is unknown");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("garbage", { status: 200 })));
    await expect(requestApply("p", ["a"])).resolves.toMatchObject({ ok: false });
  });
});
