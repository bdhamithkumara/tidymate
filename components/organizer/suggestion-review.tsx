"use client";

import { ArrowDown, ArrowRight, FolderInput, PencilLine, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ACTION_LABELS, REJECTION_LABELS } from "@/lib/organization/labels";
import { summarizeSelection, type Selection, type SelectionSummary } from "@/lib/organization/selection";
import { describeSelection, plural } from "@/lib/organization/summary";
import type { ChangeAction, OrganizationPlan, OrganizationSuggestion } from "@/types/organization";

const ACTION_ICONS: Record<ChangeAction, LucideIcon> = {
  rename: PencilLine,
  move: FolderInput,
  move_and_rename: FolderInput,
};

export function SuggestionReview({
  plan,
  selection,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onApply,
  actions,
}: {
  plan: OrganizationPlan;
  selection: Selection;
  onToggle: (sourcePath: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onApply: () => void;
  actions?: React.ReactNode;
}) {
  const count = plan.suggestions.length;
  const summary = summarizeSelection(plan.suggestions, selection);

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="border-b py-5">
        <CardTitle>Review these suggestions</CardTitle>
        <CardDescription>
          {count > 0
            ? `${plan.model} suggested ${plural(count, "change")} for ${plan.rootName}. Choose the ones you want.`
            : `${plan.model} didn't suggest any changes for ${plan.rootName}.`}
        </CardDescription>
        {actions ? <CardAction>{actions}</CardAction> : null}
      </CardHeader>

      <div className="flex items-start gap-2 border-b bg-brand-muted/40 px-4 py-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
        <p>
          <span className="font-medium">Nothing has been changed yet.</span>{" "}
          <span className="text-muted-foreground">
            Only the changes you select are applied, after you confirm. TidyMate checks
            every file again first, and never deletes or overwrites anything.
          </span>
        </p>
      </div>

      {count > 0 ? (
        <>
          <SelectionToolbar
            summary={summary}
            onSelectAll={onSelectAll}
            onDeselectAll={onDeselectAll}
          />
          <ul className="divide-y">
            {plan.suggestions.map((suggestion) => (
              <SuggestionRow
                key={suggestion.sourcePath}
                suggestion={suggestion}
                checked={selection.has(suggestion.sourcePath)}
                onToggle={onToggle}
              />
            ))}
          </ul>
          <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {summary.selectedCount === 0
                ? "Select at least one change to apply."
                : describeSelection(summary)}
            </p>
            <Button
              size="lg"
              className="h-10 px-4"
              disabled={summary.selectedCount === 0}
              onClick={onApply}
            >
              Apply selected changes
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <p className="font-medium">This folder already looks tidy</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Gemma didn&apos;t find anything worth moving or renaming. You can ask again for
            different ideas.
          </p>
        </div>
      )}

      <CardContent className="flex flex-col gap-2 border-t px-4 py-4 text-xs text-muted-foreground">
        <p>
          {plural(plan.unchangedCount, "file")} would stay where{" "}
          {plan.unchangedCount === 1 ? "it is" : "they are"}.
          {plan.consideredFileCount < plan.totalFileCount
            ? ` Gemma looked at ${plan.consideredFileCount} of ${plan.totalFileCount.toLocaleString()} files, starting with the ones at the top of the folder.`
            : null}
        </p>
        {plan.rejected.length > 0 ? <RejectedDetails plan={plan} /> : null}
      </CardContent>
    </Card>
  );
}

function SelectionToolbar({
  summary,
  onSelectAll,
  onDeselectAll,
}: {
  summary: SelectionSummary;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
      <label className="flex items-center gap-3 text-sm">
        <Checkbox
          checked={summary.allSelected}
          indeterminate={summary.selectedCount > 0 && !summary.allSelected}
          onCheckedChange={(checked) => (checked ? onSelectAll() : onDeselectAll())}
          aria-label="Select all suggestions"
        />
        <span>
          {summary.selectedCount} of {summary.totalCount} selected
        </span>
      </label>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={onSelectAll} disabled={summary.allSelected}>
          Select all
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDeselectAll}
          disabled={summary.selectedCount === 0}
        >
          Deselect all
        </Button>
      </div>
    </div>
  );
}

function SuggestionRow({
  suggestion,
  checked,
  onToggle,
}: {
  suggestion: OrganizationSuggestion;
  checked: boolean;
  onToggle: (sourcePath: string) => void;
}) {
  const Icon = ACTION_ICONS[suggestion.action];
  const id = `suggestion-${encodeURIComponent(suggestion.sourcePath)}`;
  return (
    <li className="flex gap-3 px-4 py-4 has-data-checked:bg-muted/30">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={() => onToggle(suggestion.sourcePath)}
        className="mt-0.5"
        aria-label={`Select: ${suggestion.sourcePath} to ${suggestion.suggestedPath}`}
      />
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-2">
        <span>
          <Badge variant="secondary" className="font-normal">
            <Icon aria-hidden />
            {ACTION_LABELS[suggestion.action]}
          </Badge>
        </span>
        <span className="grid gap-1 font-mono text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-3">
          <span className="truncate text-muted-foreground" title={suggestion.sourcePath}>
            {suggestion.sourcePath}
          </span>
          <ArrowRight className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
          <ArrowDown className="size-4 text-muted-foreground sm:hidden" aria-hidden />
          <span className="truncate font-medium" title={suggestion.suggestedPath}>
            {suggestion.suggestedPath}
          </span>
        </span>
        <span className="text-sm text-muted-foreground">{suggestion.reason}</span>
      </label>
    </li>
  );
}

function RejectedDetails({ plan }: { plan: OrganizationPlan }) {
  return (
    <details>
      <summary className="w-fit cursor-pointer select-none hover:text-foreground">
        {plural(plan.rejected.length, "suggestion")} didn&apos;t pass TidyMate&apos;s safety
        checks and {plan.rejected.length === 1 ? "was" : "were"} left out
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5">
        {plan.rejected.map((rejection, index) => (
          <li key={index} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
            <span className="font-medium text-foreground">
              {REJECTION_LABELS[rejection.reason]}
            </span>
            <span className="truncate font-mono" title={rejection.suggestedPath ?? undefined}>
              {rejection.sourcePath ?? "(no file)"}
              {rejection.suggestedPath ? ` → ${rejection.suggestedPath}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
