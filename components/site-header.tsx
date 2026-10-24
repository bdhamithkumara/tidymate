import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";

export function SiteHeader() {
  return (
    <header className="border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <BrandMark />
        <Badge variant="outline" className="text-muted-foreground">
          Early preview
        </Badge>
      </div>
    </header>
  );
}
