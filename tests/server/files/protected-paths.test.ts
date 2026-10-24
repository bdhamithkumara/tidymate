import { describe, expect, it } from "vitest";

import {
  buildProtectedPathRules,
  isProtectedPath,
} from "@/lib/server/files/protected-paths";

describe("protected paths on Linux", () => {
  const rules = buildProtectedPathRules({
    platform: "linux",
    homedir: "/home/sam",
    env: {},
  });

  it.each(["/", "/home/sam", "/home/sam/", "/etc", "/etc/ssh", "/usr/lib", "/proc/1", "/var/log"])(
    "blocks %s",
    (target) => {
      expect(isProtectedPath(target, rules)).toBe(true);
    },
  );

  it.each(["/home/sam/Downloads", "/home/sam/Desktop/inbox", "/tmp/tidymate", "/mnt/data", "/home"])(
    "allows %s",
    (target) => {
      expect(isProtectedPath(target, rules)).toBe(false);
    },
  );

  it("normalizes traversal before checking", () => {
    expect(isProtectedPath("/home/sam/Downloads/../../../etc", rules)).toBe(true);
    expect(isProtectedPath("/home/sam/Downloads/..", rules)).toBe(true);
  });

  it("is case-sensitive like the filesystem", () => {
    expect(isProtectedPath("/ETC", rules)).toBe(false);
  });
});

describe("protected paths on macOS", () => {
  const rules = buildProtectedPathRules({
    platform: "darwin",
    homedir: "/Users/sam",
    env: {},
  });

  it.each(["/", "/Users/sam", "/users/SAM", "/System/Library", "/Library", "/private/etc"])(
    "blocks %s",
    (target) => {
      expect(isProtectedPath(target, rules)).toBe(true);
    },
  );

  it.each(["/Users/sam/Downloads", "/Users/sam/Library/../Desktop", "/Volumes/USB"])(
    "allows %s",
    (target) => {
      expect(isProtectedPath(target, rules)).toBe(false);
    },
  );
});

describe("protected paths on Windows", () => {
  const rules = buildProtectedPathRules({
    platform: "win32",
    homedir: "C:\\Users\\sam",
    env: { SystemRoot: "C:\\Windows", ProgramFiles: "C:\\Program Files" },
  });

  it.each([
    "C:\\",
    "D:\\",
    "C:\\Users\\sam",
    "c:\\users\\SAM\\",
    "C:\\Windows\\System32",
    "c:\\program files\\App",
    "C:\\Program Files (x86)",
    "C:\\ProgramData\\cache",
  ])("blocks %s", (target) => {
    expect(isProtectedPath(target, rules)).toBe(true);
  });

  it.each(["C:\\Users\\sam\\Downloads", "D:\\Archive\\2024", "C:\\Users\\sam\\Documents\\Taxes"])(
    "allows %s",
    (target) => {
      expect(isProtectedPath(target, rules)).toBe(false);
    },
  );
});
