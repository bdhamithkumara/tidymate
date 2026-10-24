import { z } from "zod";

import { MAX_FILES_FOR_SUGGESTIONS, MAX_RELATIVE_PATH_LENGTH } from "./limits";

/**
 * The browser names a stored plan and which of its suggestions to apply, by
 * source path. It cannot send destinations, metadata, actions or a folder:
 * those are read back from the server's copy of the plan.
 */
export const applyRequestSchema = z.strictObject({
  planId: z.uuid(),
  sourcePaths: z
    .array(z.string().min(1).max(MAX_RELATIVE_PATH_LENGTH))
    .min(1)
    .max(MAX_FILES_FOR_SUGGESTIONS)
    .refine((paths) => new Set(paths).size === paths.length, "Duplicate selection"),
});

export type ApplyRequest = z.infer<typeof applyRequestSchema>;

export const MAX_APPLY_REQUEST_BYTES = 64 * 1024;
