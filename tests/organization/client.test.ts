import { afterEach, describe, expect, it, vi } from "vitest";

import { requestOrganizationPlan } from "@/lib/organization/client";

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
