import { ArrowDown, ArrowRight, FolderInput, PencilLine, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ACTION_LABELS, REJECTION_LABELS } from "@/lib/organization/labels";
import type { ChangeAction, OrganizationPlan, OrganizationSuggestion } from "@/types/organization";

const ACTION_ICONS: Record<ChangeAction, LucideIcon> = {
  rename: PencilLine,
  move: FolderInput,
  move_and_rename: FolderInput,
};

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
}

export function SuggestionReview({
  plan,
  actions,
}: {
  plan: OrganizationPlan;
  actions?: React.ReactNode;
}) {
  const count = plan.suggestions.length;

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="border-b py-5">
        <CardTitle>Review these suggestions</CardTitle>
        <CardDescription>
          {count > 0
            ? `${plan.model} suggested ${plural(count, "change")} for ${plan.rootName}.`
            : `${plan.model} didn't suggest any changes for ${plan.rootName}.`}
        </CardDescription>
        {actions ? <CardAction>{actions}</CardAction> : null}
      </CardHeader>

      <div className="flex items-start gap-2 border-b bg-brand-muted/40 px-4 py-3 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
        <p>
          <span className="font-medium">Nothing has been changed.</span>{" "}
          <span className="text-muted-foreground">
            These are suggestions only. Applying them will come in a later version, and
            always after your approval.
          </span>
        </p>
      </div>

      {count > 0 ? (
        <ul className="divide-y">
          {plan.suggestions.map((suggestion) => (
            <SuggestionRow key={suggestion.sourcePath} suggestion={suggestion} />
          ))}
        </ul>
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

function SuggestionRow({ suggestion }: { suggestion: OrganizationSuggestion }) {
  const Icon = ACTION_ICONS[suggestion.action];
  return (
    <li className="flex flex-col gap-2 px-4 py-4">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="font-normal">
          <Icon aria-hidden />
          {ACTION_LABELS[suggestion.action]}
        </Badge>
      </div>
      <div className="grid gap-1 font-mono text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-3">
        <span className="truncate text-muted-foreground" title={suggestion.sourcePath}>
          {suggestion.sourcePath}
        </span>
        <ArrowRight className="hidden size-4 text-muted-foreground sm:block" aria-label="becomes" />
        <ArrowDown className="size-4 text-muted-foreground sm:hidden" aria-label="becomes" />
        <span className="truncate font-medium" title={suggestion.suggestedPath}>
          {suggestion.suggestedPath}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
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
