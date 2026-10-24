/**
 * Shapes produced by the read-only folder scanner.
 *
 * These are plain, serializable objects: they cross the server/client
 * boundary and will later be sent to the local model, so they carry only
 * metadata needed for organization decisions — never file contents and never
 * absolute paths for individual files.
 */

export const FILE_KINDS = [
  "document",
  "spreadsheet",
  "presentation",
  "image",
  "video",
  "audio",
  "archive",
  "code",
  "installer",
  "font",
  "other",
] as const;

export type FileKind = (typeof FILE_KINDS)[number];

export type ScannedFile = {
  /** Base name, e.g. `Invoice March.pdf`. */
  name: string;
  /** Lowercase extension without the dot, e.g. `pdf` or `tar.gz`. Empty when none. */
  extension: string;
  /** POSIX-style path relative to the scan root, e.g. `receipts/Invoice March.pdf`. */
  relativePath: string;
  sizeBytes: number;
  /** ISO 8601 timestamp of the last modification. */
  modifiedAt: string;
  kind: FileKind;
};

export const SKIP_REASONS = [
  "hidden",
  "symlink",
  "special",
  "unreadable",
  "outside-root",
  "too-deep",
] as const;

export type SkipReason = (typeof SKIP_REASONS)[number];

export type SkippedEntry = {
  relativePath: string;
  reason: SkipReason;
};

export type ScanStats = {
  fileCount: number;
  directoryCount: number;
  totalSizeBytes: number;
  skippedCount: number;
  skippedByReason: Record<SkipReason, number>;
};

export type ScanLimits = {
  maxFiles: number;
  maxDepth: number;
};

export type ScanResult = {
  /** Resolved real path of the folder that was scanned. */
  rootPath: string;
  rootName: string;
  files: ScannedFile[];
  /** Sample of skipped entries, capped to keep responses small. */
  skipped: SkippedEntry[];
  stats: ScanStats;
  limits: ScanLimits;
  /** True when the scan stopped early because `maxFiles` was reached. */
  truncated: boolean;
  scannedAt: string;
  durationMs: number;
};

export const SCAN_ERROR_CODES = [
  "INVALID_PATH",
  "NOT_FOUND",
  "NOT_A_DIRECTORY",
  "PROTECTED_PATH",
  "PERMISSION_DENIED",
  "NOT_LOCAL",
  "UNKNOWN",
] as const;

export type ScanErrorCode = (typeof SCAN_ERROR_CODES)[number];

export type ScanFailure = {
  code: ScanErrorCode;
  message: string;
};
