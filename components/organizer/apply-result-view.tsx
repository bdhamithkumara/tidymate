import { ArrowRight, CircleAlert, CircleCheck, CircleMinus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APPLY_FAILURE_LABELS, APPLY_STATUS_LABELS } from "@/lib/organization/labels";
import { summarizeApplyResult } from "@/lib/organization/summary";
import type { ApplyOperationResult, ApplyResult, ApplyStatus } from "@/types/organization";

const STATUS_ICONS: Record<ApplyStatus, LucideIcon> = {
  applied: CircleCheck,
  rejected: CircleMinus,
  failed: CircleAlert,
  "not-attempted": CircleMinus,
};

const STATUS_COLORS: Record<ApplyStatus, string> = {
  applied: "text-brand",
  rejected: "text-muted-foreground",
  failed: "text-destructive",
  "not-attempted": "text-muted-foreground",
};

export function ApplyResultView({
  result,
  actions,
}: {
  result: ApplyResult;
  actions?: React.ReactNode;
}) {
  const allApplied = result.appliedCount === result.requestedCount;
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="border-b py-5">
        <CardTitle className="flex items-center gap-2">
          {allApplied ? (
            <CircleCheck className="size-4 text-brand" aria-hidden />
          ) : (
            <CircleAlert className="size-4 text-destructive" aria-hidden />
          )}
          Organization complete
        </CardTitle>
        <CardDescription aria-live="polite">{summarizeApplyResult(result)}</CardDescription>
        {actions ? <CardAction>{actions}</CardAction> : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-3 px-4 py-4">
        <dl className="grid grid-cols-3 gap-3">
          <Stat label="Requested" value={result.requestedCount} />
          <Stat label="Applied" value={result.appliedCount} />
          <Stat label="Not applied" value={result.notAppliedCount} />
        </dl>
        {result.createdFolders.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            New {result.createdFolders.length === 1 ? "folder" : "folders"}:{" "}
            <span className="font-mono">{result.createdFolders.join(", ")}</span>
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Nothing was deleted. There is no undo yet; this list shows where every file went.
        </p>
      </CardContent>

      <ul className="divide-y border-t">
        {result.results.map((entry) => (
          <ResultRow key={entry.sourcePath} entry={entry} />
        ))}
      </ul>
    </Card>
  );
}

function ResultRow({ entry }: { entry: ApplyOperationResult }) {
  const Icon = STATUS_ICONS[entry.status];
  const applied = entry.status === "applied";
  return (
    <li className="flex gap-3 px-4 py-3">
      <Icon className={`mt-0.5 size-4 shrink-0 ${STATUS_COLORS[entry.status]}`} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-sm">
          <span className={applied ? "text-muted-foreground line-through" : ""}>
            {entry.sourcePath}
          </span>
          {applied ? (
            <>
              <ArrowRight className="size-3.5 text-muted-foreground" aria-label="now at" />
              <span className="font-medium">{entry.suggestedPath}</span>
            </>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          <span className={`font-medium ${STATUS_COLORS[entry.status]}`}>
            {APPLY_STATUS_LABELS[entry.status]}
          </span>
          {entry.reason ? ` · ${APPLY_FAILURE_LABELS[entry.reason]}` : null}
          {!applied ? ` Not moved to ${entry.suggestedPath}.` : null}
        </p>
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}
