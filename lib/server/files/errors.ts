import "server-only";

import type { ScanErrorCode, ScanFailure } from "@/types/files";

const SAFE_MESSAGES: Record<ScanErrorCode, string> = {
  INVALID_PATH:
    "Enter the full path to a folder. It should start with / on macOS and Linux, or a drive letter such as C:\\ on Windows.",
  NOT_FOUND: "That folder doesn't exist.",
  NOT_A_DIRECTORY: "That path points to a file, not a folder.",
  PROTECTED_PATH:
    "TidyMate won't scan system folders, drive roots, or your entire home folder. Choose a specific folder instead.",
  PERMISSION_DENIED: "TidyMate doesn't have permission to read that folder.",
  NOT_LOCAL: "Scanning is only available when TidyMate is opened from this computer.",
  UNKNOWN: "Something went wrong while scanning. Nothing was changed.",
};

/** An expected scan failure whose message is safe to show the user. */
export class ScanError extends Error {
  readonly code: ScanErrorCode;

  constructor(code: ScanErrorCode, message: string = SAFE_MESSAGES[code]) {
    super(message);
    this.name = "ScanError";
    this.code = code;
  }

  toFailure(): ScanFailure {
    return { code: this.code, message: this.message };
  }
}

export function toScanFailure(error: unknown): ScanFailure {
  if (error instanceof ScanError) {
    return error.toFailure();
  }
  return { code: "UNKNOWN", message: SAFE_MESSAGES.UNKNOWN };
}

/** Maps Node's errno codes to scan errors for failures on the root folder. */
export function scanErrorFromErrno(error: unknown): ScanError {
  const code = getErrnoCode(error);
  switch (code) {
    case "ENOENT":
      return new ScanError("NOT_FOUND");
    case "ENOTDIR":
      return new ScanError("NOT_A_DIRECTORY");
    case "EACCES":
    case "EPERM":
      return new ScanError("PERMISSION_DENIED");
    case "ENAMETOOLONG":
    case "EINVAL":
      return new ScanError("INVALID_PATH");
    default:
      return new ScanError("UNKNOWN");
  }
}

export function getErrnoCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error as { code: unknown };
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}
