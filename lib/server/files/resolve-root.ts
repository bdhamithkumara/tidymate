import "server-only";

import { realpath, stat } from "node:fs/promises";
import path from "node:path";

import { ScanError, scanErrorFromErrno } from "./errors";
import {
  currentProtectedPathRules,
  isProtectedPath,
  type ProtectedPathRules,
} from "./protected-paths";

export const MAX_PATH_LENGTH = 4096;

/**
 * Turns an untrusted, user-supplied folder path into the real absolute path of
 * a directory that is safe to scan. Nothing is read from the folder itself.
 */
export async function resolveScanRoot(
  input: string,
  rules: ProtectedPathRules = currentProtectedPathRules(),
): Promise<string> {
  const trimmed = input.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > MAX_PATH_LENGTH ||
    trimmed.includes("\0") ||
    !path.isAbsolute(trimmed)
  ) {
    throw new ScanError("INVALID_PATH");
  }

  // Check the normalized path before touching the filesystem, so protected
  // locations are rejected without being stat'ed...
  const normalized = path.resolve(trimmed);
  if (isProtectedPath(normalized, rules)) {
    throw new ScanError("PROTECTED_PATH");
  }

  let real: string;
  try {
    real = await realpath(normalized);
  } catch (error) {
    throw scanErrorFromErrno(error);
  }

  // ...and again after resolving symlinks, so a link can't smuggle one in.
  if (isProtectedPath(real, rules)) {
    throw new ScanError("PROTECTED_PATH");
  }

  let stats;
  try {
    stats = await stat(real);
  } catch (error) {
    throw scanErrorFromErrno(error);
  }
  if (!stats.isDirectory()) {
    throw new ScanError("NOT_A_DIRECTORY");
  }

  return real;
}
