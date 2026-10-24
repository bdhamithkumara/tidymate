import "server-only";

import { getOllamaConfig } from "./config";
import { createOllamaProvider } from "./ollama";
import type { OrganizationProvider } from "./provider";

/** The provider used by the app. Swap the implementation here, nowhere else. */
export function getOrganizationProvider(): OrganizationProvider {
  return createOllamaProvider(getOllamaConfig());
}
