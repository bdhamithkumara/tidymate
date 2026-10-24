import "server-only";

import { formatBytes } from "@/lib/files/format";
import { MAX_FILES_FOR_SUGGESTIONS } from "@/lib/organization/limits";
import type { ScannedFile } from "@/types/files";

import type { AiFileMetadata } from "./provider";

/**
 * Picks which scanned files the model sees. Top-level files come first, since
 * a messy folder's loose files are what most need tidying.
 */
export function selectFilesForSuggestions(
  files: ScannedFile[],
  limit: number = MAX_FILES_FOR_SUGGESTIONS,
): ScannedFile[] {
  return [...files]
    .sort((a, b) => depth(a) - depth(b) || compare(a.relativePath, b.relativePath))
    .slice(0, limit);
}

export function toAiFileMetadata(file: ScannedFile): AiFileMetadata {
  return {
    path: file.relativePath,
    kind: file.kind,
    size: formatBytes(file.sizeBytes),
    modified: file.modifiedAt.slice(0, 10),
  };
}

function depth(file: ScannedFile): number {
  return file.relativePath.split("/").length;
}

function compare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
