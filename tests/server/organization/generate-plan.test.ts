import { mkdir, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiError } from "@/lib/ai/errors";
import type { OrganizationProposal, OrganizationProvider, OrganizationRequest } from "@/lib/ai/provider";
import { ScanError } from "@/lib/server/files/errors";
import { generateOrganizationPlan } from "@/lib/server/organization/generate-plan";
import { MAX_FILES_FOR_SUGGESTIONS } from "@/lib/organization/limits";

import { candidate } from "../../helpers/organization";
import { createTempDir, removeTempDir, writeFixture } from "../../helpers/temp-dir";

let workspace: string;
let root: string;

beforeEach(async () => {
  workspace = await realpath(await createTempDir());
  root = path.join(workspace, "Downloads");
  await mkdir(root);
});

afterEach(async () => {
  await removeTempDir(workspace);
});

function fakeProvider(answer: (request: OrganizationRequest) => OrganizationProposal["items"]) {
  const calls: OrganizationRequest[] = [];
  const provider: OrganizationProvider = {
    id: "fake",
    model: "fake-model",
    suggestOrganization: vi.fn(async (request: OrganizationRequest) => {
      calls.push(request);
      return { items: answer(request), model: "fake-model" };
    }),
  };
  return { provider, calls };
}

describe("generateOrganizationPlan", () => {
  it("re-scans the folder and returns validated suggestions", async () => {
    await writeFixture(root, "IMG_4821.jpg", "x".repeat(3000));
    await writeFixture(root, "notes.txt", "hi");
    const { provider } = fakeProvider(() => [
      candidate("IMG_4821.jpg", "Images/IMG_4821.jpg"),
      candidate("ghost.pdf", "Documents/ghost.pdf"),
    ]);

    const plan = await generateOrganizationPlan(root, { provider });

    expect(plan).toMatchObject({
      rootPath: root,
      rootName: "Downloads",
      model: "fake-model",
      consideredFileCount: 2,
      totalFileCount: 2,
      unchangedCount: 1,
      suggestions: [
        {
          sourcePath: "IMG_4821.jpg",
          suggestedPath: "Images/IMG_4821.jpg",
          action: "move",
          source: { sizeBytes: 3000, kind: "image" },
        },
      ],
      rejected: [{ sourcePath: "ghost.pdf", reason: "unknown-source" }],
    });
  });

  it("sends the model only relative metadata, never absolute paths", async () => {
    await writeFixture(root, "report.pdf", "secret contents");
    await writeFixture(root, "sub/photo.jpg");
    const { provider, calls } = fakeProvider(() => []);

    await generateOrganizationPlan(root, { provider });

    const sent = JSON.stringify(calls[0]);
    expect(calls[0]).toEqual({
      folderName: "Downloads",
      files: [
        { path: "report.pdf", kind: "document", size: "15 B", modified: "2026-03-14" },
        { path: "sub/photo.jpg", kind: "image", size: "0 B", modified: "2026-03-14" },
      ],
    });
    expect(sent).not.toContain(workspace);
    expect(sent).not.toContain("secret contents");
  });

  it(`sends at most ${MAX_FILES_FOR_SUGGESTIONS} files`, async () => {
    for (let i = 0; i < MAX_FILES_FOR_SUGGESTIONS + 5; i += 1) {
      await writeFixture(root, `file-${String(i).padStart(2, "0")}.txt`);
    }
    const { provider, calls } = fakeProvider(() => []);

    const plan = await generateOrganizationPlan(root, { provider });

    expect(calls[0]?.files).toHaveLength(MAX_FILES_FOR_SUGGESTIONS);
    expect(plan.consideredFileCount).toBe(MAX_FILES_FOR_SUGGESTIONS);
    expect(plan.totalFileCount).toBe(MAX_FILES_FOR_SUGGESTIONS + 5);
  });

  it("does not call the model for an empty folder", async () => {
    const { provider } = fakeProvider(() => []);
    const plan = await generateOrganizationPlan(root, { provider });

    expect(provider.suggestOrganization).not.toHaveBeenCalled();
    expect(plan.suggestions).toEqual([]);
    expect(plan.totalFileCount).toBe(0);
  });

  it("returns an empty plan when the model suggests nothing", async () => {
    await writeFixture(root, "a.txt");
    const { provider } = fakeProvider(() => []);
    const plan = await generateOrganizationPlan(root, { provider });
    expect(plan.suggestions).toEqual([]);
    expect(plan.unchangedCount).toBe(1);
  });

  it("fails validation when every suggestion is rejected", async () => {
    await writeFixture(root, "a.txt");
    const { provider } = fakeProvider(() => [
      candidate("a.txt", "../a.txt"),
      candidate("invented.txt", "Docs/invented.txt"),
    ]);

    await expect(generateOrganizationPlan(root, { provider })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("propagates scanner errors for unsafe folders without calling the model", async () => {
    const { provider } = fakeProvider(() => []);
    await expect(generateOrganizationPlan("relative/path", { provider })).rejects.toBeInstanceOf(ScanError);
    await expect(generateOrganizationPlan("/", { provider })).rejects.toMatchObject({ code: "PROTECTED_PATH" });
    expect(provider.suggestOrganization).not.toHaveBeenCalled();
  });

  it("passes the cancellation signal to the provider and propagates provider errors", async () => {
    await writeFixture(root, "a.txt");
    const controller = new AbortController();
    const provider: OrganizationProvider = {
      id: "fake",
      model: "fake-model",
      suggestOrganization: vi.fn(async (_req, options) => {
        expect(options?.signal).toBe(controller.signal);
        throw new AiError("CANCELLED");
      }),
    };

    await expect(
      generateOrganizationPlan(root, { provider, signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("never changes the folder", async () => {
    await writeFixture(root, "IMG_4821.jpg");
    const before = await readdir(root, { recursive: true });
    const { provider } = fakeProvider(() => [candidate("IMG_4821.jpg", "Images/IMG_4821.jpg")]);

    await generateOrganizationPlan(root, { provider });

    expect(await readdir(root, { recursive: true })).toEqual(before);
  });
});
