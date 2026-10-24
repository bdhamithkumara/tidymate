import "server-only";

import path from "node:path";

type PathApi = Pick<typeof path, "relative" | "isAbsolute" | "sep">;

/**
 * True when `target` is `root` itself or somewhere beneath it. Both paths must
 * already be absolute and normalized (e.g. from `realpath`).
 */
export function isWithinRoot(
  root: string,
  target: string,
  pathApi: PathApi = path,
): boolean {
  const relative = pathApi.relative(root, target);
  if (relative === "") {
    return true;
  }
  return (
    relative !== ".." &&
    !relative.startsWith(`..${pathApi.sep}`) &&
    !pathApi.isAbsolute(relative)
  );
}

/**
 * POSIX-style path of `target` relative to `root`. Throws if `target` would
 * escape the root, so a relative path can never contain `..` segments.
 */
export function toSafeRelativePath(
  root: string,
  target: string,
  pathApi: PathApi = path,
): string {
  if (!isWithinRoot(root, target, pathApi)) {
    throw new Error("Path escapes the scan root");
  }
  return pathApi.relative(root, target).split(pathApi.sep).join("/");
}
