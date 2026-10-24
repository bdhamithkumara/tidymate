import { afterEach, describe, expect, it, vi } from "vitest";

import { AiError } from "@/lib/ai/errors";
import { createOllamaProvider } from "@/lib/ai/ollama";
import type { OrganizationRequest } from "@/lib/ai/provider";

const request: OrganizationRequest = {
  folderName: "Downloads",
  files: [{ path: "IMG_4821.jpg", kind: "image", size: "2 MB", modified: "2024-03-02" }],
};

const plan = {
  suggestions: [
    {
      sourcePath: "IMG_4821.jpg",
      action: "move",
      suggestedPath: "Images/IMG_4821.jpg",
      reason: "Photo.",
    },
  ],
};

type FetchMock = ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>;

/** A streamed NDJSON response like Ollama's, splitting content into chunks. */
function streamResponse(content: string, { doneReason = "stop", chunkSize = 7 } = {}): Response {
  const lines: string[] = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    lines.push(JSON.stringify({ message: { role: "assistant", content: content.slice(i, i + chunkSize) }, done: false }));
  }
  lines.push(JSON.stringify({ message: { role: "assistant", content: "" }, done: true, done_reason: doneReason }));
  return rawStream(lines.map((line) => `${line}\n`));
}

/** Streams the given text pieces verbatim, so lines can be split mid-way. */
function rawStream(pieces: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
}

/** A fetch that never answers, but rejects like real fetch when aborted. */
function hangingFetch(): FetchMock {
  return vi.fn((_url: string, init: RequestInit) =>
    new Promise<Response>((_, reject) => {
      init.signal?.addEventListener("abort", () =>
        reject(new DOMException("This operation was aborted", "AbortError")),
      );
    }),
  );
}

function provider(fetch: FetchMock, timeoutMs = 300_000) {
  return createOllamaProvider({
    baseUrl: "http://localhost:11434",
    model: "gemma3:4b",
    timeoutMs,
    fetch,
  });
}

async function expectAiError(promise: Promise<unknown>, code: AiError["code"]) {
  const error = await promise.then(
    () => {
      throw new Error(`Expected AiError ${code}`);
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AiError);
  expect((error as AiError).code).toBe(code);
  return error as AiError;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Ollama provider", () => {
  it("sends a compact streamed chat request and parses the plan", async () => {
    const fetch: FetchMock = vi.fn(async () => streamResponse(JSON.stringify(plan)));

    const result = await provider(fetch).suggestOrganization(request);

    expect(result).toEqual({
      model: "gemma3:4b",
      items: [{ ok: true, value: plan.suggestions[0] }],
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "gemma3:4b",
      stream: true,
      keep_alive: "15m",
      options: { temperature: 0.2, num_ctx: 8192 },
      format: { type: "object", required: ["suggestions"] },
    });
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
    expect(body.messages[1].content).toContain('["IMG_4821.jpg","image","2 MB","2024-03-02"]');
  });

  it("respects a base URL with a path prefix", async () => {
    const fetch: FetchMock = vi.fn(async () => streamResponse(JSON.stringify(plan)));
    await createOllamaProvider({
      baseUrl: "http://127.0.0.1:8080/ollama",
      model: "gemma3:4b",
      timeoutMs: 1000,
      fetch,
    }).suggestOrganization(request);
    expect(fetch.mock.calls[0]![0]).toBe("http://127.0.0.1:8080/ollama/api/chat");
  });

  it("reassembles NDJSON lines split across network chunks", async () => {
    const content = JSON.stringify(plan);
    const line1 = JSON.stringify({ message: { content }, done: false });
    const line2 = JSON.stringify({ done: true, done_reason: "stop" });
    const fetch: FetchMock = vi.fn(async () =>
      rawStream([line1.slice(0, 10), line1.slice(10) + "\n" + line2.slice(0, 5), line2.slice(5)]),
    );

    const result = await provider(fetch).suggestOrganization(request);
    expect(result.items).toHaveLength(1);
  });

  it("reports Ollama being unavailable", async () => {
    const refused = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:11434"), { code: "ECONNREFUSED" }),
    });
    const fetch: FetchMock = vi.fn(async () => {
      throw refused;
    });

    const error = await expectAiError(provider(fetch).suggestOrganization(request), "OLLAMA_UNAVAILABLE");
    expect(error.message).not.toContain("ECONNREFUSED");
    expect(error.message).not.toContain("11434");
  });

  it("reports a missing model with install instructions", async () => {
    const fetch: FetchMock = vi.fn(async () =>
      Response.json({ error: "model 'gemma3:4b' not found" }, { status: 404 }),
    );

    const error = await expectAiError(provider(fetch).suggestOrganization(request), "MODEL_NOT_FOUND");
    expect(error.message).toContain('ollama pull gemma3:4b');
  });

  it("maps other HTTP errors without exposing the response", async () => {
    const fetch: FetchMock = vi.fn(async () =>
      Response.json({ error: "CUDA error: out of memory at /build/llama.cpp:1234" }, { status: 500 }),
    );

    const error = await expectAiError(provider(fetch).suggestOrganization(request), "HTTP_ERROR");
    expect(error.message).not.toMatch(/CUDA|llama\.cpp|500/);
  });

  it("treats a 404 that isn't about the model as an HTTP error", async () => {
    const fetch: FetchMock = vi.fn(async () => new Response("404 page not found", { status: 404 }));
    await expectAiError(provider(fetch).suggestOrganization(request), "HTTP_ERROR");
  });

  it("times out", async () => {
    vi.useFakeTimers();
    const pending = provider(hangingFetch(), 120_000).suggestOrganization(request);
    const assertion = expectAiError(pending, "TIMEOUT");

    await vi.advanceTimersByTimeAsync(120_000);

    const error = await assertion;
    expect(error.message).toContain("2 minutes");
    expect(error.message).toContain("OLLAMA_TIMEOUT_MS");
  });

  it("times out while the answer is still streaming", async () => {
    vi.useFakeTimers();
    const fetch: FetchMock = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`${JSON.stringify({ message: { content: "{" }, done: false })}\n`));
          // ...and then nothing more.
        },
      });
      return new Response(body);
    });

    const assertion = expectAiError(provider(fetch, 5_000).suggestOrganization(request), "TIMEOUT");
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it("does not time out a request that finishes in time", async () => {
    vi.useFakeTimers();
    const fetch: FetchMock = vi.fn(async () => streamResponse(JSON.stringify(plan)));
    await expect(provider(fetch, 1_000).suggestOrganization(request)).resolves.toBeDefined();
    await vi.advanceTimersByTimeAsync(5_000);
  });

  it("rejects invalid JSON from the model", async () => {
    const fetch: FetchMock = vi.fn(async () => streamResponse("Here are some ideas: move photos"));
    await expectAiError(provider(fetch).suggestOrganization(request), "INVALID_JSON");
  });

  it("rejects model output with the wrong structure", async () => {
    const fetch: FetchMock = vi.fn(async () => streamResponse(JSON.stringify({ plan: [] })));
    await expectAiError(provider(fetch).suggestOrganization(request), "INVALID_OUTPUT");
  });

  it("rejects an answer cut off by the token limit", async () => {
    const fetch: FetchMock = vi.fn(async () =>
      streamResponse('{"suggestions":[{"sourcePath":"IMG', { doneReason: "length" }),
    );
    await expectAiError(provider(fetch).suggestOrganization(request), "INVALID_OUTPUT");
  });

  it("rejects a stream that ends before Ollama says it is done", async () => {
    const fetch: FetchMock = vi.fn(async () =>
      rawStream([`${JSON.stringify({ message: { content: "{}" }, done: false })}\n`]),
    );
    await expectAiError(provider(fetch).suggestOrganization(request), "HTTP_ERROR");
  });

  it("maps an error reported mid-stream", async () => {
    const fetch: FetchMock = vi.fn(async () =>
      rawStream([`${JSON.stringify({ error: "model runner crashed at /usr/lib/ollama" })}\n`]),
    );
    const error = await expectAiError(provider(fetch).suggestOrganization(request), "HTTP_ERROR");
    expect(error.message).not.toContain("/usr/lib");
  });

  it("maps a garbled stream to an HTTP error", async () => {
    const fetch: FetchMock = vi.fn(async () => rawStream(["<html>proxy error</html>\n"]));
    await expectAiError(provider(fetch).suggestOrganization(request), "HTTP_ERROR");
  });

  it("is cancelled before sending when the signal is already aborted", async () => {
    const fetch: FetchMock = vi.fn(async () => streamResponse(JSON.stringify(plan)));
    const controller = new AbortController();
    controller.abort();

    await expectAiError(
      provider(fetch).suggestOrganization(request, { signal: controller.signal }),
      "CANCELLED",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is cancelled mid-request and aborts the HTTP call", async () => {
    const fetch = hangingFetch();
    const controller = new AbortController();
    const pending = provider(fetch).suggestOrganization(request, { signal: controller.signal });
    const assertion = expectAiError(pending, "CANCELLED");

    await Promise.resolve();
    controller.abort();

    await assertion;
    expect(fetch.mock.calls[0]![1].signal?.aborted).toBe(true);
  });
});
