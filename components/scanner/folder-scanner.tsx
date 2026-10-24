"use client";

import { CircleAlert, FolderSearch, LoaderCircle } from "lucide-react";
import { useActionState, useState, type ReactNode } from "react";

import { scanFolderAction, type ScanActionState } from "@/app/actions/scan-folder";
import { ScanResults } from "@/components/scanner/scan-results";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ScanActionState = { status: "idle" };

export function FolderScanner({ aside }: { aside?: ReactNode }) {
  const [state, formAction, isPending] = useActionState(
    scanFolderAction,
    initialState,
  );
  const [folderPath, setFolderPath] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        <Card className="gap-0 py-0 shadow-sm">
          <CardHeader className="border-b py-5">
            <CardTitle>Choose a folder</CardTitle>
            <CardDescription>
              Paste the full path of a folder you want to tidy, like Downloads
              or Desktop.
            </CardDescription>
          </CardHeader>
          <CardContent className="py-5">
            <form action={formAction} className="flex flex-col gap-3">
              <Label htmlFor="folderPath" className="sr-only">
                Folder path
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="folderPath"
                  name="folderPath"
                  value={folderPath}
                  onChange={(event) => setFolderPath(event.target.value)}
                  placeholder="/Users/you/Downloads or C:\Users\you\Downloads"
                  autoComplete="off"
                  spellCheck={false}
                  className="h-10 font-mono text-sm"
                  aria-describedby="folderPath-help"
                  required
                />
                <Button
                  type="submit"
                  size="lg"
                  className="h-10 px-4"
                  disabled={isPending || folderPath.trim() === ""}
                >
                  {isPending ? (
                    <LoaderCircle className="animate-spin" aria-hidden />
                  ) : (
                    <FolderSearch aria-hidden />
                  )}
                  {isPending ? "Scanning…" : "Scan folder"}
                </Button>
              </div>
              <p id="folderPath-help" className="text-xs text-muted-foreground">
                Read-only. TidyMate looks at names, sizes, and dates on this
                computer. It doesn&apos;t open, change, or upload anything.
              </p>
              <FindPathHelp />
            </form>
          </CardContent>
        </Card>
        {aside}
      </div>

      <div aria-live="polite">
        {isPending ? (
          <ScanningState folderPath={folderPath} />
        ) : state.status === "error" ? (
          <ScanErrorAlert message={state.error.message} />
        ) : state.status === "success" ? (
          <ScanResults result={state.result} />
        ) : null}
      </div>
    </div>
  );
}

function FindPathHelp() {
  return (
    <details className="group text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer select-none hover:text-foreground">
        How do I find a folder&apos;s path?
      </summary>
      <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
        <li>
          <span className="font-medium text-foreground">macOS:</span> select the
          folder in Finder, hold Option, then right-click and choose “Copy as
          Pathname”.
        </li>
        <li>
          <span className="font-medium text-foreground">Windows:</span> hold
          Shift, right-click the folder, and choose “Copy as path”.
        </li>
        <li>
          <span className="font-medium text-foreground">Linux:</span> open the
          folder in your file manager and press Ctrl+L to show its path.
        </li>
      </ul>
    </details>
  );
}

function ScanningState({ folderPath }: { folderPath: string }) {
  return (
    <Card className="items-center gap-3 px-4 py-12 text-center shadow-sm">
      <LoaderCircle className="size-6 animate-spin text-brand" aria-hidden />
      <p className="font-medium">Scanning folder…</p>
      <p className="max-w-md text-sm break-all text-muted-foreground">
        Reading file names, sizes, and dates in{" "}
        <span className="font-mono">{folderPath.trim()}</span>
      </p>
    </Card>
  );
}

function ScanErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertTitle>Couldn&apos;t scan that folder</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
