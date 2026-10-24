import { MAX_RELATIVE_PATH_LENGTH } from "./limits";

export type PathIssue = "absolute-path" | "path-traversal" | "invalid-path";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const WINDOWS_DRIVE = /^[a-zA-Z]:/;
const WINDOWS_RESERVED_CHARACTERS = /[<>:"|?*]/;
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Structural check for a path that must stay inside the scanned folder:
 * relative, `/`-separated, no `.`/`..` segments, no empty segments.
 * Returns null when the path is acceptable.
 */
export function checkRelativePath(value: string): PathIssue | null {
  if (
    value.length === 0 ||
    value.length > MAX_RELATIVE_PATH_LENGTH ||
    value.trim() !== value ||
    CONTROL_CHARACTERS.test(value)
  ) {
    return "invalid-path";
  }

  if (
    value.startsWith("/") ||
    value.startsWith("\\") ||
    value.startsWith("~") ||
    WINDOWS_DRIVE.test(value)
  ) {
    return "absolute-path";
  }

  // Check both separators so `..\secret` can't slip through on Windows.
  if (value.split(/[\\/]/).some((segment) => segment === "..")) {
    return "path-traversal";
  }

  if (value.includes("\\")) {
    return "invalid-path";
  }

  const segments = value.split("/");
  if (segments.some((segment) => segment === "" || segment === ".")) {
    return "invalid-path";
  }

  return null;
}

/**
 * Extra rules for paths TidyMate might create later: every segment must be a
 * portable, visible name that is valid on Windows, macOS and Linux.
 */
export function checkDestinationPath(value: string): PathIssue | null {
  const structural = checkRelativePath(value);
  if (structural) {
    return structural;
  }

  const portable = value.split("/").every(
    (segment) =>
      segment.length <= 255 &&
      !segment.startsWith(".") &&
      !segment.endsWith(".") &&
      !segment.endsWith(" ") &&
      segment.trim() === segment &&
      !WINDOWS_RESERVED_CHARACTERS.test(segment) &&
      !WINDOWS_RESERVED_NAMES.test(segment),
  );
  return portable ? null : "invalid-path";
}

export function splitRelativePath(value: string): { directory: string; name: string } {
  const lastSlash = value.lastIndexOf("/");
  return lastSlash === -1
    ? { directory: "", name: value }
    : { directory: value.slice(0, lastSlash), name: value.slice(lastSlash + 1) };
}

/** Every ancestor folder of a relative path, shallowest first. */
export function ancestorDirectories(value: string): string[] {
  const segments = value.split("/").slice(0, -1);
  return segments.map((_, index) => segments.slice(0, index + 1).join("/"));
}

/**
 * Key used to detect collisions. Case-insensitive because macOS and Windows
 * filesystems usually are, and Unicode-normalized so visually identical names
 * collide too.
 */
export function collisionKey(value: string): string {
  return value.normalize("NFC").toLowerCase();
}
