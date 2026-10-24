import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scanFolderAction, type ScanActionState } from "@/app/actions/scan-folder";

import { createTempDir, removeTempDir, writeFixture } from "../helpers/temp-dir";

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));

vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));

const idle: ScanActionState = { status: "idle" };

function form(folderPath: string): FormData {
  const data = new FormData();
  data.set("folderPath", folderPath);
  return data;
}

let workspace: string;
let root: string;

beforeEach(async () => {
  workspace = await realpath(await createTempDir());
  root = path.join(workspace, "inbox");
  await mkdir(root);
  requestHeaders.current = new Headers({ host: "localhost:3000" });
});

afterEach(async () => {
  await removeTempDir(workspace);
});

describe("scanFolderAction", () => {
  it("scans a local folder and returns its metadata", async () => {
    await writeFixture(root, "report.pdf", "pdf");

    const state = await scanFolderAction(idle, form(root));

    expect(state.status).toBe("success");
    if (state.status !== "success") return;
    expect(state.result.files).toMatchObject([{ name: "report.pdf", kind: "document" }]);
  });

  it("accepts quoted paths pasted from Windows Explorer", async () => {
    const state = await scanFolderAction(idle, form(`"${root}"`));
    expect(state.status).toBe("success");
  });

  it("refuses requests that did not come from this computer", async () => {
    requestHeaders.current = new Headers({ host: "192.168.1.20:3000" });

    const state = await scanFolderAction(idle, form(root));

    expect(state).toMatchObject({ status: "error", error: { code: "NOT_LOCAL" } });
  });

  it("returns a safe error for invalid input", async () => {
    const state = await scanFolderAction(idle, new FormData());
    expect(state).toMatchObject({ status: "error", error: { code: "INVALID_PATH" } });
  });

  it("does not leak filesystem error details", async () => {
    const missing = path.join(workspace, "missing");
    const state = await scanFolderAction(idle, form(missing));

    expect(state).toMatchObject({ status: "error", error: { code: "NOT_FOUND" } });
    if (state.status !== "error") return;
    expect(state.error.message).not.toContain("ENOENT");
    expect(state.error.message).not.toContain(missing);
  });
});
