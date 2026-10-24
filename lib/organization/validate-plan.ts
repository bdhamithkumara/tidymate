import { getExtension } from "@/lib/files/file-kind";
import type { ScannedFile } from "@/types/files";
import type {
  ChangeAction,
  OrganizationSuggestion,
  RejectedSuggestion,
  RejectionReason,
  SuggestionAction,
} from "@/types/organization";

import { MAX_DESTINATION_SEGMENTS } from "./limits";
import {
  ancestorDirectories,
  checkDestinationPath,
  checkRelativePath,
  collisionKey,
  splitRelativePath,
} from "./relative-path";

/** A model suggestion that has passed schema validation but nothing else. */
export type CandidateSuggestion = {
  sourcePath: string;
  action: SuggestionAction;
  suggestedPath: string;
  reason: string;
};

/** One entry of the model's answer after schema parsing. */
export type ParsedModelItem =
  | { ok: true; value: CandidateSuggestion }
  | {
      ok: false;
      reason: Extract<RejectionReason, "malformed" | "unsupported-action">;
      sourcePath: string | null;
      suggestedPath: string | null;
    };

export type PlanValidationInput = {
  items: ParsedModelItem[];
  /** Files that were sent to the model; the only valid sources. */
  consideredFiles: ScannedFile[];
  /** Every scanned file, used to detect destinations that already exist. */
  allFiles: ScannedFile[];
};

export type PlanValidationResult = {
  suggestions: OrganizationSuggestion[];
  /** Sources the model explicitly chose to leave in place. */
  keptSources: string[];
  rejected: RejectedSuggestion[];
};

type Accepted = {
  candidate: CandidateSuggestion;
  file: ScannedFile;
  action: SuggestionAction;
};

/**
 * Deterministically checks an untrusted model plan against the scan it was
 * based on. A suggestion survives only if it references a scanned file, stays
 * inside the scanned folder, keeps its extension and cannot collide with any
 * other file or suggestion. Rejected suggestions are reported, never repaired.
 */
export function validatePlan({
  items,
  consideredFiles,
  allFiles,
}: PlanValidationInput): PlanValidationResult {
  const rejected: RejectedSuggestion[] = [];
  const reject = (candidate: { sourcePath: string | null; suggestedPath: string | null }, reason: RejectionReason) => {
    rejected.push({ sourcePath: candidate.sourcePath, suggestedPath: candidate.suggestedPath, reason });
  };

  const sources = new Map(consideredFiles.map((file) => [file.relativePath, file]));

  // 1. Per-suggestion checks.
  const individuallyValid: Accepted[] = [];
  for (const item of items) {
    if (!item.ok) {
      reject(item, item.reason);
      continue;
    }

    const candidate = item.value;
    const issue = checkSuggestion(candidate, sources);
    if (issue) {
      reject(candidate, issue);
      continue;
    }

    individuallyValid.push({
      candidate,
      file: sources.get(candidate.sourcePath)!,
      action: deriveAction(candidate.sourcePath, candidate.suggestedPath),
    });
  }

  // 2. A file may have at most one suggestion. Exact repeats are harmless and
  //    collapsed; different suggestions for the same file are all rejected.
  const bySource = groupBy(individuallyValid, (entry) => entry.candidate.sourcePath);
  const uniqueBySource: Accepted[] = [];
  for (const group of bySource.values()) {
    const destinations = new Set(group.map((entry) => entry.candidate.suggestedPath));
    if (destinations.size > 1) {
      group.forEach((entry) => reject(entry.candidate, "conflicting-suggestions"));
    } else {
      uniqueBySource.push(group[0]!);
    }
  }

  const keptSources = uniqueBySource
    .filter((entry) => entry.action === "keep")
    .map((entry) => entry.candidate.sourcePath);
  const changes = uniqueBySource.filter((entry) => entry.action !== "keep");

  // 3. No two changes may land on the same path.
  const byDestination = groupBy(changes, (entry) => collisionKey(entry.candidate.suggestedPath));
  const uniqueDestinations: Accepted[] = [];
  for (const group of byDestination.values()) {
    if (group.length > 1) {
      group.forEach((entry) => reject(entry.candidate, "duplicate-destination"));
    } else {
      uniqueDestinations.push(group[0]!);
    }
  }

  // 4. A destination may not replace an existing file or folder, or need a
  //    folder where a file already exists. Chains and swaps are not allowed.
  const existingFiles = new Set(allFiles.map((file) => collisionKey(file.relativePath)));
  const existingDirectories = new Set(
    allFiles.flatMap((file) => ancestorDirectories(file.relativePath)).map(collisionKey),
  );

  const suggestions: OrganizationSuggestion[] = [];
  for (const entry of uniqueDestinations) {
    const { candidate, file } = entry;
    const destinationKey = collisionKey(candidate.suggestedPath);
    const isCaseOnlyRename = destinationKey === collisionKey(candidate.sourcePath);
    const blocked =
      (!isCaseOnlyRename && existingFiles.has(destinationKey)) ||
      existingDirectories.has(destinationKey) ||
      ancestorDirectories(candidate.suggestedPath).some((dir) => existingFiles.has(collisionKey(dir)));

    if (blocked) {
      reject(candidate, "destination-exists");
      continue;
    }

    suggestions.push({
      sourcePath: candidate.sourcePath,
      suggestedPath: candidate.suggestedPath,
      suggestedName: splitRelativePath(candidate.suggestedPath).name,
      action: entry.action as ChangeAction,
      reason: candidate.reason,
      source: { sizeBytes: file.sizeBytes, modifiedAt: file.modifiedAt, kind: file.kind },
    });
  }

  suggestions.sort((a, b) => compare(a.suggestedPath, b.suggestedPath));
  return { suggestions, keptSources, rejected };
}

function checkSuggestion(
  candidate: CandidateSuggestion,
  sources: Map<string, ScannedFile>,
): RejectionReason | null {
  const sourceIssue = checkRelativePath(candidate.sourcePath);
  if (sourceIssue) {
    return sourceIssue;
  }
  if (!sources.has(candidate.sourcePath)) {
    return "unknown-source";
  }

  // Leaving a file where it is needs no destination checks.
  if (candidate.suggestedPath === candidate.sourcePath) {
    return null;
  }

  const destinationIssue = checkDestinationPath(candidate.suggestedPath);
  if (destinationIssue) {
    return destinationIssue;
  }
  if (candidate.suggestedPath.split("/").length > MAX_DESTINATION_SEGMENTS) {
    return "destination-too-deep";
  }

  const sourceName = splitRelativePath(candidate.sourcePath).name;
  const destinationName = splitRelativePath(candidate.suggestedPath).name;
  if (getExtension(sourceName) !== getExtension(destinationName)) {
    return "extension-changed";
  }

  return null;
}

/**
 * The action is a pure function of the two paths. Deriving it means the label
 * shown to the user always matches the change, whatever the model claimed.
 */
export function deriveAction(sourcePath: string, suggestedPath: string): SuggestionAction {
  if (sourcePath === suggestedPath) {
    return "keep";
  }
  const source = splitRelativePath(sourcePath);
  const destination = splitRelativePath(suggestedPath);
  const moved = source.directory !== destination.directory;
  const renamed = source.name !== destination.name;
  if (moved && renamed) return "move_and_rename";
  return moved ? "move" : "rename";
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

function compare(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
