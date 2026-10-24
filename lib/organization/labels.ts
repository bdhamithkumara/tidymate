import type {
  ApplyFailureReason,
  ApplyStatus,
  ChangeAction,
  RejectionReason,
} from "@/types/organization";

export const ACTION_LABELS: Record<ChangeAction, string> = {
  rename: "Rename",
  move: "Move",
  move_and_rename: "Move & rename",
};

export const REJECTION_LABELS: Record<RejectionReason, string> = {
  malformed: "Incomplete suggestion",
  "unsupported-action": "Action not allowed",
  "unknown-source": "File isn't in this folder",
  "absolute-path": "Points outside the folder",
  "path-traversal": "Points outside the folder",
  "invalid-path": "Invalid file or folder name",
  "destination-too-deep": "Too many nested folders",
  "extension-changed": "Would change the file type",
  "conflicting-suggestions": "Conflicting suggestions for one file",
  "duplicate-destination": "Two files would share a name",
  "destination-exists": "Would replace an existing item",
};

export const APPLY_STATUS_LABELS: Record<ApplyStatus, string> = {
  applied: "Done",
  rejected: "Skipped",
  failed: "Failed",
  "not-attempted": "Not attempted",
};

export const APPLY_FAILURE_LABELS: Record<ApplyFailureReason, string> = {
  "source-missing": "The file is no longer there.",
  "source-not-file": "The file was replaced by a folder or a link.",
  "source-changed": "The file changed after the suggestion was made.",
  "destination-exists": "Something already exists at the new location.",
  "destination-blocked": "A file or link is in the way of the new folder.",
  "unsafe-path": "The change didn't pass TidyMate's path safety checks.",
  conflict: "It conflicts with another selected change.",
  "permission-denied": "TidyMate isn't allowed to change this file.",
  "unsupported-filesystem": "This drive doesn't support safe moves.",
  unexpected: "Something unexpected happened, so TidyMate stopped to be safe.",
  "earlier-failure": "Skipped because an earlier change failed unexpectedly.",
};
