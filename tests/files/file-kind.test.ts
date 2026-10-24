import { describe, expect, it } from "vitest";

import { getExtension, getFileKind } from "@/lib/files/file-kind";

describe("getExtension", () => {
  it.each([
    ["report.pdf", "pdf"],
    ["Photo.JPG", "jpg"],
    ["my.notes.final.docx", "docx"],
    ["backup.tar.gz", "tar.gz"],
    ["logs.TAR.XZ", "tar.xz"],
    ["data.gz", "gz"],
    ["README", ""],
    [".env", ""],
    [".bashrc", ""],
    ["trailing.", ""],
    [".config.json", "json"],
    ["tar.gz", "gz"],
  ])("%s → %j", (name, expected) => {
    expect(getExtension(name)).toBe(expected);
  });
});

describe("getFileKind", () => {
  it.each([
    ["pdf", "document"],
    ["XLSX", "spreadsheet"],
    ["key", "presentation"],
    ["heic", "image"],
    ["mkv", "video"],
    ["flac", "audio"],
    ["tar.gz", "archive"],
    ["tsx", "code"],
    ["dmg", "installer"],
    ["woff2", "font"],
    ["", "other"],
    ["xyz123", "other"],
  ])("%j → %s", (extension, expected) => {
    expect(getFileKind(extension)).toBe(expected);
  });
});
