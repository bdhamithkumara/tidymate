import type { FileKind, ScanErrorCode } from "@/types/files";

/**
 * Shapes for AI-generated organization plans.
 *
 * A plan is only ever a proposal. Nothing in these types describes deletion,
 * overwriting or execution, and nothing is applied to disk in this version.
 */

export const SUGGESTION_ACTIONS = ["keep", "rename", "move", "move_and_rename"] as const;

export type SuggestionAction = (typeof SUGGESTION_ACTIONS)[number];

export type ChangeAction = Exclude<SuggestionAction, "keep">;

export type OrganizationSuggestion = {
  /** The file's current relative path; unique within a plan. */
  sourcePath: string;
  /** Proposed relative path, including the file name. */
  suggestedPath: string;
  suggestedName: string;
  /** Derived from the two paths, not taken from the model. */
  action: ChangeAction;
  reason: string;
  /**
   * Scanner metadata at the time the plan was made, so a later step can
   * confirm the file hasn't changed before anything is applied.
   */
  source: {
    sizeBytes: number;
    modifiedAt: string;
    kind: FileKind;
  };
};

export const REJECTION_REASONS = [
  "malformed",
  "unsupported-action",
  "unknown-source",
  "absolute-path",
  "path-traversal",
  "invalid-path",
  "destination-too-deep",
  "extension-changed",
  "conflicting-suggestions",
  "duplicate-destination",
  "destination-exists",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

export type RejectedSuggestion = {
  /** As written by the model (trimmed and length-limited), or null if missing. */
  sourcePath: string | null;
  suggestedPath: string | null;
  reason: RejectionReason;
};

export type OrganizationPlan = {
  rootPath: string;
  rootName: string;
  model: string;
  generatedAt: string;
  durationMs: number;
  /** Validated changes only; files without a suggestion stay where they are. */
  suggestions: OrganizationSuggestion[];
  /** Files the model saw that have no accepted change. */
  unchangedCount: number;
  rejected: RejectedSuggestion[];
  /** Files sent to the model, which may be fewer than were scanned. */
  consideredFileCount: number;
  totalFileCount: number;
};

export const AI_ERROR_CODES = [
  "OLLAMA_UNAVAILABLE",
  "MODEL_NOT_FOUND",
  "TIMEOUT",
  "HTTP_ERROR",
  "INVALID_JSON",
  "INVALID_OUTPUT",
  "VALIDATION_FAILED",
  "CANCELLED",
] as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export type SuggestErrorCode = AiErrorCode | ScanErrorCode | "INVALID_REQUEST";

export type SuggestFailure = {
  code: SuggestErrorCode;
  message: string;
  /** Whether trying again unchanged has a reasonable chance of working. */
  retryable: boolean;
};

/**
 * A plan the server has remembered so it can be applied later. The browser
 * refers to it only by `planId`; destinations and expected file metadata are
 * read back from server memory, never from the request.
 */
export type ReviewablePlan = OrganizationPlan & {
  planId: string;
  expiresAt: string;
};

export type SuggestResponse =
  | { ok: true; plan: ReviewablePlan }
  | { ok: false; error: SuggestFailure };

/* ---------- Applying a plan ---------- */

export const APPLY_STATUSES = ["applied", "rejected", "failed", "not-attempted"] as const;

/**
 * - `applied`: the file is now at its new path.
 * - `rejected`: a safety re-check failed before anything was touched.
 * - `failed`: the change was attempted and did not happen.
 * - `not-attempted`: skipped because an earlier change failed unexpectedly.
 */
export type ApplyStatus = (typeof APPLY_STATUSES)[number];

export const APPLY_FAILURE_REASONS = [
  "source-missing",
  "source-not-file",
  "source-changed",
  "destination-exists",
  "destination-blocked",
  "unsafe-path",
  "conflict",
  "permission-denied",
  "unsupported-filesystem",
  "unexpected",
  "earlier-failure",
] as const;

export type ApplyFailureReason = (typeof APPLY_FAILURE_REASONS)[number];

export type ApplyOperationResult = {
  sourcePath: string;
  suggestedPath: string;
  action: ChangeAction;
  status: ApplyStatus;
  /** Present for every status except `applied`. */
  reason?: ApplyFailureReason;
};

export type ApplyResult = {
  rootPath: string;
  rootName: string;
  requestedCount: number;
  appliedCount: number;
  /** Everything that did not apply: rejected, failed or not attempted. */
  notAppliedCount: number;
  /** One entry per requested change, in the order they were processed. */
  results: ApplyOperationResult[];
  /** Folders TidyMate created, relative to the root. */
  createdFolders: string[];
  appliedAt: string;
};

export type ApplyErrorCode = ScanErrorCode | "INVALID_REQUEST" | "PLAN_NOT_FOUND" | "ROOT_CHANGED" | "BUSY";

export type ApplyFailure = {
  code: ApplyErrorCode;
  message: string;
};

export type ApplyResponse =
  | { ok: true; result: ApplyResult }
  | { ok: false; error: ApplyFailure };
