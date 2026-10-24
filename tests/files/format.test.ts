import { describe, expect, it } from "vitest";

import { formatBytes } from "@/lib/files/format";

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [10 * 1024 + 300, "10 KB"],
    [5 * 1024 ** 2, "5 MB"],
    [1.25 * 1024 ** 3, "1.3 GB"],
    [3 * 1024 ** 5, "3072 TB"],
  ])("%d → %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it("guards against invalid sizes", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
  });
});
