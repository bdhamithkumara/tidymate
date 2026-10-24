import { getExtension, getFileKind } from "@/lib/files/file-kind";
import type { CandidateSuggestion, ParsedModelItem } from "@/lib/organization/validate-plan";
import type { ScannedFile } from "@/types/files";

export function scannedFile(relativePath: string, overrides: Partial<ScannedFile> = {}): ScannedFile {
  const name = relativePath.split("/").at(-1) ?? relativePath;
  const extension = getExtension(name);
  return {
    name,
    extension,
    relativePath,
    sizeBytes: 1024,
    modifiedAt: "2026-03-14T09:26:53.000Z",
    kind: getFileKind(extension),
    ...overrides,
  };
}

export function candidate(
  sourcePath: string,
  suggestedPath: string,
  overrides: Partial<CandidateSuggestion> = {},
): ParsedModelItem {
  return {
    ok: true,
    value: {
      sourcePath,
      suggestedPath,
      action: "move",
      reason: "Groups similar files together.",
      ...overrides,
    },
  };
}
