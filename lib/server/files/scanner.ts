import "server-only";

import type { Dirent, Stats } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import { getExtension, getFileKind } from "@/lib/files/file-kind";
import type {
  ScanLimits,
  ScanResult,
  ScannedFile,
  SkippedEntry,
  SkipReason,
} from "@/types/files";
import { SKIP_REASONS } from "@/types/files";

import { scanErrorFromErrno } from "./errors";
import { isWithinRoot, toSafeRelativePath } from "./paths";
import type { ProtectedPathRules } from "./protected-paths";
import { resolveScanRoot } from "./resolve-root";

export const DEFAULT_SCAN_LIMITS: ScanLimits = {
  maxFiles: 2000,
  maxDepth: 6,
};

/** Upper bound on skipped entries returned to the caller; counts stay exact. */
export const MAX_SKIPPED_SAMPLES = 100;

export type ScanOptions = Partial<ScanLimits> & {
  /** Include dotfiles and dot-folders. Off by default. */
  includeHidden?: boolean;
  protectedPaths?: ProtectedPathRules;
  now?: () => Date;
};

type PendingDirectory = {
  absolutePath: string;
  depth: number;
};

/**
 * Read-only scan of a user-selected folder.
 *
 * - Only metadata is collected (`lstat`); file contents are never opened.
 * - Symbolic links are never followed, inside or outside the root.
 * - Sockets, FIFOs and devices are skipped without being opened.
 * - An unreadable entry is recorded as skipped instead of failing the scan.
 * - Traversal is breadth-first, so shallow files win when `maxFiles` is hit.
 */
export async function scanDirectory(
  folderPath: string,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const now = options.now ?? (() => new Date());
  const limits: ScanLimits = {
    maxFiles: options.maxFiles ?? DEFAULT_SCAN_LIMITS.maxFiles,
    maxDepth: options.maxDepth ?? DEFAULT_SCAN_LIMITS.maxDepth,
  };
  const includeHidden = options.includeHidden ?? false;

  const startedAt = now();
  const root = await resolveScanRoot(folderPath, options.protectedPaths);

  const files: ScannedFile[] = [];
  const skipped: SkippedEntry[] = [];
  const skippedByReason = Object.fromEntries(
    SKIP_REASONS.map((reason) => [reason, 0]),
  ) as Record<SkipReason, number>;
  let directoryCount = 0;
  let totalSizeBytes = 0;
  let truncated = false;

  const skip = (absolutePath: string, reason: SkipReason) => {
    skippedByReason[reason] += 1;
    if (skipped.length < MAX_SKIPPED_SAMPLES) {
      skipped.push({ relativePath: toSafeRelativePath(root, absolutePath), reason });
    }
  };

  const queue: PendingDirectory[] = [{ absolutePath: root, depth: 0 }];

  for (let index = 0; index < queue.length && !truncated; index += 1) {
    const current = queue[index]!;
    const isRoot = current.depth === 0;

    if (!isRoot) {
      const containment = await checkContainment(root, current.absolutePath);
      if (containment !== "inside") {
        skip(current.absolutePath, containment);
        continue;
      }
    }

    let entries: Dirent[];
    try {
      entries = await readdir(current.absolutePath, { withFileTypes: true });
    } catch (error) {
      if (isRoot) {
        throw scanErrorFromErrno(error);
      }
      skip(current.absolutePath, "unreadable");
      continue;
    }

    entries.sort((a, b) => compareStrings(a.name, b.name));

    for (const entry of entries) {
      const absolutePath = path.join(current.absolutePath, entry.name);

      if (!includeHidden && entry.name.startsWith(".")) {
        skip(absolutePath, "hidden");
        continue;
      }

      // Always lstat: it never follows links and is authoritative even when
      // the directory listing reports an unknown entry type.
      let stats: Stats;
      try {
        stats = await lstat(absolutePath);
      } catch {
        skip(absolutePath, "unreadable");
        continue;
      }

      if (stats.isSymbolicLink()) {
        skip(absolutePath, "symlink");
      } else if (stats.isDirectory()) {
        if (current.depth + 1 > limits.maxDepth) {
          skip(absolutePath, "too-deep");
        } else {
          directoryCount += 1;
          queue.push({ absolutePath, depth: current.depth + 1 });
        }
      } else if (stats.isFile()) {
        if (files.length >= limits.maxFiles) {
          truncated = true;
          break;
        }
        files.push(toScannedFile(root, absolutePath, entry.name, stats));
        totalSizeBytes += stats.size;
      } else {
        skip(absolutePath, "special");
      }
    }
  }

  files.sort((a, b) => compareStrings(a.relativePath, b.relativePath));

  const finishedAt = now();
  return {
    rootPath: root,
    rootName: path.basename(root) || root,
    files,
    skipped,
    stats: {
      fileCount: files.length,
      directoryCount,
      totalSizeBytes,
      skippedCount: Object.values(skippedByReason).reduce((sum, n) => sum + n, 0),
      skippedByReason,
    },
    limits,
    truncated,
    scannedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
  };
}

function toScannedFile(
  root: string,
  absolutePath: string,
  name: string,
  stats: Stats,
): ScannedFile {
  const extension = getExtension(name);
  return {
    name,
    extension,
    relativePath: toSafeRelativePath(root, absolutePath),
    sizeBytes: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    kind: getFileKind(extension),
  };
}

/**
 * Guards against a directory being swapped for a symlink between listing its
 * parent and reading it: the real path must still resolve inside the root.
 */
async function checkContainment(
  root: string,
  directory: string,
): Promise<"inside" | "outside-root" | "symlink" | "unreadable"> {
  try {
    const stats = await lstat(directory);
    if (!stats.isDirectory()) {
      return stats.isSymbolicLink() ? "symlink" : "unreadable";
    }
    return isWithinRoot(root, await realpath(directory)) ? "inside" : "outside-root";
  } catch {
    return "unreadable";
  }
}

/** Locale-independent ordering so results are deterministic everywhere. */
function compareStrings(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
