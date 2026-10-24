import { chmod, mkdir, mkdtemp, rm, symlink, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const FIXED_MTIME = new Date("2026-03-14T09:26:53.000Z");

export const isWindows = process.platform === "win32";
export const isRootUser = typeof process.getuid === "function" && process.getuid() === 0;

/** Creates an isolated directory under the OS temp folder. */
export async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "tidymate-test-"));
}

/** Removes a temp directory, restoring permissions a test may have revoked. */
export async function removeTempDir(dir: string, lockedPaths: string[] = []): Promise<void> {
  for (const locked of lockedPaths) {
    await chmod(locked, 0o755).catch(() => undefined);
  }
  await rm(dir, { recursive: true, force: true });
}

/** Writes a file (creating parents) with exact contents and a fixed mtime. */
export async function writeFixture(
  root: string,
  relativePath: string,
  contents: string | Buffer = "",
  mtime: Date = FIXED_MTIME,
): Promise<string> {
  const absolutePath = path.join(root, ...relativePath.split("/"));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
  await utimes(absolutePath, mtime, mtime);
  return absolutePath;
}

/** Creates a symlink, returning false where the OS refuses (e.g. Windows without privileges). */
export async function trySymlink(
  target: string,
  linkPath: string,
  type?: "file" | "dir",
): Promise<boolean> {
  try {
    await symlink(target, linkPath, type);
    return true;
  } catch {
    return false;
  }
}
