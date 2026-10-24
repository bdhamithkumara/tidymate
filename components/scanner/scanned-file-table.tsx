import { FileKindBadge } from "@/components/scanner/file-kind-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FILE_KIND_LABELS } from "@/lib/files/file-kind";
import { formatBytes } from "@/lib/files/format";
import type { ScannedFile } from "@/types/files";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function parentFolder(relativePath: string): string {
  const lastSlash = relativePath.lastIndexOf("/");
  return lastSlash === -1 ? "" : relativePath.slice(0, lastSlash);
}

export function ScannedFileTable({ files }: { files: ScannedFile[] }) {
  return (
    <div className="max-h-[32rem] overflow-y-auto">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="pl-4">Name</TableHead>
            <TableHead className="hidden md:table-cell">Type</TableHead>
            <TableHead className="text-right">Size</TableHead>
            <TableHead className="hidden pr-4 sm:table-cell">Modified</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((file) => {
            const folder = parentFolder(file.relativePath);
            const modified = dateFormatter.format(new Date(file.modifiedAt));
            return (
              <TableRow key={file.relativePath}>
                <TableCell className="max-w-0 pl-4 whitespace-normal">
                  <p className="truncate font-medium" title={file.name}>
                    {file.name}
                  </p>
                  {folder ? (
                    <p
                      className="truncate text-xs text-muted-foreground"
                      title={folder}
                    >
                      in {folder}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground sm:hidden">
                    {FILE_KIND_LABELS[file.kind]} · {modified}
                  </p>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <FileKindBadge kind={file.kind} extension={file.extension} />
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {formatBytes(file.sizeBytes)}
                </TableCell>
                <TableCell className="hidden pr-4 text-muted-foreground tabular-nums sm:table-cell">
                  <time dateTime={file.modifiedAt}>{modified}</time>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
