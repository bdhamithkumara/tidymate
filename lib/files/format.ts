const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Human-readable size using 1024-based units, e.g. `1.5 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }

  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded = unitIndex === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${BYTE_UNITS[unitIndex]}`;
}
