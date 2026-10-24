import { describe, expect, it } from "vitest";

import {
  deselectAll,
  emptySelection,
  selectAll,
  selectedSourcePaths,
  summarizeSelection,
  toggleSelection,
} from "@/lib/organization/selection";
import { describeSelection, plural, summarizeApplyResult } from "@/lib/organization/summary";
import type { ApplyResult, OrganizationSuggestion } from "@/types/organization";

function suggestion(sourcePath: string, suggestedPath: string, action: OrganizationSuggestion["action"]): OrganizationSuggestion {
  return {
    sourcePath,
    suggestedPath,
    suggestedName: suggestedPath.split("/").at(-1) ?? suggestedPath,
    action,
    reason: "Test.",
    source: { sizeBytes: 1, modifiedAt: "2026-01-01T00:00:00.000Z", kind: "other" },
  };
}

const suggestions = [
  suggestion("a.jpg", "Images/a.jpg", "move"),
  suggestion("b.txt", "notes.txt", "rename"),
  suggestion("c.pdf", "Documents/Invoice.pdf", "move_and_rename"),
];

describe("selection", () => {
  it("starts with nothing selected", () => {
    const summary = summarizeSelection(suggestions, emptySelection());
    expect(summary).toMatchObject({ selectedCount: 0, totalCount: 3, allSelected: false, moveCount: 0, renameCount: 0 });
    expect(selectedSourcePaths(suggestions, emptySelection())).toEqual([]);
  });

  it("selects and deselects one suggestion", () => {
    const one = toggleSelection(emptySelection(), "b.txt");
    expect(summarizeSelection(suggestions, one)).toMatchObject({ selectedCount: 1, renameCount: 1, moveCount: 0 });
    expect(selectedSourcePaths(suggestions, one)).toEqual(["b.txt"]);

    const none = toggleSelection(one, "b.txt");
    expect(summarizeSelection(suggestions, none).selectedCount).toBe(0);
  });

  it("does not mutate the previous selection", () => {
    const before = emptySelection();
    toggleSelection(before, "a.jpg");
    expect(before.size).toBe(0);
  });

  it("selects several suggestions and counts moves and renames", () => {
    const several = toggleSelection(toggleSelection(emptySelection(), "a.jpg"), "c.pdf");
    expect(summarizeSelection(suggestions, several)).toMatchObject({
      selectedCount: 2,
      byAction: { move: 1, rename: 0, move_and_rename: 1 },
      moveCount: 2,
      renameCount: 1,
    });
    expect(selectedSourcePaths(suggestions, several)).toEqual(["a.jpg", "c.pdf"]);
  });

  it("selects all and deselects all", () => {
    const all = selectAll(suggestions);
    expect(summarizeSelection(suggestions, all)).toMatchObject({ selectedCount: 3, allSelected: true });
    expect(summarizeSelection(suggestions, deselectAll())).toMatchObject({ selectedCount: 0, allSelected: false });
  });

  it("ignores selected entries that aren't in the plan", () => {
    const tampered = new Set(["a.jpg", "../../etc/passwd"]);
    expect(selectedSourcePaths(suggestions, tampered)).toEqual(["a.jpg"]);
    expect(summarizeSelection(suggestions, tampered).selectedCount).toBe(1);
  });

  it("is never 'all selected' for an empty plan", () => {
    expect(summarizeSelection([], selectAll([])).allSelected).toBe(false);
  });
});

describe("summaries", () => {
  it("pluralizes", () => {
    expect(plural(1, "file")).toBe("1 file");
    expect(plural(2, "file")).toBe("2 files");
    expect(plural(1200, "file")).toMatch(/^1.?200 files$/);
  });

  it("describes a selection", () => {
    expect(describeSelection(summarizeSelection(suggestions, selectAll(suggestions)))).toBe(
      "3 of 3 selected: 2 files moved, 2 files renamed.",
    );
  });

  const result = (applied: number, requested: number): ApplyResult => ({
    rootPath: "/x",
    rootName: "x",
    requestedCount: requested,
    appliedCount: applied,
    notAppliedCount: requested - applied,
    results: [],
    createdFolders: [],
    appliedAt: "2026-01-01T00:00:00.000Z",
  });

  it("summarizes complete, partial and failed applies honestly", () => {
    expect(summarizeApplyResult(result(8, 8))).toBe("8 files organized successfully.");
    expect(summarizeApplyResult(result(7, 8))).toBe("7 files organized. 1 change could not be applied.");
    expect(summarizeApplyResult(result(0, 2))).toBe("No files were changed. 2 changes could not be applied.");
  });
});
