import type { ChangeAction, RejectionReason } from "@/types/organization";

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
