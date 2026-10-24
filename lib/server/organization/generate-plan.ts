import "server-only";

import { AiError } from "@/lib/ai/errors";
import { selectFilesForSuggestions, toAiFileMetadata } from "@/lib/ai/file-metadata";
import type { OrganizationProvider } from "@/lib/ai/provider";
import { validatePlan } from "@/lib/organization/validate-plan";
import { scanDirectory } from "@/lib/server/files/scanner";
import type { OrganizationPlan } from "@/types/organization";

export type GeneratePlanOptions = {
  provider: OrganizationProvider;
  signal?: AbortSignal;
  now?: () => Date;
};

/**
 * Produces a validated, read-only organization plan for a folder.
 *
 * The folder is always re-scanned here: file metadata is never accepted from
 * the browser, so the model only sees, and the plan only references, files
 * that the server itself just found.
 */
export async function generateOrganizationPlan(
  folderPath: string,
  { provider, signal, now = () => new Date() }: GeneratePlanOptions,
): Promise<OrganizationPlan> {
  const startedAt = now();
  const scan = await scanDirectory(folderPath);
  const consideredFiles = selectFilesForSuggestions(scan.files);

  const base = {
    rootPath: scan.rootPath,
    rootName: scan.rootName,
    model: provider.model,
    consideredFileCount: consideredFiles.length,
    totalFileCount: scan.files.length,
  };

  if (consideredFiles.length === 0) {
    return { ...base, ...finish(startedAt, now), suggestions: [], unchangedCount: 0, rejected: [] };
  }

  const proposal = await provider.suggestOrganization(
    { folderName: scan.rootName, files: consideredFiles.map(toAiFileMetadata) },
    { signal },
  );

  const validation = validatePlan({
    items: proposal.items,
    consideredFiles,
    allFiles: scan.files,
  });

  const acceptedCount = validation.suggestions.length + validation.keptSources.length;
  if (proposal.items.length > 0 && acceptedCount === 0) {
    throw new AiError("VALIDATION_FAILED");
  }

  return {
    ...base,
    ...finish(startedAt, now),
    model: proposal.model,
    suggestions: validation.suggestions,
    unchangedCount: consideredFiles.length - validation.suggestions.length,
    rejected: validation.rejected,
  };
}

function finish(startedAt: Date, now: () => Date) {
  const finishedAt = now();
  return {
    generatedAt: finishedAt.toISOString(),
    durationMs: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
  };
}
