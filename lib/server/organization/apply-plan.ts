import "server-only";

import type { Stats } from "node:fs";
import * as fsPromises from "node:fs/promises";
import path from "node:path";

import {
  ancestorDirectories,
  checkDestinationPath,
  checkRelativePath,
} from "@/lib/organization/relative-path";
import {
  validatePlan,
  type ParsedModelItem,
} from "@/lib/organization/validate-plan";
import { getErrnoCode } from "@/lib/server/files/errors";
import { isWithinRoot } from "@/lib/server/files/paths";
import {
  currentProtectedPathRules,
  isProtectedPath,
  type ProtectedPathRules,
} from "@/lib/server/files/protected-paths";
import { scanDirectory } from "@/lib/server/files/scanner";
import { ApplyError } from "@/lib/server/organization/errors";
import type { ScannedFile } from "@/types/files";
import type {
  ApplyFailureReason,
  ApplyOperationResult,
  ApplyResult,
  OrganizationSuggestion,
  RejectionReason,
  ReviewablePlan,
} from "@/types/organization";

/** The filesystem calls the apply step is allowed to make. Injectable for tests. */
export type FileOps = Pick<
  typeof fsPromises,
  "lstat" | "realpath" | "mkdir" | "link" | "unlink" | "rename" | "rmdir"
>;

export type ApplyOptions = {
  protectedPaths?: ProtectedPathRules;
  ops?: FileOps;
  now?: () => Date;
};

/** A failure that is part of normal operation: report it and carry on. */
class OperationRejected extends Error {
  constructor(
    readonly reason: ApplyFailureReason,
    readonly attempted: boolean,
  ) {
    super(reason);
  }
}

/**
 * Applies the selected suggestions of a stored plan. This is the only code in
 * TidyMate that changes the filesystem, and it can only move or rename files:
 *
 * 1. The folder is scanned again; its real path must still be the plan's.
 * 2. The selected suggestions are re-validated against that fresh scan.
 * 3. Each source must still have the size and mtime recorded in the plan.
 * 4. Right before each change, the source, every destination folder and the
 *    destination itself are re-checked on disk without following links.
 * 5. Files are moved with a hard link plus unlink, so an existing destination
 *    is never overwritten (`rename` would silently replace it on POSIX).
 *
 * Operations run one at a time in a fixed order. This is not a transaction:
 * every requested change gets its own result. An expected safety failure
 * skips just that change; an unexpected error stops the run, and the
 * remaining changes are reported as not attempted.
 */
export async function applyPlan(
  plan: ReviewablePlan,
  sourcePaths: string[],
  { protectedPaths = currentProtectedPathRules(), ops = fsPromises, now = () => new Date() }: ApplyOptions = {},
): Promise<ApplyResult> {
  const suggestionsBySource = new Map(plan.suggestions.map((s) => [s.sourcePath, s]));
  const selected = [...new Set(sourcePaths)]
    .map((sourcePath) => suggestionsBySource.get(sourcePath))
    .filter((s): s is OrganizationSuggestion => s !== undefined)
    .sort((a, b) => compare(a.sourcePath, b.sourcePath));

  if (selected.length === 0 || selected.length !== sourcePaths.length) {
    throw new ApplyError("INVALID_REQUEST");
  }

  // 1. Fresh scan. Throws a safe ScanError if the folder is gone or now protected.
  const scan = await scanDirectory(plan.rootPath, { protectedPaths });
  if (scan.rootPath !== plan.rootPath) {
    throw new ApplyError("ROOT_CHANGED");
  }
  const root = scan.rootPath;
  const freshFiles = new Map(scan.files.map((file) => [file.relativePath, file]));

  // 2. Re-validate the selection against the fresh scan.
  const items: ParsedModelItem[] = selected.map((s) => ({
    ok: true,
    value: { sourcePath: s.sourcePath, suggestedPath: s.suggestedPath, action: s.action, reason: s.reason },
  }));
  const validation = validatePlan({ items, consideredFiles: scan.files, allFiles: scan.files });
  const stillValid = new Set(validation.suggestions.map((s) => s.sourcePath));
  const rejectionBySource = new Map(
    validation.rejected.map((r) => [r.sourcePath ?? "", r.reason] as const),
  );

  const results: ApplyOperationResult[] = [];
  const createdFolders: string[] = [];
  let stopped = false;

  for (const suggestion of selected) {
    const base = {
      sourcePath: suggestion.sourcePath,
      suggestedPath: suggestion.suggestedPath,
      action: suggestion.action,
    };

    if (stopped) {
      results.push({ ...base, status: "not-attempted", reason: "earlier-failure" });
      continue;
    }

    if (!stillValid.has(suggestion.sourcePath)) {
      const rejection = rejectionBySource.get(suggestion.sourcePath);
      const reason = await classifyRejection(rejection, root, suggestion.sourcePath, ops);
      results.push({ ...base, status: "rejected", reason });
      continue;
    }

    // 3. The file must be exactly what the user reviewed.
    const fresh = freshFiles.get(suggestion.sourcePath);
    if (!fresh || !matchesPlan(fresh, suggestion)) {
      results.push({ ...base, status: "rejected", reason: "source-changed" });
      continue;
    }

    try {
      const created = await moveFile(root, suggestion, { protectedPaths, ops });
      createdFolders.push(...created);
      results.push({ ...base, status: "applied" });
    } catch (error) {
      if (error instanceof OperationRejected) {
        results.push({ ...base, status: error.attempted ? "failed" : "rejected", reason: error.reason });
      } else {
        // Something we didn't anticipate: stop rather than carry on blindly.
        console.error("[tidymate] unexpected apply failure", error);
        results.push({ ...base, status: "failed", reason: "unexpected" });
        stopped = true;
      }
    }
  }

  const appliedCount = results.filter((r) => r.status === "applied").length;
  return {
    rootPath: root,
    rootName: scan.rootName,
    requestedCount: results.length,
    appliedCount,
    notAppliedCount: results.length - appliedCount,
    results,
    createdFolders: [...new Set(createdFolders)].sort(compare),
    appliedAt: now().toISOString(),
  };
}

function matchesPlan(file: ScannedFile, suggestion: OrganizationSuggestion): boolean {
  return (
    file.sizeBytes === suggestion.source.sizeBytes &&
    file.modifiedAt === suggestion.source.modifiedAt
  );
}

/** Turns a validation rejection into the reason shown to the user. */
async function classifyRejection(
  reason: RejectionReason | undefined,
  root: string,
  sourcePath: string,
  ops: FileOps,
): Promise<ApplyFailureReason> {
  switch (reason) {
    case "unknown-source": {
      // Not in the fresh scan: gone, or replaced by something that isn't a file.
      if (checkRelativePath(sourcePath)) return "unsafe-path";
      try {
        const stats = await ops.lstat(path.join(root, sourcePath));
        return stats.isFile() ? "source-changed" : "source-not-file";
      } catch {
        return "source-missing";
      }
    }
    case "destination-exists":
      return "destination-exists";
    case "conflicting-suggestions":
    case "duplicate-destination":
      return "conflict";
    default:
      return "unsafe-path";
  }
}

/**
 * Moves one file. Every check is repeated here, immediately before the change,
 * because the folder can change between the scan and this moment.
 * Returns the folders it created (relative to the root).
 */
async function moveFile(
  root: string,
  suggestion: OrganizationSuggestion,
  { protectedPaths, ops }: { protectedPaths: ProtectedPathRules; ops: FileOps },
): Promise<string[]> {
  if (checkRelativePath(suggestion.sourcePath) || checkDestinationPath(suggestion.suggestedPath)) {
    throw new OperationRejected("unsafe-path", false);
  }

  const source = resolveInside(root, suggestion.sourcePath);
  const destination = resolveInside(root, suggestion.suggestedPath);
  if (isProtectedPath(source, protectedPaths) || isProtectedPath(destination, protectedPaths)) {
    throw new OperationRejected("unsafe-path", false);
  }

  // Source: still a regular file (lstat never follows links), unchanged, and
  // reached through real directories only.
  const sourceStats = await lstatOrNull(source, ops);
  if (!sourceStats) throw new OperationRejected("source-missing", false);
  if (!sourceStats.isFile()) throw new OperationRejected("source-not-file", false);
  if (
    sourceStats.size !== suggestion.source.sizeBytes ||
    sourceStats.mtime.toISOString() !== suggestion.source.modifiedAt
  ) {
    throw new OperationRejected("source-changed", false);
  }
  if (!(await parentIsReal(root, source, ops))) {
    throw new OperationRejected("unsafe-path", false);
  }

  // Destination folders: create only what's missing, one level at a time.
  const created = await ensureFolders(root, suggestion.suggestedPath, { protectedPaths, ops });

  try {
    const existing = await lstatOrNull(destination, ops);
    const isCaseOnlyRename =
      existing !== null && existing.ino === sourceStats.ino && existing.dev === sourceStats.dev;

    if (existing && !isCaseOnlyRename) {
      throw new OperationRejected("destination-exists", false);
    }
    if (!(await parentIsReal(root, destination, ops))) {
      throw new OperationRejected("destination-blocked", false);
    }

    if (isCaseOnlyRename) {
      // Same file on a case-insensitive filesystem: nothing can be overwritten.
      await ops.rename(source, destination).catch(rethrowAsOperationFailure);
    } else {
      await noOverwriteMove(source, destination, sourceStats, ops);
    }
    return created.map((folder) => toRelative(root, folder));
  } catch (error) {
    await removeEmptyFolders(created, ops);
    throw error;
  }
}

/**
 * Hard-links the file to its new name (fails if anything exists there), then
 * removes the old name. If the process stops in between, the file has two
 * names but no data is lost or overwritten.
 */
async function noOverwriteMove(
  source: string,
  destination: string,
  sourceStats: Stats,
  ops: FileOps,
): Promise<void> {
  try {
    await ops.link(source, destination);
  } catch (error) {
    if (getErrnoCode(error) === "EEXIST") throw new OperationRejected("destination-exists", true);
    rethrowAsOperationFailure(error);
  }

  const linked = await lstatOrNull(destination, ops);
  if (!linked || linked.ino !== sourceStats.ino || linked.dev !== sourceStats.dev) {
    throw new Error("Linked file does not match the source");
  }

  try {
    await ops.unlink(source);
  } catch (error) {
    // Undo the new name so the file is left exactly where it was.
    await ops.unlink(destination).catch(() => undefined);
    rethrowAsOperationFailure(error);
  }
}

/**
 * Makes sure every folder above the destination is a real directory inside
 * the root, creating missing ones. Returns the absolute paths it created,
 * shallowest first.
 */
async function ensureFolders(
  root: string,
  relativeDestination: string,
  { protectedPaths, ops }: { protectedPaths: ProtectedPathRules; ops: FileOps },
): Promise<string[]> {
  const created: string[] = [];
  try {
    for (const folder of ancestorDirectories(relativeDestination)) {
      const absolute = resolveInside(root, folder);
      if (isProtectedPath(absolute, protectedPaths)) {
        throw new OperationRejected("unsafe-path", false);
      }

      const stats = await lstatOrNull(absolute, ops);
      if (stats) {
        if (!stats.isDirectory()) throw new OperationRejected("destination-blocked", false);
        continue;
      }

      try {
        await ops.mkdir(absolute);
        created.push(absolute);
      } catch (error) {
        if (getErrnoCode(error) !== "EEXIST") rethrowAsOperationFailure(error);
        // Created by someone else just now: accept only a real directory.
        const raced = await lstatOrNull(absolute, ops);
        if (!raced?.isDirectory()) throw new OperationRejected("destination-blocked", false);
      }

      if (!(await resolvesExactly(root, absolute, ops))) {
        throw new OperationRejected("destination-blocked", false);
      }
    }
    return created;
  } catch (error) {
    await removeEmptyFolders(created, ops);
    throw error;
  }
}

/** Removes folders this operation created, deepest first, only if empty. */
async function removeEmptyFolders(folders: string[], ops: FileOps): Promise<void> {
  for (const folder of [...folders].reverse()) {
    await ops.rmdir(folder).catch(() => undefined);
  }
}

/**
 * True when the parent folder of `target` resolves, through any links, to
 * exactly the expected place inside the root. Catches a folder being swapped
 * for a symlink after the checks above.
 */
function parentIsReal(root: string, target: string, ops: FileOps): Promise<boolean> {
  return resolvesExactly(root, path.dirname(target), ops);
}

async function resolvesExactly(root: string, folder: string, ops: FileOps): Promise<boolean> {
  try {
    const real = await ops.realpath(folder);
    return samePath(real, folder) && isWithinRoot(root, real);
  } catch {
    return false;
  }
}

/** macOS and Windows filesystems are case-insensitive by default. */
function samePath(a: string, b: string): boolean {
  const caseInsensitive = process.platform === "darwin" || process.platform === "win32";
  return caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function resolveInside(root: string, relativePath: string): string {
  const absolute = path.join(root, ...relativePath.split("/"));
  if (absolute === root || !isWithinRoot(root, absolute)) {
    throw new OperationRejected("unsafe-path", false);
  }
  return absolute;
}

function toRelative(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/");
}

async function lstatOrNull(target: string, ops: FileOps): Promise<Stats | null> {
  try {
    return await ops.lstat(target);
  } catch (error) {
    if (getErrnoCode(error) === "ENOENT" || getErrnoCode(error) === "ENOTDIR") return null;
    rethrowAsOperationFailure(error);
  }
}

/** Maps errno codes we expect to safe reasons; anything else propagates. */
function rethrowAsOperationFailure(error: unknown): never {
  if (error instanceof OperationRejected) throw error;
  switch (getErrnoCode(error)) {
    case "EACCES":
    case "EPERM":
    case "EROFS":
    case "EBUSY":
      throw new OperationRejected("permission-denied", true);
    case "EXDEV":
    case "ENOTSUP":
    case "EOPNOTSUPP":
    case "ENOSYS":
      throw new OperationRejected("unsupported-filesystem", true);
    case "ENOENT":
      throw new OperationRejected("source-missing", true);
    case "EEXIST":
      throw new OperationRejected("destination-exists", true);
    default:
      throw error;
  }
}

function compare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/* ---------- One apply at a time ---------- */

let applying = false;

/**
 * Runs `task` unless another apply is in progress. Interleaving two applies
 * on the same folder could defeat the per-operation checks.
 */
export async function runExclusiveApply<T>(task: () => Promise<T>): Promise<T | "busy"> {
  if (applying) return "busy";
  applying = true;
  try {
    return await task();
  } finally {
    applying = false;
  }
}
