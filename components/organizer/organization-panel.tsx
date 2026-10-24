"use client";

import { CircleAlert, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
import { requestOrganizationPlan } from "@/lib/organization/client";
import { MAX_FILES_FOR_SUGGESTIONS } from "@/lib/organization/limits";
import type { OrganizationPlan, SuggestFailure } from "@/types/organization";

type PanelState =
  | { status: "idle" }
  | { status: "generating" }
  | { status: "done"; plan: OrganizationPlan }
  | { status: "error"; error: SuggestFailure };

const RECOVERY_HINTS: Partial<Record<SuggestFailure["code"], string>> = {
  OLLAMA_UNAVAILABLE: "Open the Ollama app, or run “ollama serve” in a terminal.",
  NOT_FOUND: "The folder may have moved. Scan it again above.",
  PERMISSION_DENIED: "Scan the folder again above once TidyMate can read it.",
};

export function OrganizationPanel({
  folderPath,
  fileCount,
}: {
  folderPath: string;
  fileCount: number;
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
          ? { status: "done", plan: response.plan }
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

  if (state.status === "generating") {
    return <GeneratingState fileCount={plannedFileCount} onCancel={cancel} />;
  }

  if (state.status === "done") {
    return (
      <SuggestionReview
        plan={state.plan}
        actions={
          <Button variant="outline" size="sm" onClick={generate}>
            <RotateCcw aria-hidden />
            Ask again
          </Button>
        }
      />
    );
  }

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
