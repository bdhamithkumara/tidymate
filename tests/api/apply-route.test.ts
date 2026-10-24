import { mkdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/apply/route";
import { getPlanStore } from "@/lib/server/organization/plan-store";
import type { ApplyResponse, ReviewablePlan } from "@/types/organization";

import { draftPlanFor, snapshotTree } from "../helpers/plans";
import { createTempDir, removeTempDir, writeFixture } from "../helpers/temp-dir";

let workspace: string;
let root: string;
let plan: ReviewablePlan;

beforeEach(async () => {
  workspace = await realpath(await createTempDir());
  root = path.join(workspace, "Downloads");
  await mkdir(root);
  await writeFixture(root, "IMG_4821.jpg", "photo");
  await writeFixture(root, "notes.txt", "notes");
  // Stored the way the suggestions route does.
  plan = getPlanStore().remember(
    await draftPlanFor(root, [
      ["IMG_4821.jpg", "Images/IMG_4821.jpg"],
      ["notes.txt", "Documents/notes.txt"],
    ]),
  );
});

afterEach(async () => {
  await removeTempDir(workspace);
});

function post(body: unknown, headers: Record<string, string> = {}, raw = false): Request {
  return new Request("http://localhost:3000/api/apply", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

async function read(response: Response): Promise<ApplyResponse> {
  return (await response.json()) as ApplyResponse;
}

describe("POST /api/apply", () => {
  it("applies the selected changes of a stored plan", async () => {
    const response = await POST(post({ planId: plan.planId, sourcePaths: ["IMG_4821.jpg"] }));
    const body = await read(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      result: {
        requestedCount: 1,
        appliedCount: 1,
        results: [{ sourcePath: "IMG_4821.jpg", suggestedPath: "Images/IMG_4821.jpg", status: "applied" }],
        createdFolders: ["Images"],
      },
    });
    expect(await readFile(path.join(root, "Images", "IMG_4821.jpg"), "utf8")).toBe("photo");
    expect(await readFile(path.join(root, "notes.txt"), "utf8")).toBe("notes");
  });

  it("makes plans single-use", async () => {
    await POST(post({ planId: plan.planId, sourcePaths: ["IMG_4821.jpg"] }));
    const replay = await POST(post({ planId: plan.planId, sourcePaths: ["notes.txt"] }));

    expect(replay.status).toBe(410);
    expect(await read(replay)).toMatchObject({ ok: false, error: { code: "PLAN_NOT_FOUND" } });
    expect(await readFile(path.join(root, "notes.txt"), "utf8")).toBe("notes");
  });

  it("rejects unknown plans", async () => {
    const response = await POST(
      post({ planId: "00000000-0000-4000-8000-000000000000", sourcePaths: ["notes.txt"] }),
    );
    expect(response.status).toBe(410);
  });

  it("rejects a selection that isn't in the plan, changing nothing", async () => {
    const before = await snapshotTree(workspace);
    const response = await POST(post({ planId: plan.planId, sourcePaths: ["../outside.txt"] }));

    expect(response.status).toBe(400);
    expect(await read(response)).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(await snapshotTree(workspace)).toEqual(before);
  });

  describe("rejects invalid input without touching anything", () => {
    it.each([
      ["malformed JSON", "{nope", true],
      ["no selection", { planId: "00000000-0000-4000-8000-000000000000", sourcePaths: [] }, false],
      ["a duplicate selection", { planId: "00000000-0000-4000-8000-000000000000", sourcePaths: ["a", "a"] }, false],
      ["a non-uuid plan id", { planId: "../../plan", sourcePaths: ["a"] }, false],
      ["client-supplied destinations", { planId: "00000000-0000-4000-8000-000000000000", sourcePaths: ["a"], changes: [{ from: "a", to: "/etc/a" }] }, false],
      ["a client-supplied folder", { planId: "00000000-0000-4000-8000-000000000000", sourcePaths: ["a"], folderPath: "/" }, false],
      ["a delete operation", { planId: "00000000-0000-4000-8000-000000000000", sourcePaths: ["a"], action: "delete" }, false],
    ])("%s", async (_label, body, raw) => {
      const before = await snapshotTree(workspace);
      const response = await POST(post(body, {}, raw));
      expect(response.status).toBe(400);
      expect(await read(response)).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
      expect(await snapshotTree(workspace)).toEqual(before);
    });
  });

  describe("keeps the local-only, same-origin protections", () => {
    it.each([
      ["a LAN host", { host: "192.168.1.20:3000", origin: "http://192.168.1.20:3000" }],
      ["a cross-site origin", { origin: "http://evil.test" }],
      ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
      ["a form post", { "content-type": "application/x-www-form-urlencoded" }],
    ])("%s", async (_label, headers) => {
      const response = await POST(post({ planId: plan.planId, sourcePaths: ["notes.txt"] }, headers));
      expect(response.status).toBe(403);
      expect(await readFile(path.join(root, "notes.txt"), "utf8")).toBe("notes");
      // The plan wasn't consumed by the rejected request.
      expect(getPlanStore().take(plan.planId)).toBeDefined();
    });
  });

  it("reports a vanished folder safely", async () => {
    await removeTempDir(root);
    const response = await POST(post({ planId: plan.planId, sourcePaths: ["notes.txt"] }));
    const text = await response.text();

    expect(response.status).toBe(404);
    expect(JSON.parse(text)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(text).not.toContain("ENOENT");
  });
});
