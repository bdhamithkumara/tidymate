import { describe, expect, it } from "vitest";

import { scanRequestSchema } from "@/lib/files/scan-request";

describe("scanRequestSchema", () => {
  it("trims whitespace", () => {
    expect(scanRequestSchema.parse({ folderPath: "  /data/inbox \n" })).toEqual({
      folderPath: "/data/inbox",
    });
  });

  it("strips quotes added by Windows 'Copy as path'", () => {
    expect(
      scanRequestSchema.parse({ folderPath: '"C:\\Users\\sam\\Downloads"' }).folderPath,
    ).toBe("C:\\Users\\sam\\Downloads");
    expect(scanRequestSchema.parse({ folderPath: "'/data/inbox'" }).folderPath).toBe(
      "/data/inbox",
    );
  });

  it("keeps unmatched quotes", () => {
    expect(scanRequestSchema.parse({ folderPath: '"/data/inbox' }).folderPath).toBe(
      '"/data/inbox',
    );
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["empty quotes", '""'],
    ["NUL byte", "/data/in\0box"],
    ["overlong", `/${"a".repeat(5000)}`],
  ])("rejects %s input", (_label, folderPath) => {
    expect(scanRequestSchema.safeParse({ folderPath }).success).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(scanRequestSchema.safeParse({ folderPath: 42 }).success).toBe(false);
    expect(scanRequestSchema.safeParse({}).success).toBe(false);
  });
});
