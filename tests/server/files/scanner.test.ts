import { chmod, mkdir, readdir, readFile, realpath } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ScanError } from "@/lib/server/files/errors";
import { buildProtectedPathRules } from "@/lib/server/files/protected-paths";
import { MAX_SKIPPED_SAMPLES, scanDirectory } from "@/lib/server/files/scanner";

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
let locked: string[];

beforeEach(async () => {
  workspace = await realpath(await createTempDir());
  root = path.join(workspace, "inbox");
  await mkdir(root);
  locked = [];
});

afterEach(async () => {
  await removeTempDir(workspace, locked);
});

async function expectScanError(promise: Promise<unknown>, code: ScanError["code"]) {
  await expect(promise).rejects.toBeInstanceOf(ScanError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe("scanDirectory", () => {
  it("returns an empty result for an empty folder", async () => {
    const result = await scanDirectory(root);

    expect(result.rootPath).toBe(root);
    expect(result.rootName).toBe("inbox");
    expect(result.files).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.stats).toMatchObject({
      fileCount: 0,
      directoryCount: 0,
      totalSizeBytes: 0,
      skippedCount: 0,
    });
  });

  it("collects metadata for multiple files in a stable order", async () => {
    await writeFixture(root, "invoice-march.pdf", "x".repeat(2048));
    await writeFixture(root, "Holiday Photo.JPG", Buffer.alloc(5000));
    await writeFixture(root, "notes", "hello");
    await writeFixture(root, "backup.tar.gz", "");

    const result = await scanDirectory(root);

    expect(result.files).toEqual([
      {
        name: "Holiday Photo.JPG",
        extension: "jpg",
        relativePath: "Holiday Photo.JPG",
        sizeBytes: 5000,
        modifiedAt: FIXED_MTIME.toISOString(),
        kind: "image",
      },
      {
        name: "backup.tar.gz",
        extension: "tar.gz",
        relativePath: "backup.tar.gz",
        sizeBytes: 0,
        modifiedAt: FIXED_MTIME.toISOString(),
        kind: "archive",
      },
      {
        name: "invoice-march.pdf",
        extension: "pdf",
        relativePath: "invoice-march.pdf",
        sizeBytes: 2048,
        modifiedAt: FIXED_MTIME.toISOString(),
        kind: "document",
      },
      {
        name: "notes",
        extension: "",
        relativePath: "notes",
        sizeBytes: 5,
        modifiedAt: FIXED_MTIME.toISOString(),
        kind: "other",
      },
    ]);
    expect(result.stats.fileCount).toBe(4);
    expect(result.stats.totalSizeBytes).toBe(2048 + 5000 + 5);
  });

  it("reports each file's own modified timestamp", async () => {
    const older = new Date("2021-01-02T03:04:05.000Z");
    await writeFixture(root, "old.txt", "a", older);
    await writeFixture(root, "new.txt", "b");

    const result = await scanDirectory(root);
    const byName = Object.fromEntries(result.files.map((f) => [f.name, f.modifiedAt]));

    expect(byName["old.txt"]).toBe(older.toISOString());
    expect(byName["new.txt"]).toBe(FIXED_MTIME.toISOString());
  });

  it("walks nested folders and reports POSIX relative paths", async () => {
    await writeFixture(root, "top.txt", "1");
    await writeFixture(root, "receipts/2024/jan.pdf", "22");
    await writeFixture(root, "receipts/2024/feb.pdf", "333");
    await writeFixture(root, "music/song.mp3", "4444");
    await mkdir(path.join(root, "empty-folder"));

    const result = await scanDirectory(root);

    expect(result.files.map((f) => f.relativePath)).toEqual([
      "music/song.mp3",
      "receipts/2024/feb.pdf",
      "receipts/2024/jan.pdf",
      "top.txt",
    ]);
    expect(result.files.find((f) => f.name === "feb.pdf")?.sizeBytes).toBe(3);
    expect(result.stats.directoryCount).toBe(4);
  });

  it("never reports absolute paths or traversal segments", async () => {
    await writeFixture(root, "a/b/c/d.txt");
    await writeFixture(workspace, "outside.txt");

    const result = await scanDirectory(root);

    expect(result.files.map((f) => f.name)).not.toContain("outside.txt");
    for (const file of result.files) {
      expect(path.isAbsolute(file.relativePath)).toBe(false);
      expect(file.relativePath.split("/")).not.toContain("..");
      expect(file.relativePath).not.toContain("\\");
    }
  });

  it("normalizes a root path containing traversal segments", async () => {
    await writeFixture(root, "kept.txt");
    await mkdir(path.join(root, "sub"));

    const result = await scanDirectory(path.join(root, "sub", ".."));

    expect(result.rootPath).toBe(root);
    expect(result.files.map((f) => f.relativePath)).toEqual(["kept.txt"]);
  });

  it("skips hidden files and folders unless asked to include them", async () => {
    await writeFixture(root, "visible.txt");
    await writeFixture(root, ".DS_Store");
    await writeFixture(root, ".git/config");

    const result = await scanDirectory(root);
    expect(result.files.map((f) => f.relativePath)).toEqual(["visible.txt"]);
    expect(result.stats.skippedByReason.hidden).toBe(2);

    const withHidden = await scanDirectory(root, { includeHidden: true });
    expect(withHidden.files.map((f) => f.relativePath)).toEqual([
      ".DS_Store",
      ".git/config",
      "visible.txt",
    ]);
  });

  it("does not modify, move, or create anything", async () => {
    await writeFixture(root, "keep.txt", "original contents");
    await writeFixture(root, "nested/also.txt", "more");
    const before = await readdir(root, { recursive: true });

    await scanDirectory(root);

    expect(await readdir(root, { recursive: true })).toEqual(before);
    expect(await readFile(path.join(root, "keep.txt"), "utf8")).toBe("original contents");
  });

  it("stops at the depth limit and records skipped folders", async () => {
    await writeFixture(root, "l1/l1.txt");
    await writeFixture(root, "l1/l2/l2.txt");
    await writeFixture(root, "l1/l2/l3/l3.txt");

    const result = await scanDirectory(root, { maxDepth: 2 });

    expect(result.files.map((f) => f.relativePath)).toEqual(["l1/l1.txt", "l1/l2/l2.txt"]);
    expect(result.skipped).toContainEqual({ relativePath: "l1/l2/l3", reason: "too-deep" });
  });

  it("stops at the file limit, preferring shallow files", async () => {
    await writeFixture(root, "deep/z1.txt");
    await writeFixture(root, "deep/z2.txt");
    await writeFixture(root, "a.txt");
    await writeFixture(root, "b.txt");

    const result = await scanDirectory(root, { maxFiles: 3 });

    expect(result.truncated).toBe(true);
    expect(result.files.map((f) => f.relativePath)).toEqual(["a.txt", "b.txt", "deep/z1.txt"]);
  });

  it("is not truncated when the file count exactly matches the limit", async () => {
    await writeFixture(root, "a.txt");
    await writeFixture(root, "b.txt");

    const result = await scanDirectory(root, { maxFiles: 2 });

    expect(result.truncated).toBe(false);
    expect(result.files).toHaveLength(2);
  });

  it("caps the skipped sample while keeping exact counts", async () => {
    const total = MAX_SKIPPED_SAMPLES + 5;
    for (let i = 0; i < total; i += 1) {
      await writeFixture(root, `.hidden-${String(i).padStart(3, "0")}`);
    }

    const result = await scanDirectory(root);

    expect(result.skipped).toHaveLength(MAX_SKIPPED_SAMPLES);
    expect(result.stats.skippedByReason.hidden).toBe(total);
    expect(result.stats.skippedCount).toBe(total);
  });

  it("measures duration with the injected clock", async () => {
    const times = [new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.250Z")];
    const result = await scanDirectory(root, { now: () => times.shift() ?? new Date(0) });

    expect(result.durationMs).toBe(250);
    expect(result.scannedAt).toBe("2026-01-01T00:00:00.250Z");
  });

  describe("symbolic links", () => {
    it("skips a link to a file inside the root instead of following it", async (ctx) => {
      const target = await writeFixture(root, "real.txt", "data");
      if (!(await trySymlink(target, path.join(root, "alias.txt"), "file"))) ctx.skip();

      const result = await scanDirectory(root);

      expect(result.files.map((f) => f.relativePath)).toEqual(["real.txt"]);
      expect(result.skipped).toContainEqual({ relativePath: "alias.txt", reason: "symlink" });
    });

    it("never follows a link to a folder outside the root", async (ctx) => {
      const outside = path.join(workspace, "outside");
      await writeFixture(outside, "secret.txt", "do not read");
      if (!(await trySymlink(outside, path.join(root, "escape"), "dir"))) ctx.skip();

      const result = await scanDirectory(root);

      expect(result.files).toEqual([]);
      expect(result.stats.directoryCount).toBe(0);
      expect(result.skipped).toEqual([{ relativePath: "escape", reason: "symlink" }]);
    });

    it("never follows a link to a parent folder", async (ctx) => {
      await writeFixture(workspace, "parent-file.txt");
      if (!(await trySymlink("..", path.join(root, "up"), "dir"))) ctx.skip();

      const result = await scanDirectory(root);

      expect(result.files).toEqual([]);
      expect(result.stats.skippedByReason.symlink).toBe(1);
    });

    it("handles broken links without failing the scan", async (ctx) => {
      await writeFixture(root, "ok.txt");
      if (!(await trySymlink(path.join(workspace, "missing"), path.join(root, "dangling"), "file"))) {
        ctx.skip();
      }

      const result = await scanDirectory(root);

      expect(result.files.map((f) => f.name)).toEqual(["ok.txt"]);
      expect(result.skipped).toContainEqual({ relativePath: "dangling", reason: "symlink" });
    });

    it("resolves a root that is itself a link and reports its real path", async (ctx) => {
      await writeFixture(root, "inside.txt");
      const link = path.join(workspace, "inbox-link");
      if (!(await trySymlink(root, link, "dir"))) ctx.skip();

      const result = await scanDirectory(link);

      expect(result.rootPath).toBe(root);
      expect(result.files.map((f) => f.relativePath)).toEqual(["inside.txt"]);
    });

    it("rejects a root link that points into a protected folder", async (ctx) => {
      const guarded = path.join(workspace, "guarded");
      await mkdir(guarded);
      const link = path.join(workspace, "sneaky");
      if (!(await trySymlink(guarded, link, "dir"))) ctx.skip();

      const rules = buildProtectedPathRules({ platform: process.platform, homedir: "", env: {} });
      rules.subtree.push(guarded);

      await expectScanError(scanDirectory(link, { protectedPaths: rules }), "PROTECTED_PATH");
    });
  });

  describe.skipIf(isWindows)("special entries", () => {
    it("skips sockets without opening them", async () => {
      await writeFixture(root, "normal.txt");
      const socketPath = path.join(root, "app.sock");
      const server = net.createServer();
      await new Promise<void>((resolve) => server.listen(socketPath, resolve));

      try {
        const result = await scanDirectory(root);

        expect(result.files.map((f) => f.name)).toEqual(["normal.txt"]);
        expect(result.skipped).toEqual([{ relativePath: "app.sock", reason: "special" }]);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe.skipIf(isWindows || isRootUser)("inaccessible entries", () => {
    it("skips an unreadable subfolder and keeps scanning", async () => {
      await writeFixture(root, "a-visible.txt");
      await writeFixture(root, "private/secret.txt");
      await writeFixture(root, "z-visible.txt");
      const privateDir = path.join(root, "private");
      await chmod(privateDir, 0o000);
      locked.push(privateDir);

      const result = await scanDirectory(root);

      expect(result.files.map((f) => f.relativePath)).toEqual(["a-visible.txt", "z-visible.txt"]);
      expect(result.skipped).toContainEqual({ relativePath: "private", reason: "unreadable" });
    });

    it("still reports metadata for a file it is not allowed to read", async () => {
      const file = await writeFixture(root, "locked.txt", "12345");
      await chmod(file, 0o000);
      locked.push(file);

      const result = await scanDirectory(root);

      expect(result.files).toMatchObject([{ name: "locked.txt", sizeBytes: 5 }]);
    });

    it("fails with a safe error when the root itself is unreadable", async () => {
      await chmod(root, 0o000);
      locked.push(root);

      await expectScanError(scanDirectory(root), "PERMISSION_DENIED");
    });
  });

  describe("invalid roots", () => {
    it("rejects a folder that does not exist", async () => {
      await expectScanError(scanDirectory(path.join(workspace, "nope")), "NOT_FOUND");
    });

    it("rejects a file", async () => {
      const file = await writeFixture(root, "file.txt");
      await expectScanError(scanDirectory(file), "NOT_A_DIRECTORY");
    });

    it.each(["", "   ", "relative/folder", "../inbox", "./inbox", "~/Downloads"])(
      "rejects non-absolute input %j",
      async (input) => {
        await expectScanError(scanDirectory(input), "INVALID_PATH");
      },
    );

    it("rejects input containing a NUL byte", async () => {
      await expectScanError(scanDirectory(`${root}\0/etc`), "INVALID_PATH");
    });

    it("rejects the home folder itself but allows folders inside it", async () => {
      const rules = buildProtectedPathRules({
        platform: process.platform,
        homedir: workspace,
        env: {},
      });

      await expectScanError(scanDirectory(workspace, { protectedPaths: rules }), "PROTECTED_PATH");
      await expect(scanDirectory(root, { protectedPaths: rules })).resolves.toMatchObject({
        rootPath: root,
      });
    });

    it("rejects the filesystem root", async () => {
      await expectScanError(scanDirectory(path.parse(root).root), "PROTECTED_PATH");
    });

    it.skipIf(isWindows)("rejects system folders, including via traversal", async () => {
      await expectScanError(scanDirectory("/etc"), "PROTECTED_PATH");
      await expectScanError(scanDirectory(`${root}/../../../../../../../../etc`), "PROTECTED_PATH");
    });
  });
});
