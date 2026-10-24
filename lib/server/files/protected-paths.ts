import "server-only";

import os from "node:os";
import path from "node:path";

import { isWithinRoot } from "./paths";

export type ProtectedPathRules = {
  platform: NodeJS.Platform;
  /** Paths that may not be scanned themselves, though their subfolders may. */
  exact: string[];
  /** Paths that may not be scanned, including everything beneath them. */
  subtree: string[];
};

type RuleInputs = {
  platform: NodeJS.Platform;
  homedir: string;
  env: Record<string, string | undefined>;
};

const POSIX_SYSTEM_DIRS = [
  "/bin", "/boot", "/dev", "/etc", "/lib", "/lib32", "/lib64", "/libx32", "/proc",
  "/root", "/run", "/sbin", "/snap", "/srv", "/sys", "/usr", "/var",
];

const DARWIN_SYSTEM_DIRS = [
  "/System", "/Library", "/bin", "/sbin", "/usr", "/dev", "/cores",
  "/private/etc", "/private/var/db", "/private/var/root", "/private/var/log",
];

function pathApiFor(platform: NodeJS.Platform) {
  return platform === "win32" ? path.win32 : path.posix;
}

/**
 * Folders TidyMate refuses to scan: filesystem roots, the home folder itself
 * (its subfolders such as Downloads are fine) and well-known system locations.
 */
export function buildProtectedPathRules({
  platform,
  homedir,
  env,
}: RuleInputs): ProtectedPathRules {
  const api = pathApiFor(platform);
  const exact = [homedir].filter(Boolean).map((p) => api.resolve(p));

  if (platform === "win32") {
    const systemRoot = env.SystemRoot ?? env.windir ?? "C:\\Windows";
    const subtree = [
      systemRoot,
      env.ProgramFiles ?? "C:\\Program Files",
      env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
      env.ProgramData ?? "C:\\ProgramData",
    ];
    return { platform, exact, subtree: subtree.map((p) => api.resolve(p)) };
  }

  const subtree = platform === "darwin" ? DARWIN_SYSTEM_DIRS : POSIX_SYSTEM_DIRS;
  return { platform, exact, subtree: [...subtree] };
}

export function currentProtectedPathRules(): ProtectedPathRules {
  return buildProtectedPathRules({
    platform: process.platform,
    homedir: os.homedir(),
    env: process.env,
  });
}

export function isProtectedPath(target: string, rules: ProtectedPathRules): boolean {
  const api = pathApiFor(rules.platform);
  // Windows and macOS filesystems are case-insensitive by default.
  const fold = (p: string) =>
    rules.platform === "win32" || rules.platform === "darwin" ? p.toLowerCase() : p;

  const resolved = fold(api.resolve(target));

  // Any filesystem or drive root, e.g. `/` or `C:\`.
  if (resolved === fold(api.parse(resolved).root)) {
    return true;
  }

  if (rules.exact.some((p) => fold(p) === resolved)) {
    return true;
  }

  return rules.subtree.some((p) => isWithinRoot(fold(p), resolved, api));
}
