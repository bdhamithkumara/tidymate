import type { LucideIcon } from "lucide-react";
import { CircleCheck, FolderSearch, ListChecks, Sparkles } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type WorkflowStep = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const steps: readonly WorkflowStep[] = [
  {
    icon: FolderSearch,
    title: "Scan a folder",
    description: "Read file names and basic metadata on your machine.",
  },
  {
    icon: Sparkles,
    title: "Get suggestions",
    description: "A local model proposes names, categories, and folders.",
  },
  {
    icon: ListChecks,
    title: "Review the plan",
    description: "See every proposed change and pick the ones you want.",
  },
  {
    icon: CircleCheck,
    title: "Apply on approval",
    description: "Nothing moves or gets renamed until you say so.",
  },
];

export function WorkflowPreview() {
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="border-b py-5">
        <CardTitle>How TidyMate works</CardTitle>
        <CardDescription>
          The AI suggests. You decide. TidyMate applies.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <ol className="divide-y">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4 px-4 py-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-muted text-brand">
                <step.icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  <span className="mr-1.5 text-muted-foreground tabular-nums">
                    {index + 1}.
                  </span>
                  {step.title}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
