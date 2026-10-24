import "server-only";

import type { ParsedModelItem } from "@/lib/organization/validate-plan";
import type { FileKind } from "@/types/files";

/**
 * The only file information an AI provider ever receives. No absolute paths,
 * no contents, no hashes. Sizes and dates are pre-formatted to save tokens.
 */
export type AiFileMetadata = {
  /** Path relative to the scanned folder, including name and extension. */
  path: string;
  kind: FileKind;
  /** Human-readable, e.g. `2.1 MB`. */
  size: string;
  /** Date only, e.g. `2024-03-02`. */
  modified: string;
};

export type OrganizationRequest = {
  /** Base name of the scanned folder, e.g. `Downloads`. */
  folderName: string;
  files: AiFileMetadata[];
};

export type OrganizationProposal = {
  /** Schema-checked items; still untrusted until validated against the scan. */
  items: ParsedModelItem[];
  model: string;
};

/**
 * Something that can propose an organization plan. The rest of the app
 * depends on this interface, never on a specific runtime such as Ollama.
 *
 * Implementations must throw `AiError` for expected failures and honour
 * `signal` for cancellation. They never touch the filesystem.
 */
export interface OrganizationProvider {
  readonly id: string;
  readonly model: string;
  suggestOrganization(
    request: OrganizationRequest,
    options?: { signal?: AbortSignal },
  ): Promise<OrganizationProposal>;
}
