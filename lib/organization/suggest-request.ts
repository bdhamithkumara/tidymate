import { z } from "zod";

import { scanRequestSchema } from "@/lib/files/scan-request";

/**
 * The browser sends only which folder to plan for. File metadata is
 * deliberately not part of the request: the server re-scans the folder itself
 * and never trusts a file list supplied by the client.
 */
export const suggestRequestSchema = z.strictObject({
  folderPath: scanRequestSchema.shape.folderPath,
});

export type SuggestRequest = z.infer<typeof suggestRequestSchema>;

export const MAX_SUGGEST_REQUEST_BYTES = 8 * 1024;
