import { describe, expect, it } from "vitest";

import {
  ancestorDirectories,
  checkDestinationPath,
  checkRelativePath,
  collisionKey,
  splitRelativePath,
} from "@/lib/organization/relative-path";

describe("checkRelativePath", () => {
  it.each(["a.txt", "Images/IMG_1.jpg", "Docs/2024/report final.pdf", "..hidden-ish.txt", "a..b.txt"])(
    "accepts %j",
    (value) => {
      expect(checkRelativePath(value)).toBeNull();
    },
  );

  it.each([
    "/etc/passwd",
    "/Images/a.jpg",
    "\\\\server\\share\\a.txt",
    "\\Windows\\a.txt",
    "C:\\Users\\a.txt",
    "c:/Users/a.txt",
    "D:relative.txt",
    "~/Downloads/a.txt",
  ])("flags absolute path %j", (value) => {
    expect(checkRelativePath(value)).toBe("absolute-path");
  });

  it.each(["../a.txt", "Images/../../a.txt", "a/..", "..", "..\\a.txt", "Images\\..\\..\\a.txt"])(
    "flags traversal %j",
    (value) => {
      expect(checkRelativePath(value)).toBe("path-traversal");
    },
  );

  it.each([
    "",
    " a.txt",
    "a.txt ",
    "Images//a.jpg",
    "Images/",
    "./a.txt",
    "Images/./a.jpg",
    "Images\\a.jpg",
    "bad\u0000name.txt",
    "line\nbreak.txt",
    `${"a/".repeat(600)}b.txt`,
  ])("flags invalid %j", (value) => {
    expect(checkRelativePath(value)).toBe("invalid-path");
  });
});

describe("checkDestinationPath", () => {
  it.each(["Images/IMG_1.jpg", "Documents/Taxes 2024/return.pdf", "notes.txt"])(
    "accepts %j",
    (value) => {
      expect(checkDestinationPath(value)).toBeNull();
    },
  );

  it.each([
    ".hidden/a.txt",
    "Images/.a.jpg",
    "Images./a.jpg",
    "Images /a.jpg",
    "Ima:ges/a.jpg",
    "a?.txt",
    "a*.txt",
    "<a>.txt",
    "CON/a.txt",
    "Images/nul.txt",
    "com1",
    `${"x".repeat(256)}.txt`,
  ])("rejects non-portable %j", (value) => {
    expect(checkDestinationPath(value)).toBe("invalid-path");
  });

  it("still reports structural problems first", () => {
    expect(checkDestinationPath("/abs.txt")).toBe("absolute-path");
    expect(checkDestinationPath("../up.txt")).toBe("path-traversal");
  });
});

describe("path helpers", () => {
  it("splits directory and name", () => {
    expect(splitRelativePath("a.txt")).toEqual({ directory: "", name: "a.txt" });
    expect(splitRelativePath("x/y/a.txt")).toEqual({ directory: "x/y", name: "a.txt" });
  });

  it("lists ancestor directories", () => {
    expect(ancestorDirectories("a.txt")).toEqual([]);
    expect(ancestorDirectories("x/y/a.txt")).toEqual(["x", "x/y"]);
  });

  it("builds case- and normalization-insensitive collision keys", () => {
    expect(collisionKey("Images/Photo.JPG")).toBe(collisionKey("images/photo.jpg"));
    expect(collisionKey("Cafe\u0301.txt")).toBe(collisionKey("Café.txt"));
  });
});
