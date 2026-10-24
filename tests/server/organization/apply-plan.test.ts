import * as fsPromises from "node:fs/promises";
import { chmod, mkdir, readFile, realpath, rename, rm, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScanError } from "@/lib/server/files/errors";
import { buildProtectedPathRules } from "@/lib/server/files/protected-paths";
import { applyPlan, runExclusiveApply, type FileOps } from "@/lib/server/organization/apply-plan";
import { ApplyError } from "@/lib/server/organization/errors";

import { planFor, snapshotTree } from "../../helpers/plans";
import {
  createTempDir,
  FIXED_MTIME,
  isRootUser,
  isWindows,
  removeTempDir,
  trySymlink,
  writeFixture,
} from "../../helpers/temp-dir";

let workspace: string;
let root: string;
let outside: string;
let locked: string[];

beforeEach(async () => {
  workspace = await realpath(await createTempDir());
  root = path.join(workspace, "Downloads");
  outside = path.join(workspace, "outside");
  await mkdir(root);
  await writeFixture(outside, "secret.txt", "outside the root");
  await writeFixture(root, "IMG_4821.jpg", "photo-1");
  await writeFixture(root, "IMG_4822.jpg", "photo-2");
  await writeFixture(root, "invoice_march.pdf", "invoice");
  await writeFixture(root, "notes.txt", "notes");
  await writeFixture(root, "Images/existing.jpg", "existing");
  await writeFixture(root, "keep-me.txt", "untouched");
  locked = [];
});

afterEach(async () => {
  await removeTempDir(workspace, locked);
});

const at = (...segments: string[]) => path.join(root, ...segments);
const read = (...segments: string[]) => readFile(at(...segments), "utf8");
const exists = (...segments: string[]) => fsPromises.lstat(at(...segments)).then(() => true, () => false);

describe("applyPlan: successful changes", () => {
  it("renames a file in place", async () => {
    const plan = await planFor(root, [["notes.txt", "meeting-notes.txt"]]);

    const result = await applyPlan(plan, ["notes.txt"]);

    expect(result.results).toEqual([
      { sourcePath: "notes.txt", suggestedPath: "meeting-notes.txt", action: "rename", status: "applied" },
    ]);
    expect(await read("meeting-notes.txt")).toBe("notes");
    expect(await exists("notes.txt")).toBe(false);
  });

  it("moves a file into an existing folder and keeps its timestamps", async () => {
    const plan = await planFor(root, [["IMG_4821.jpg", "Images/IMG_4821.jpg"]]);

    const result = await applyPlan(plan, ["IMG_4821.jpg"]);

    expect(result).toMatchObject({ appliedCount: 1, notAppliedCount: 0, createdFolders: [] });
    expect(await read("Images", "IMG_4821.jpg")).toBe("photo-1");
    expect((await fsPromises.stat(at("Images", "IMG_4821.jpg"))).mtime.toISOString()).toBe(
      FIXED_MTIME.toISOString(),
    );
    expect(await exists("IMG_4821.jpg")).toBe(false);
  });

  it("moves and renames into newly created nested folders", async () => {
    const plan = await planFor(root, [["invoice_march.pdf", "Documents/Invoices/Invoice March.pdf"]]);

    const result = await applyPlan(plan, ["invoice_march.pdf"]);

    expect(result.results[0]).toMatchObject({ action: "move_and_rename", status: "applied" });
    expect(result.createdFolders).toEqual(["Documents", "Documents/Invoices"]);
    expect(await read("Documents", "Invoices", "Invoice March.pdf")).toBe("invoice");
  });

  it("applies only the selected suggestions, in a deterministic order", async () => {
    const plan = await planFor(root, [
      ["notes.txt", "Documents/notes.txt"],
      ["IMG_4822.jpg", "Images/IMG_4822.jpg"],
      ["IMG_4821.jpg", "Images/IMG_4821.jpg"],
    ]);

    const result = await applyPlan(plan, ["notes.txt", "IMG_4821.jpg"]);

    expect(result.results.map((r) => r.sourcePath)).toEqual(["IMG_4821.jpg", "notes.txt"]);
    expect(result.requestedCount).toBe(2);
    expect(await exists("IMG_4822.jpg")).toBe(true);
    expect(await exists("Images", "IMG_4822.jpg")).toBe(false);
  });

  it("never deletes anything and leaves unselected and outside files untouched", async () => {
    const plan = await planFor(root, [
      ["IMG_4821.jpg", "Images/IMG_4821.jpg"],
      ["notes.txt", "Documents/notes.txt"],
    ]);
    const before = await snapshotTree(workspace);

    await applyPlan(plan, ["IMG_4821.jpg", "notes.txt"]);
    const after = await snapshotTree(workspace);

    const fileContents = (snapshot: Record<string, string>) =>
      Object.values(snapshot).filter((v) => v.startsWith("file:")).sort();
    expect(fileContents(after)).toEqual(fileContents(before));
    for (const key of ["keep-me.txt", "IMG_4822.jpg", "invoice_march.pdf", "Images/existing.jpg"]) {
      expect(after[`Downloads/${key}`]).toBe(before[`Downloads/${key}`]);
    }
    expect(after["outside/secret.txt"]).toBe(before["outside/secret.txt"]);
  });
});

describe("applyPlan: fresh re-validation", () => {
  it("rejects a source that disappeared", async () => {
    const plan = await planFor(root, [["notes.txt", "Documents/notes.txt"]]);
    await rm(at("notes.txt"));

    const result = await applyPlan(plan, ["notes.txt"]);

    expect(result.results[0]).toMatchObject({ status: "rejected", reason: "source-missing" });
    expect(await exists("Documents")).toBe(false);
  });

  it("rejects a source whose size changed", async () => {
    const plan = await planFor(root, [["notes.txt", "Documents/notes.txt"]]);
    await writeFile(at("notes.txt"), "notes, now longer");
    await utimes(at("notes.txt"), FIXED_MTIME, FIXED_MTIME);

    const result = await applyPlan(plan, ["notes.txt"]);

    expect(result.results[0]).toMatchObject({ status: "rejected", reason: "source-changed" });
    expect(await read("notes.txt")).toBe("notes, now longer");
  });

  it("rejects a source whose modified time changed", async () => {
    const plan = await planFor(root, [["notes.txt", "Documents/notes.txt"]]);
    const later = new Date(FIXED_MTIME.getTime() + 60_000);
    await utimes(at("notes.txt"), later, later);

    const result = await applyPlan(plan, ["notes.txt"]);

    expect(result.results[0]).toMatchObject({ status: "rejected", reason: "source-changed" });
    expect(await exists("notes.txt")).toBe(true);
  });

  it("rejects a source that became a directory", async () => {
    const plan = await planFor(root, [["notes.txt", "Documents/notes.txt"]]);
    await rm(at("notes.txt"));
    await mkdir(at("notes.txt"));

    const result = await applyPlan(plan, ["notes.txt"]);

    expect(result.results[0]).toMatchObject({ status: "rejected", reason: "source-not-file" });
  });

  it("rejects a source that became a symlink", async (ctx) => {
    const plan = await planFor(root, [["notes.txt", "Documents/notes.txt"]]);
    await rm(at("notes.txt"));
    if (!(await trySymlink(path.join(outside, "secret.txt"), at("notes.txt"), "file"))) ctx.skip();

    const result = await applyPlan(plan, ["notes.txt"]);

    expect(result.results[0]).toMatchObject({ status: "rejected", reason: "source-not-file" });
    expect(await readFile(path.join(outside, "secret.txt"), "utf8")).toBe("outside the root");
    expect(await exists("Documents", "notes.txt")).toBe(false);
  });

  it("rejects a destination that appeared after planning, without overwriting it", async () => {
    const plan = await planFor(root, [["notes.txt", "Documents/notes.txt"]]);
    await writeFixture(root, "Documents/notes.txt", "someone else's notes");

    const result = await applyPlan(plan, ["notes.txt"]);

    expect(result.results[0]).toMatchObject({ status: "rejected", reason: "destination-exists" });
    expect(await read("Documents", "notes.txt")).toBe("someone else's notes");
    expect(await read("notes.txt")).toBe("notes");
  });

  it("rejects a destination that became a symlink (the scanner can't see it)", async (ctx) => {
    const plan = await planFor(root, [["notes.txt", "Documents/notes.txt"]]);
    await mkdir(at("Documents"));
    if (!(await trySymlink(path.join(outside, "secret.txt"), at("Documents", "notes.txt"), "file"))) ctx.skip();

    const result = await applyPlan(plan, ["notes.txt"]);

    expect(result.results[0]).toMatchObject({ status: "rejected", reason: "destination-exists" });
    expect(await readFile(path.join(outside, "secret.txt"), "utf8")).toBe("outside the root");
    expect(await read("notes.txt")).toBe("notes");
  });

  it("rejects a destination folder that became a symlink to outside the root", async (ctx) => {
    const plan = await planFor(root, [["notes.txt", "Documents/notes.txt"]]);
    if (!(await trySymlink(outside, at("Documents"), "dir"))) ctx.skip();

    const result = await applyPlan(plan, ["notes.txt"]);

    expect(result.results[0]).toMatchObject({ status: "rejected", reason: "destination-blocked" });
    expect(await fsPromises.readdir(outside)).toEqual(["secret.txt"]);
    expect(await read("notes.txt")).toBe("notes");
  });

  it("rejects a destination folder blocked by an existing file", async () => {
    const plan = await planFor(root, [["IMG_4821.jpg", "notes.txt/IMG_4821.jpg"]]);

    const result = await applyPlan(plan, ["IMG_4821.jpg"]);

    expect(result.results[0]).toMatchObject({ status: "rejected" });
    expect(await read("notes.txt")).toBe("notes");
  });

  it.each([
    ["path traversal", "../escaped.txt"],
    ["deep traversal", "Documents/../../escaped.txt"],
    ["an absolute path", "/tmp/escaped.txt"],
    ["a Windows absolute path", "C:\\escaped.txt"],
    ["an invalid filename", "Docu:ments/notes.txt"],
    ["a reserved name", "CON/notes.txt"],
    ["a hidden folder", ".hidden/notes.txt"],
    ["a changed extension", "Documents/notes.exe"],
    ["too many folders", "a/b/c/notes.txt"],
  ])("rejects a tampered plan with %s", async (_label, destination) => {
    const plan = await planFor(root, [["notes.txt", destination]]);
    const before = await snapshotTree(workspace);

    const result = await applyPlan(plan, ["notes.txt"]);

    expect(result.results[0]).toMatchObject({ status: "rejected", reason: "unsafe-path" });
    expect(await snapshotTree(workspace)).toEqual(before);
  });

  it("rejects a tampered plan whose source escapes the root", async () => {
    const plan = await planFor(root, [["../outside/secret.txt", "secret.txt"]]);

    const result = await applyPlan(plan, ["../outside/secret.txt"]);

    expect(result.results[0]).toMatchObject({ status: "rejected", reason: "unsafe-path" });
    expect(await readFile(path.join(outside, "secret.txt"), "utf8")).toBe("outside the root");
    expect(await exists("secret.txt")).toBe(false);
  });

  it("rejects duplicate destinations", async () => {
    const plan = await planFor(root, [
      ["IMG_4821.jpg", "Images/photo.jpg"],
      ["IMG_4822.jpg", "Images/photo.jpg"],
    ]);

    const result = await applyPlan(plan, ["IMG_4821.jpg", "IMG_4822.jpg"]);

    expect(result.results.map((r) => [r.status, r.reason])).toEqual([
      ["rejected", "conflict"],
      ["rejected", "conflict"],
    ]);
    expect(await exists("Images", "photo.jpg")).toBe(false);
  });

  it("rejects chains and swaps between selected changes", async () => {
    const plan = await planFor(root, [
      ["IMG_4821.jpg", "IMG_4822.jpg"],
      ["IMG_4822.jpg", "IMG_4821.jpg"],
    ]);

    const result = await applyPlan(plan, ["IMG_4821.jpg", "IMG_4822.jpg"]);

    expect(result.appliedCount).toBe(0);
    expect(result.results.every((r) => r.reason === "destination-exists")).toBe(true);
    expect(await read("IMG_4821.jpg")).toBe("photo-1");
    expect(await read("IMG_4822.jpg")).toBe("photo-2");
  });
});

describe("applyPlan: partial failures", () => {
  it("reports exactly which changes applied and which did not", async () => {
    const plan = await planFor(root, [
      ["IMG_4821.jpg", "Images/IMG_4821.jpg"],
      ["notes.txt", "Documents/notes.txt"],
      ["invoice_march.pdf", "Documents/invoice_march.pdf"],
    ]);
    await rm(at("notes.txt"));

    const result = await applyPlan(plan, ["IMG_4821.jpg", "notes.txt", "invoice_march.pdf"]);

    expect(result).toMatchObject({ requestedCount: 3, appliedCount: 2, notAppliedCount: 1 });
    expect(result.results.map((r) => [r.sourcePath, r.status, r.reason])).toEqual([
      ["IMG_4821.jpg", "applied", undefined],
      ["invoice_march.pdf", "applied", undefined],
      ["notes.txt", "rejected", "source-missing"],
    ]);
  });

  it("stops after an unexpected error and reports the rest as not attempted", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const plan = await planFor(root, [
      ["IMG_4821.jpg", "Images/IMG_4821.jpg"],
      ["IMG_4822.jpg", "Images/IMG_4822.jpg"],
      ["notes.txt", "Documents/notes.txt"],
    ]);
    let calls = 0;
    const ops: FileOps = {
      ...fsPromises,
      link: async (...args: Parameters<typeof fsPromises.link>) => {
        calls += 1;
        if (calls === 2) throw Object.assign(new Error("disk on fire"), { code: "EIO" });
        return fsPromises.link(...args);
      },
    };

    const result = await applyPlan(plan, ["IMG_4821.jpg", "IMG_4822.jpg", "notes.txt"], { ops });

    expect(result.results.map((r) => [r.sourcePath, r.status, r.reason])).toEqual([
      ["IMG_4821.jpg", "applied", undefined],
      ["IMG_4822.jpg", "failed", "unexpected"],
      ["notes.txt", "not-attempted", "earlier-failure"],
    ]);
    expect(await read("IMG_4822.jpg")).toBe("photo-2");
    expect(await read("notes.txt")).toBe("notes");
    expect(await exists("Documents")).toBe(false);
    consoleError.mockRestore();
  });

  it("never overwrites a destination that appears between the check and the move", async () => {
    const destination = at("Images", "IMG_4821.jpg");
    const ops: FileOps = {
      ...fsPromises,
      lstat: (async (target: string, ...rest: unknown[]) => {
        if (target === destination && !(await exists("Images", "IMG_4821.jpg"))) {
          // Someone else writes the destination right after TidyMate looked.
          await writeFile(destination, "arrived in a race");
          throw Object.assign(new Error("not found"), { code: "ENOENT" });
        }
        return (fsPromises.lstat as (...args: unknown[]) => unknown)(target, ...rest);
      }) as FileOps["lstat"],
    };
    const plan = await planFor(root, [["IMG_4821.jpg", "Images/IMG_4821.jpg"]]);

    const result = await applyPlan(plan, ["IMG_4821.jpg"], { ops });

    expect(result.results[0]).toMatchObject({ status: "failed", reason: "destination-exists" });
    expect(await read("Images", "IMG_4821.jpg")).toBe("arrived in a race");
    expect(await read("IMG_4821.jpg")).toBe("photo-1");
  });

  it("removes folders it created when the move then fails", async () => {
    const ops: FileOps = {
      ...fsPromises,
      link: async () => {
        throw Object.assign(new Error("cross-device"), { code: "EXDEV" });
      },
    };
    const plan = await planFor(root, [["notes.txt", "Documents/Work/notes.txt"]]);

    const result = await applyPlan(plan, ["notes.txt"], { ops });

    expect(result.results[0]).toMatchObject({ status: "failed", reason: "unsupported-filesystem" });
    expect(result.createdFolders).toEqual([]);
    expect(await exists("Documents")).toBe(false);
    expect(await read("notes.txt")).toBe("notes");
  });

  it("restores the original if the old name can't be removed", async () => {
    const ops: FileOps = {
      ...fsPromises,
      unlink: async (target: Parameters<typeof fsPromises.unlink>[0]) => {
        if (String(target).endsWith("notes.txt") && !String(target).includes("Documents")) {
          throw Object.assign(new Error("denied"), { code: "EACCES" });
        }
        return fsPromises.unlink(target);
      },
    };
    const plan = await planFor(root, [["notes.txt", "Documents/notes.txt"]]);

    const result = await applyPlan(plan, ["notes.txt"], { ops });

    expect(result.results[0]).toMatchObject({ status: "failed", reason: "permission-denied" });
    expect(await read("notes.txt")).toBe("notes");
    expect(await exists("Documents", "notes.txt")).toBe(false);
  });

  it.skipIf(isWindows || isRootUser)("reports a read-only destination folder and continues", async () => {
    const plan = await planFor(root, [
      ["IMG_4821.jpg", "Images/IMG_4821.jpg"],
      ["notes.txt", "notes-renamed.txt"],
    ]);
    await chmod(at("Images"), 0o555);
    locked.push(at("Images"));

    const result = await applyPlan(plan, ["IMG_4821.jpg", "notes.txt"]);

    expect(result.results.map((r) => [r.status, r.reason])).toEqual([
      ["failed", "permission-denied"],
      ["applied", undefined],
    ]);
    expect(await read("IMG_4821.jpg")).toBe("photo-1");
  });
});

describe("applyPlan: whole-request checks", () => {
  it("rejects a selection that isn't part of the plan", async () => {
    const plan = await planFor(root, [["notes.txt", "Documents/notes.txt"]]);
    await expect(applyPlan(plan, ["IMG_4821.jpg"])).rejects.toBeInstanceOf(ApplyError);
    await expect(applyPlan(plan, ["notes.txt", "invented.txt"])).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(applyPlan(plan, [])).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(await read("notes.txt")).toBe("notes");
  });

  it("refuses when the folder was replaced by a link elsewhere", async (ctx) => {
    const plan = await planFor(root, [["notes.txt", "Documents/notes.txt"]]);
    await rename(root, path.join(workspace, "moved-away"));
    if (!(await trySymlink(outside, root, "dir"))) ctx.skip();

    await expect(applyPlan(plan, ["notes.txt"])).rejects.toMatchObject({ code: "ROOT_CHANGED" });
    expect(await fsPromises.readdir(outside)).toEqual(["secret.txt"]);
  });

  it("refuses when the folder no longer exists", async () => {
    const plan = await planFor(root, [["notes.txt", "Documents/notes.txt"]]);
    await rename(root, path.join(workspace, "moved-away"));

    await expect(applyPlan(plan, ["notes.txt"])).rejects.toBeInstanceOf(ScanError);
  });

  it("refuses plans for protected folders", async () => {
    const plan = { ...(await planFor(root, [["notes.txt", "Documents/notes.txt"]])), rootPath: path.parse(root).root };
    await expect(applyPlan(plan, ["notes.txt"])).rejects.toMatchObject({ code: "PROTECTED_PATH" });
  });

  it("never writes into a protected location inside the folder", async () => {
    const rules = buildProtectedPathRules({ platform: process.platform, homedir: "", env: {} });
    rules.subtree.push(at("System"));
    const plan = await planFor(root, [["notes.txt", "System/notes.txt"]]);

    const result = await applyPlan(plan, ["notes.txt"], { protectedPaths: rules });

    expect(result.results[0]).toMatchObject({ status: "rejected", reason: "unsafe-path" });
    expect(await exists("System")).toBe(false);
  });
});

describe("runExclusiveApply", () => {
  it("runs one apply at a time", async () => {
    let release!: () => void;
    const first = runExclusiveApply(() => new Promise<string>((resolve) => { release = () => resolve("done"); }));

    await expect(runExclusiveApply(async () => "second")).resolves.toBe("busy");
    release();
    await expect(first).resolves.toBe("done");
    await expect(runExclusiveApply(async () => "third")).resolves.toBe("third");
  });
});
