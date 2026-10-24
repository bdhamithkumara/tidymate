import { FolderOpen, Info, ShieldCheck } from "lucide-react";

import { ScannedFileTable } from "@/components/scanner/scanned-file-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatBytes } from "@/lib/files/format";
import type { ScanResult, SkipReason } from "@/types/files";

const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  hidden: "hidden",
  symlink: "links or shortcuts",
  special: "system entries",
  unreadable: "unreadable",
  "outside-root": "outside the folder",
  "too-deep": "too deeply nested",
};

function describeSkipped(result: ScanResult): string | null {
  const parts = Object.entries(result.stats.skippedByReason)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${count} ${SKIP_REASON_LABELS[reason as SkipReason]}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
}

export function ScanResults({ result }: { result: ScanResult }) {
  const { stats } = result;
  const skippedSummary = describeSkipped(result);

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="border-b py-5">
        <CardTitle className="flex items-center gap-2">
          <FolderOpen className="size-4 text-brand" aria-hidden />
          {result.rootName}
        </CardTitle>
        <CardDescription className="break-all font-mono text-xs">
          {result.rootPath}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 px-4 py-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Files found" value={stats.fileCount.toLocaleString()} />
          <Stat label="Total size" value={formatBytes(stats.totalSizeBytes)} />
          <Stat label="Subfolders" value={stats.directoryCount.toLocaleString()} />
          <Stat label="Skipped" value={stats.skippedCount.toLocaleString()} />
        </dl>

        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 text-brand" aria-hidden />
          Read-only scan. Nothing was opened, moved, or changed.
        </p>

        {result.truncated ? (
          <Alert>
            <Info aria-hidden />
            <AlertDescription>
              This folder is large, so TidyMate stopped after{" "}
              {plural(result.limits.maxFiles, "file")}. Try a more specific
              subfolder for a complete picture.
            </AlertDescription>
          </Alert>
        ) : null}

        {skippedSummary ? (
          <p className="text-xs text-muted-foreground">
            Skipped {plural(stats.skippedCount, "item")}: {skippedSummary}.
            Links are never followed, and folders more than{" "}
            {plural(result.limits.maxDepth, "level")} deep aren&apos;t scanned.
          </p>
        ) : null}
      </CardContent>

      {result.files.length > 0 ? (
        <div className="border-t">
          <ScannedFileTable files={result.files} />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 border-t px-4 py-12 text-center">
          <p className="font-medium">No files to organize here</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            This folder is empty, or only contains hidden items and links.
            Try another folder.
          </p>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
