"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const STATUS_LINES = [
  "Analyzing your files locally…",
  "Looking at names, types, sizes, and dates. Never contents.",
  "Local AI can take a few minutes on slower computers.",
  "Nothing will change. You'll review every suggestion first.",
] as const;

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function GeneratingState({
  fileCount,
  onCancel,
}: {
  fileCount: number;
  onCancel: () => void;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const statusLine = STATUS_LINES[Math.floor(elapsedSeconds / 8) % STATUS_LINES.length];

  return (
    <Card className="items-center gap-4 px-4 py-10 text-center shadow-sm" aria-busy>
      <span className="flex size-11 items-center justify-center rounded-full bg-brand-muted text-brand">
        <Sparkles className="size-5 animate-pulse" aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-medium">Gemma is thinking…</p>
        <p className="text-sm text-muted-foreground">
          Planning for {fileCount.toLocaleString()} {fileCount === 1 ? "file" : "files"} on
          this computer.
        </p>
      </div>
      <div className="h-1 w-48 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full w-1/3 animate-[tidymate-progress_1.8s_ease-in-out_infinite] rounded-full bg-brand/70" />
      </div>
      <p className="min-h-5 text-sm text-muted-foreground" aria-live="polite">
        {statusLine}
      </p>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatElapsed(elapsedSeconds)}
        </span>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
