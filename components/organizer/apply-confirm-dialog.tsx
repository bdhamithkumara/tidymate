"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { SelectionSummary } from "@/lib/organization/selection";
import { plural } from "@/lib/organization/summary";

export function ApplyConfirmDialog({
  open,
  onOpenChange,
  summary,
  folderName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: SelectionSummary;
  folderName: string;
  onConfirm: () => void;
}) {
  const count = summary.selectedCount;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            You&apos;re about to organize {plural(count, "file")}.
          </AlertDialogTitle>
          <AlertDialogDescription>No files will be deleted.</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          {summary.moveCount > 0 ? (
            <li>
              {plural(summary.moveCount, "file")} will be moved into folders inside{" "}
              <span className="font-medium text-foreground">{folderName}</span>.
            </li>
          ) : null}
          {summary.renameCount > 0 ? (
            <li>{plural(summary.renameCount, "file")} will be renamed.</li>
          ) : null}
          <li>Nothing will be deleted or overwritten.</li>
          <li>
            TidyMate checks every file again first and skips anything that changed.
          </li>
          <li>
            There is no undo yet. To reverse a change, you&apos;d need to move or rename the
            file back yourself.
          </li>
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Apply changes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
