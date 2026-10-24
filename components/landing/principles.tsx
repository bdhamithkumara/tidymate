import type { LucideIcon } from "lucide-react";
import { Cpu, HardDrive, ShieldCheck } from "lucide-react";

type Principle = {
  icon: LucideIcon;
  label: string;
};

const principles: readonly Principle[] = [
  { icon: HardDrive, label: "Runs on your machine" },
  { icon: Cpu, label: "Open-weight Gemma model via Ollama" },
  { icon: ShieldCheck, label: "No changes without your approval" },
];

export function Principles() {
  return (
    <ul className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
      {principles.map((principle) => (
        <li key={principle.label} className="flex items-center gap-2">
          <principle.icon className="size-4 text-brand" aria-hidden />
          {principle.label}
        </li>
      ))}
    </ul>
  );
}
