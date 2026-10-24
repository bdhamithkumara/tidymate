import path from "node:path";

import { describe, expect, it } from "vitest";

import { isWithinRoot, toSafeRelativePath } from "@/lib/server/files/paths";

describe("isWithinRoot (POSIX)", () => {
  const api = path.posix;

  it.each([
    ["/data/inbox", "/data/inbox", true],
    ["/data/inbox", "/data/inbox/a.txt", true],
    ["/data/inbox", "/data/inbox/sub/deep/b.txt", true],
    ["/data/inbox", "/data/inbox/..hidden-but-inside", true],
    ["/data/inbox", "/data", false],
    ["/data/inbox", "/data/inbox-other/a.txt", false],
    ["/data/inbox", "/data/inbox/../secrets", false],
    ["/data/inbox", "/etc/passwd", false],
  ])("root %s, target %s → %s", (root, target, expected) => {
    expect(isWithinRoot(root, api.resolve(target), api)).toBe(expected);
  });
});

describe("isWithinRoot (Windows)", () => {
  const api = path.win32;

  it.each([
    ["C:\\Users\\sam\\Downloads", "C:\\Users\\sam\\Downloads\\a.pdf", true],
    ["C:\\Users\\sam\\Downloads", "C:\\Users\\sam\\Documents", false],
    ["C:\\Users\\sam\\Downloads", "D:\\Users\\sam\\Downloads\\a.pdf", false],
    ["C:\\Users\\sam\\Downloads", "C:\\Users\\sam\\Downloads\\..\\x", false],
  ])("root %s, target %s → %s", (root, target, expected) => {
    expect(isWithinRoot(root, api.resolve(target), api)).toBe(expected);
  });
});

describe("toSafeRelativePath", () => {
  it("returns POSIX-style relative paths", () => {
    expect(toSafeRelativePath("/data/inbox", "/data/inbox/a/b.txt", path.posix)).toBe(
      "a/b.txt",
    );
    expect(
      toSafeRelativePath("C:\\inbox", "C:\\inbox\\a\\b.txt", path.win32),
    ).toBe("a/b.txt");
  });

  it("returns an empty string for the root itself", () => {
    expect(toSafeRelativePath("/data/inbox", "/data/inbox", path.posix)).toBe("");
  });

  it.each([
    "/data/inbox/../outside.txt",
    "/data",
    "/",
    "/data/inbox-sibling/file.txt",
  ])("refuses to produce a path that escapes the root: %s", (target) => {
    expect(() =>
      toSafeRelativePath("/data/inbox", path.posix.resolve(target), path.posix),
    ).toThrow(/escapes/);
  });

  it("refuses unresolved traversal segments", () => {
    expect(() =>
      toSafeRelativePath("/data/inbox", "/data/inbox/../../etc/passwd", path.posix),
    ).toThrow(/escapes/);
  });
});
