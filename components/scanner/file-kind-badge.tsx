import { Badge } from "@/components/ui/badge";
import { FILE_KIND_LABELS } from "@/lib/files/file-kind";
import type { FileKind } from "@/types/files";

export function FileKindBadge({
  kind,
  extension,
}: {
  kind: FileKind;
  extension: string;
}) {
  return (
    <Badge variant="secondary" className="font-normal text-muted-foreground">
      {FILE_KIND_LABELS[kind]}
      {extension ? (
        <span className="font-mono text-[11px] opacity-70">.{extension}</span>
      ) : null}
    </Badge>
  );
}
