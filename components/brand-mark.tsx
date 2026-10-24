import { FolderCheck } from "lucide-react";

import { siteConfig } from "@/lib/site";

export function BrandMark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground"
      >
        <FolderCheck className="size-4.5" strokeWidth={2} />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">
        {siteConfig.name}
      </span>
    </span>
  );
}
