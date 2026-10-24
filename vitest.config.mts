import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

const sharedResolve = {
  tsconfigPaths: true,
  alias: {
    "server-only": fileURLToPath(
      new URL("./tests/stubs/server-only.ts", import.meta.url),
    ),
  },
};

export default defineConfig({
  resolve: sharedResolve,
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Live Ollama tests are opt-in: `npm run test:ollama`.
    exclude: [...configDefaults.exclude, "tests/integration/**"],
  },
});
