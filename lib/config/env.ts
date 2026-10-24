import "server-only";

import { parseServerEnv, type ServerEnv } from "./env-schema";

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

export type { ServerEnv };
