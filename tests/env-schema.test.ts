import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/lib/config/env-schema";

describe("parseServerEnv", () => {
  it("falls back to local Ollama defaults", () => {
    expect(parseServerEnv({})).toEqual({
      OLLAMA_BASE_URL: "http://localhost:11434",
      OLLAMA_MODEL: "gemma3:4b",
    });
  });

  it("treats empty strings as unset", () => {
    expect(parseServerEnv({ OLLAMA_BASE_URL: "", OLLAMA_MODEL: "" })).toEqual({
      OLLAMA_BASE_URL: "http://localhost:11434",
      OLLAMA_MODEL: "gemma3:4b",
    });
  });

  it("accepts custom values", () => {
    expect(
      parseServerEnv({
        OLLAMA_BASE_URL: "http://127.0.0.1:11500",
        OLLAMA_MODEL: "gemma3:12b",
      }),
    ).toEqual({
      OLLAMA_BASE_URL: "http://127.0.0.1:11500",
      OLLAMA_MODEL: "gemma3:12b",
    });
  });

  it("rejects a malformed base URL", () => {
    expect(() => parseServerEnv({ OLLAMA_BASE_URL: "not a url" })).toThrow();
  });
});
