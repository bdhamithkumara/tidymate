"use client";

import { CircleAlert, FolderSearch, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ApplyConfirmDialog } from "@/components/organizer/apply-confirm-dialog";
import { ApplyResultView } from "@/components/organizer/apply-result-view";
import { GeneratingState } from "@/components/organizer/generating-state";
import { SuggestionReview } from "@/components/organizer/suggestion-review";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requestApply, requestOrganizationPlan } from "@/lib/organization/client";
import { MAX_FILES_FOR_SUGGESTIONS } from "@/lib/organization/limits";
import {
  deselectAll,
  emptySelection,
  selectAll,
  selectedSourcePaths,
  summarizeSelection,
  toggleSelection,
  type Selection,
} from "@/lib/organization/selection";
import { plural } from "@/lib/organization/summary";
import type {
  ApplyFailure,
  ApplyResult,
  ReviewablePlan,
  SuggestFailure,
} from "@/types/organization";

type PanelState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "reviewing"; plan: ReviewablePlan; selection: Selection; confirming: boolean }
  | { status: "applying"; plan: ReviewablePlan; count: number }
  | { status: "applied"; result: ApplyResult }
  | { status: "apply-error"; error: ApplyFailure }
  | { status: "error"; error: SuggestFailure };

const RECOVERY_HINTS: Partial<Record<SuggestFailure["code"], string>> = {
  OLLAMA_UNAVAILABLE: "Open the Ollama app, or run “ollama serve” in a terminal.",
  NOT_FOUND: "The folder may have moved. Scan it again above.",
  PERMISSION_DENIED: "Scan the folder again above once TidyMate can read it.",
};

export function OrganizationPanel({
  folderPath,
  fileCount,
  onRescan,
}: {
  folderPath: string;
  fileCount: number;
  /** Scans the folder again so the user sees its new layout. */
  onRescan: () => void;
}) {
  const [state, setState] = useState<PanelState>({ status: "idle" });
  const controllerRef = useRef<AbortController | null>(null);

  // Stop waiting on the model if the panel goes away, e.g. after a new scan.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const plannedFileCount = Math.min(fileCount, MAX_FILES_FOR_SUGGESTIONS);

  async function generate() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "generating" });

    try {
      const response = await requestOrganizationPlan(folderPath, controller.signal);
      if (controller.signal.aborted) return;
      setState(
        response.ok
          ? { status: "reviewing", plan: response.plan, selection: emptySelection(), confirming: false }
          : { status: "error", error: response.error },
      );
    } catch {
      // Only cancellation reaches here; the cancel handler already reset state.
    }
  }

  function cancel() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState({ status: "idle" });
  }

  function updateReview(update: (current: Extract<PanelState, { status: "reviewing" }>) => Partial<Extract<PanelState, { status: "reviewing" }>>) {
    setState((current) => (current.status === "reviewing" ? { ...current, ...update(current) } : current));
  }

  async function apply(plan: ReviewablePlan, selection: Selection) {
    const sourcePaths = selectedSourcePaths(plan.suggestions, selection);
    if (sourcePaths.length === 0) return;
    setState({ status: "applying", plan, count: sourcePaths.length });

    const response = await requestApply(plan.planId, sourcePaths);
    setState(
      response.ok
        ? { status: "applied", result: response.result }
        : { status: "apply-error", error: response.error },
    );
  }

  const rescanButton = (
    <Button variant="outline" size="sm" onClick={onRescan}>
      <FolderSearch aria-hidden />
      Scan again
    </Button>
  );

  switch (state.status) {
    case "generating":
      return <GeneratingState fileCount={plannedFileCount} onCancel={cancel} />;

    case "reviewing": {
      const { plan, selection, confirming } = state;
      return (
        <>
          <SuggestionReview
            plan={plan}
            selection={selection}
            onToggle={(sourcePath) =>
              updateReview((current) => ({ selection: toggleSelection(current.selection, sourcePath) }))
            }
            onSelectAll={() => updateReview(() => ({ selection: selectAll(plan.suggestions) }))}
            onDeselectAll={() => updateReview(() => ({ selection: deselectAll() }))}
            onApply={() => updateReview(() => ({ confirming: true }))}
            actions={
              <Button variant="outline" size="sm" onClick={generate}>
                <RotateCcw aria-hidden />
                Ask again
              </Button>
            }
          />
          <ApplyConfirmDialog
            open={confirming}
            onOpenChange={(open) => updateReview(() => ({ confirming: open }))}
            summary={summarizeSelection(plan.suggestions, selection)}
            folderName={plan.rootName}
            onConfirm={() => void apply(plan, selection)}
          />
        </>
      );
    }

    case "applying":
      return (
        <Card className="items-center gap-3 px-4 py-12 text-center shadow-sm" aria-busy>
          <LoaderCircle className="size-6 animate-spin text-brand" aria-hidden />
          <p className="font-medium">Applying {plural(state.count, "change")}…</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Checking each file again, then moving and renaming. Please keep this page open.
          </p>
        </Card>
      );

    case "applied":
      return <ApplyResultView result={state.result} actions={rescanButton} />;

    case "apply-error":
      return (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Changes weren&apos;t applied</AlertTitle>
          <AlertDescription>
            <p>{state.error.message}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {rescanButton}
            </div>
          </AlertDescription>
        </Alert>
      );

    default:
      return (
        <div className="flex flex-col gap-4">
          {state.status === "error" ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden />
              <AlertTitle>Couldn&apos;t get suggestions</AlertTitle>
              <AlertDescription>
                <p>{state.error.message}</p>
                {RECOVERY_HINTS[state.error.code] ? (
                  <p>{RECOVERY_HINTS[state.error.code]}</p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <Card className="gap-0 py-0 shadow-sm">
            <CardHeader className="py-5">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-brand" aria-hidden />
                Suggest organization
              </CardTitle>
              <CardDescription>
                Gemma 3 4B runs locally through Ollama. It sees file names, types, sizes, and
                dates, never contents, and proposes tidier names and folders for you to review.
                {fileCount > MAX_FILES_FOR_SUGGESTIONS
                  ? ` It will look at ${MAX_FILES_FOR_SUGGESTIONS} of these ${fileCount.toLocaleString()} files at a time.`
                  : null}
              </CardDescription>
            </CardHeader>
            {state.status === "error" && !state.error.retryable ? null : (
              <CardContent className="pb-5">
                <Button size="lg" className="h-10 px-4" onClick={generate}>
                  {state.status === "error" ? <RotateCcw aria-hidden /> : <Sparkles aria-hidden />}
                  {state.status === "error" ? "Try again" : "Suggest organization"}
                </Button>
              </CardContent>
            )}
          </Card>
        </div>
      );
  }
}
