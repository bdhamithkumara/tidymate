import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/lib/config/env-schema";

const DEFAULTS = {
  OLLAMA_BASE_URL: "http://localhost:11434",
  OLLAMA_MODEL: "gemma3:4b",
  OLLAMA_TIMEOUT_MS: 300_000,
};

describe("parseServerEnv", () => {
  it("falls back to local Ollama defaults", () => {
    expect(parseServerEnv({})).toEqual(DEFAULTS);
  });

  it("treats empty strings as unset", () => {
    expect(
      parseServerEnv({ OLLAMA_BASE_URL: "", OLLAMA_MODEL: "", OLLAMA_TIMEOUT_MS: "" }),
    ).toEqual(DEFAULTS);
  });

  it("accepts custom values", () => {
    expect(
      parseServerEnv({
        OLLAMA_BASE_URL: "http://127.0.0.1:11500",
        OLLAMA_MODEL: "gemma3:12b",
        OLLAMA_TIMEOUT_MS: "900000",
      }),
    ).toEqual({
      OLLAMA_BASE_URL: "http://127.0.0.1:11500",
      OLLAMA_MODEL: "gemma3:12b",
      OLLAMA_TIMEOUT_MS: 900_000,
    });
  });

  it("rejects a malformed base URL", () => {
    expect(() => parseServerEnv({ OLLAMA_BASE_URL: "not a url" })).toThrow();
  });

  it.each(["abc", "-5", "0", "999", "1.5", "99999999"])(
    "rejects an invalid timeout %j",
    (value) => {
      expect(() => parseServerEnv({ OLLAMA_TIMEOUT_MS: value })).toThrow();
    },
  );
});
