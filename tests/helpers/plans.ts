import { randomUUID } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { deriveAction } from "@/lib/organization/validate-plan";
import { scanDirectory } from "@/lib/server/files/scanner";
import type {
  ChangeAction,
  OrganizationPlan,
  OrganizationSuggestion,
  ReviewablePlan,
} from "@/types/organization";

/**
 * Builds a stored plan for `root` from [source, destination] pairs, using
 * metadata from a real scan, the way the suggestions route would. Pairs may
 * contain unsafe paths to simulate a tampered plan.
 */
export async function planFor(root: string, changes: Array<[string, string]>): Promise<ReviewablePlan> {
  return {
    ...(await draftPlanFor(root, changes)),
    planId: randomUUID(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

/** Like `planFor`, but not yet stored: no `planId` or expiry. */
export async function draftPlanFor(
  root: string,
  changes: Array<[string, string]>,
): Promise<OrganizationPlan> {
  const scan = await scanDirectory(root);
  const files = new Map(scan.files.map((file) => [file.relativePath, file]));

  const suggestions: OrganizationSuggestion[] = changes.map(([sourcePath, suggestedPath]) => {
    const file = files.get(sourcePath);
    return {
      sourcePath,
      suggestedPath,
      suggestedName: suggestedPath.split("/").at(-1) ?? suggestedPath,
      action: deriveAction(sourcePath, suggestedPath) as ChangeAction,
      reason: "Test suggestion.",
      source: file
        ? { sizeBytes: file.sizeBytes, modifiedAt: file.modifiedAt, kind: file.kind }
        : { sizeBytes: 0, modifiedAt: new Date(0).toISOString(), kind: "other" },
    };
  });

  return {
    rootPath: scan.rootPath,
    rootName: scan.rootName,
    model: "test-model",
    generatedAt: new Date().toISOString(),
    durationMs: 0,
    suggestions,
    unchangedCount: 0,
    rejected: [],
    consideredFileCount: scan.files.length,
    totalFileCount: scan.files.length,
  };
}

export type TreeSnapshot = Record<string, string>;

/**
 * Every entry under `dir` (without following links) with its type and, for
 * files, contents and mtime. Used to prove that nothing else changed.
 */
export async function snapshotTree(dir: string): Promise<TreeSnapshot> {
  const snapshot: TreeSnapshot = {};
  const entries = await readdir(dir, { recursive: true });
  for (const entry of entries.sort()) {
    const absolute = path.join(dir, entry);
    const stats = await lstat(absolute);
    const key = entry.split(path.sep).join("/");
    if (stats.isSymbolicLink()) snapshot[key] = "symlink";
    else if (stats.isDirectory()) snapshot[key] = "dir";
    else snapshot[key] = `file:${await readFile(absolute, "utf8")}:${stats.mtime.toISOString()}`;
  }
  return snapshot;
}
