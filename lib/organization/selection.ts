import type { ChangeAction, OrganizationSuggestion } from "@/types/organization";

/** Selected suggestions, keyed by source path (unique within a plan). */
export type Selection = ReadonlySet<string>;

export function emptySelection(): Selection {
  return new Set();
}

export function toggleSelection(selection: Selection, sourcePath: string): Selection {
  const next = new Set(selection);
  if (next.has(sourcePath)) next.delete(sourcePath);
  else next.add(sourcePath);
  return next;
}

export function selectAll(suggestions: readonly OrganizationSuggestion[]): Selection {
  return new Set(suggestions.map((s) => s.sourcePath));
}

export function deselectAll(): Selection {
  return new Set();
}

export type SelectionSummary = {
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  byAction: Record<ChangeAction, number>;
  /** Files that would end up in a different folder. */
  moveCount: number;
  /** Files that would get a different name. */
  renameCount: number;
};

/** Counts what the current selection would do. Ignores unknown entries. */
export function summarizeSelection(
  suggestions: readonly OrganizationSuggestion[],
  selection: Selection,
): SelectionSummary {
  const byAction: Record<ChangeAction, number> = { move: 0, rename: 0, move_and_rename: 0 };
  let selectedCount = 0;
  for (const suggestion of suggestions) {
    if (!selection.has(suggestion.sourcePath)) continue;
    selectedCount += 1;
    byAction[suggestion.action] += 1;
  }
  return {
    selectedCount,
    totalCount: suggestions.length,
    allSelected: suggestions.length > 0 && selectedCount === suggestions.length,
    byAction,
    moveCount: byAction.move + byAction.move_and_rename,
    renameCount: byAction.rename + byAction.move_and_rename,
  };
}

/**
 * The selected source paths, in plan order, limited to suggestions that are
 * actually in the plan. This is all the browser sends to apply changes.
 */
export function selectedSourcePaths(
  suggestions: readonly OrganizationSuggestion[],
  selection: Selection,
): string[] {
  return suggestions.filter((s) => selection.has(s.sourcePath)).map((s) => s.sourcePath);
}
