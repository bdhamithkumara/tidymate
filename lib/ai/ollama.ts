import "server-only";

import { z } from "zod";

import { OLLAMA_GENERATION_OPTIONS, OLLAMA_KEEP_ALIVE, type OllamaConfig } from "./config";
import { AiError } from "./errors";
import { modelPlanJsonSchema, parseModelPlan } from "./plan-schema";
import { buildOrganizationPrompt } from "./prompt";
import type { OrganizationProposal, OrganizationProvider, OrganizationRequest } from "./provider";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type OllamaProviderOptions = OllamaConfig & {
  fetch?: FetchLike;
};

/** One line of Ollama's streamed NDJSON response. */
const chatChunkSchema = z.object({
  message: z.object({ content: z.string() }).optional(),
  done: z.boolean().optional(),
  done_reason: z.string().optional(),
  error: z.string().optional(),
});

/** Far more than any valid plan; stops a runaway answer from growing forever. */
const MAX_CONTENT_CHARS = 200_000;

const errorBodySchema = z.object({ error: z.string() });

/**
 * Talks to a local Ollama server over its HTTP API (`POST /api/chat`).
 * No SDK: one JSON request and a streamed NDJSON response, with structured
 * output enforced by Ollama's `format` option and re-checked with Zod.
 *
 * Streaming matters even though the UI waits for the whole answer: Node's
 * built-in fetch gives up if response headers take longer than 5 minutes,
 * which a non-streaming request to a slow machine easily exceeds.
 */
export function createOllamaProvider({
  baseUrl,
  model,
  timeoutMs,
  fetch: fetchImpl = fetch,
}: OllamaProviderOptions): OrganizationProvider {
  const chatUrl = new URL("api/chat", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();

  return {
    id: "ollama",
    model,
    async suggestOrganization(
      request: OrganizationRequest,
      options: { signal?: AbortSignal } = {},
    ): Promise<OrganizationProposal> {
      const prompt = buildOrganizationPrompt(request);
      const body = JSON.stringify({
        model,
        stream: true,
        format: modelPlanJsonSchema,
        options: OLLAMA_GENERATION_OPTIONS,
        keep_alive: OLLAMA_KEEP_ALIVE,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      });

      const content = await withDeadline(timeoutMs, model, options.signal, async (signal) => {
        let response: Response;
        try {
          response = await fetchImpl(chatUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal,
          });
        } catch (error) {
          if (signal.aborted) throw error;
          throw new AiError("OLLAMA_UNAVAILABLE", {}, { cause: error });
        }

        if (!response.ok) {
          throw await errorFromResponse(response, model);
        }
        if (!response.body) {
          throw new AiError("HTTP_ERROR");
        }

        try {
          return await readChatStream(response.body);
        } catch (error) {
          if (signal.aborted || error instanceof AiError) throw error;
          throw new AiError("HTTP_ERROR", {}, { cause: error });
        }
      });

      return { items: parseModelPlan(content), model };
    },
  };
}

/**
 * Runs `task` with an abort signal that fires on timeout or when the caller
 * cancels, and turns either into the matching `AiError`.
 */
async function withDeadline<T>(
  timeoutMs: number,
  model: string,
  external: AbortSignal | undefined,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (external?.aborted) {
    throw new AiError("CANCELLED");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCancel = () => controller.abort();
  external?.addEventListener("abort", onCancel, { once: true });

  // Settle as soon as the signal fires, even if the task ignores it.
  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => reject(new DOMException("Aborted", "AbortError")),
      { once: true },
    );
  });

  try {
    return await Promise.race([task(controller.signal), aborted]);
  } catch (error) {
    if (error instanceof AiError) throw error;
    if (timedOut) throw new AiError("TIMEOUT", { model, timeoutMs }, { cause: error });
    if (external?.aborted) throw new AiError("CANCELLED", {}, { cause: error });
    throw new AiError("OLLAMA_UNAVAILABLE", {}, { cause: error });
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onCancel);
  }
}

/** Concatenates the streamed message content until Ollama reports `done`. */
async function readChatStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let content = "";

  const handleLine = (line: string): boolean => {
    if (line.trim() === "") return false;
    const chunk = chatChunkSchema.safeParse(JSON.parse(line));
    if (!chunk.success) {
      throw new AiError("HTTP_ERROR", {}, { cause: chunk.error });
    }
    if (chunk.data.error !== undefined) {
      throw new AiError("HTTP_ERROR", {}, { cause: new Error("Ollama stream error") });
    }
    content += chunk.data.message?.content ?? "";
    if (content.length > MAX_CONTENT_CHARS) {
      throw new AiError("INVALID_OUTPUT");
    }
    if (chunk.data.done) {
      if (chunk.data.done_reason === "length") {
        // The answer hit `num_predict` and is almost certainly cut off.
        throw new AiError("INVALID_OUTPUT");
      }
      return true;
    }
    return false;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let newline = buffered.indexOf("\n");
      while (newline !== -1) {
        if (handleLine(buffered.slice(0, newline))) return content;
        buffered = buffered.slice(newline + 1);
        newline = buffered.indexOf("\n");
      }
    }
    if (handleLine(buffered + decoder.decode())) return content;
  } finally {
    reader.releaseLock();
  }

  // The stream ended without Ollama saying it was finished.
  throw new AiError("HTTP_ERROR");
}

async function errorFromResponse(response: Response, model: string): Promise<AiError> {
  let detail = "";
  try {
    const parsed = errorBodySchema.safeParse(await response.json());
    if (parsed.success) detail = parsed.data.error;
  } catch {
    // Body isn't JSON; the status code is enough.
  }

  if (response.status === 404 && /not found/i.test(detail) && /model/i.test(detail)) {
    return new AiError("MODEL_NOT_FOUND", { model });
  }
  return new AiError("HTTP_ERROR", {}, { cause: new Error(`Ollama HTTP ${response.status}`) });
}
