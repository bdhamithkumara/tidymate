import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Optional tests against a real local Ollama server. Not part of `npm test`;
 * run with `npm run test:ollama` when Ollama and the model are installed.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 1_800_000,
  },
});
