import { mkdir, realpath } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/suggestions/route";
import { AiError } from "@/lib/ai/errors";
import type { OrganizationProvider } from "@/lib/ai/provider";
import type { SuggestResponse } from "@/types/organization";

import { candidate } from "../helpers/organization";
import { createTempDir, removeTempDir, writeFixture } from "../helpers/temp-dir";

const suggest = vi.hoisted(() => vi.fn<OrganizationProvider["suggestOrganization"]>());

vi.mock("@/lib/ai/get-provider", () => ({
  getOrganizationProvider: (): OrganizationProvider => ({
    id: "mock",
    model: "gemma3:4b",
    suggestOrganization: suggest,
  }),
}));

let workspace: string;
let root: string;

beforeEach(async () => {
  workspace = await realpath(await createTempDir());
  root = path.join(workspace, "Downloads");
  await mkdir(root);
  await writeFixture(root, "IMG_4821.jpg");
  suggest.mockReset();
});

afterEach(async () => {
  await removeTempDir(workspace);
});

function post(
  body: unknown,
  headers: Record<string, string> = {},
  init: { raw?: boolean; signal?: AbortSignal } = {},
): Request {
  return new Request("http://localhost:3000/api/suggestions", {
    method: "POST",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: init.raw ? String(body) : JSON.stringify(body),
    signal: init.signal,
  });
}

async function read(response: Response): Promise<SuggestResponse> {
  return (await response.json()) as SuggestResponse;
}

describe("POST /api/suggestions", () => {
  it("returns validated suggestions for a local folder", async () => {
    suggest.mockResolvedValue({
      model: "gemma3:4b",
      items: [candidate("IMG_4821.jpg", "Images/IMG_4821.jpg")],
    });

    const response = await POST(post({ folderPath: root }));
    const body = await read(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      ok: true,
      plan: {
        rootName: "Downloads",
        suggestions: [{ sourcePath: "IMG_4821.jpg", suggestedPath: "Images/IMG_4821.jpg", action: "move" }],
      },
    });
  });

  it("passes the request's abort signal to the provider", async () => {
    const controller = new AbortController();
    suggest.mockResolvedValue({ model: "gemma3:4b", items: [] });

    await POST(post({ folderPath: root }, {}, { signal: controller.signal }));

    const signal = suggest.mock.calls[0]?.[1]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    controller.abort();
    expect(signal?.aborted).toBe(true);
  });

  describe("rejects requests that aren't local and same-origin", () => {
    it.each([
      ["a LAN host", { host: "192.168.1.20:3000", origin: "http://192.168.1.20:3000" }],
      ["a rebinding domain", { host: "evil.test:3000", origin: "http://evil.test:3000" }],
      ["a cross-site origin", { origin: "http://evil.test" }],
      ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
      ["a form post", { "content-type": "application/x-www-form-urlencoded" }],
      ["a text/plain post", { "content-type": "text/plain" }],
    ])("%s", async (_label, headers) => {
      const response = await POST(post({ folderPath: root }, headers));
      expect(response.status).toBe(403);
      expect(await read(response)).toMatchObject({ ok: false, error: { code: "NOT_LOCAL" } });
      expect(suggest).not.toHaveBeenCalled();
    });
  });

  describe("rejects invalid input", () => {
    it.each([
      ["malformed JSON", "{not json", true],
      ["a missing folder path", {}, false],
      ["a non-string folder path", { folderPath: 42 }, false],
      ["an empty folder path", { folderPath: "  " }, false],
      ["browser-supplied file metadata", { folderPath: "/x", files: [{ relativePath: "a.txt" }] }, false],
      ["an array body", [], false],
    ])("%s", async (_label, body, raw) => {
      const response = await POST(post(body, {}, { raw }));
      expect(response.status).toBe(400);
      expect(await read(response)).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
      expect(suggest).not.toHaveBeenCalled();
    });

    it("an oversized body", async () => {
      const response = await POST(post({ folderPath: `/${"a".repeat(10_000)}` }));
      expect(response.status).toBe(400);
    });

    it("an unsafe folder", async () => {
      const response = await POST(post({ folderPath: "/" }));
      expect(response.status).toBe(400);
      expect(await read(response)).toMatchObject({ ok: false, error: { code: "PROTECTED_PATH", retryable: false } });
    });

    it("a folder that doesn't exist", async () => {
      const response = await POST(post({ folderPath: path.join(workspace, "missing") }));
      expect(response.status).toBe(404);
      expect(await read(response)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    });
  });

  describe("maps AI failures to safe errors", () => {
    it.each([
      ["OLLAMA_UNAVAILABLE", 503],
      ["MODEL_NOT_FOUND", 503],
      ["TIMEOUT", 504],
      ["HTTP_ERROR", 502],
      ["INVALID_JSON", 502],
      ["INVALID_OUTPUT", 502],
      ["CANCELLED", 499],
    ] as const)("%s → %d", async (code, status) => {
      suggest.mockRejectedValue(new AiError(code, { model: "gemma3:4b" }));

      const response = await POST(post({ folderPath: root }));
      const body = await read(response);

      expect(response.status).toBe(status);
      expect(body).toMatchObject({ ok: false, error: { code, retryable: true } });
      if (!body.ok) expect(body.error.message.length).toBeGreaterThan(0);
    });

    it("VALIDATION_FAILED when every suggestion is unsafe", async () => {
      suggest.mockResolvedValue({ model: "gemma3:4b", items: [candidate("IMG_4821.jpg", "/etc/IMG_4821.jpg")] });
      const response = await POST(post({ folderPath: root }));
      expect(response.status).toBe(502);
      expect(await read(response)).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    });

    it("hides unexpected errors behind a generic message", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      suggest.mockRejectedValue(new Error(`boom at ${workspace}/secret.ts:12 with stack`));

      const response = await POST(post({ folderPath: root }));
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(JSON.parse(text)).toMatchObject({ ok: false, error: { code: "UNKNOWN" } });
      expect(text).not.toContain("boom");
      expect(text).not.toContain(workspace.replaceAll("\\", "\\\\"));
      expect(text).not.toContain("secret.ts");
      consoleError.mockRestore();
    });
  });
});
