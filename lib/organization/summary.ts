import type { ApplyResult } from "@/types/organization";

import type { SelectionSummary } from "./selection";

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
}

/** e.g. "3 of 10 selected: 2 files moved, 1 file renamed." */
export function describeSelection(summary: SelectionSummary): string {
  const parts: string[] = [];
  if (summary.moveCount > 0) parts.push(`${plural(summary.moveCount, "file")} moved`);
  if (summary.renameCount > 0) parts.push(`${plural(summary.renameCount, "file")} renamed`);
  return `${summary.selectedCount} of ${summary.totalCount} selected: ${parts.join(", ")}.`;
}

/** Never claims more than actually happened. */
export function summarizeApplyResult(result: ApplyResult): string {
  if (result.requestedCount > 0 && result.appliedCount === result.requestedCount) {
    return `${plural(result.appliedCount, "file")} organized successfully.`;
  }
  if (result.appliedCount === 0) {
    return `No files were changed. ${plural(result.notAppliedCount, "change")} could not be applied.`;
  }
  return `${plural(result.appliedCount, "file")} organized. ${plural(result.notAppliedCount, "change")} could not be applied.`;
}
