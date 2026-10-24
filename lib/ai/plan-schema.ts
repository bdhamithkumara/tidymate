import "server-only";

import { z } from "zod";

import {
  MAX_FILES_FOR_SUGGESTIONS,
  MAX_REASON_LENGTH,
  MAX_RELATIVE_PATH_LENGTH,
} from "@/lib/organization/limits";
import type { ParsedModelItem } from "@/lib/organization/validate-plan";
import { SUGGESTION_ACTIONS } from "@/types/organization";

import { AiError } from "./errors";

/** Generous headroom over one suggestion per file, to tolerate repeats. */
export const MAX_MODEL_SUGGESTIONS = MAX_FILES_FOR_SUGGESTIONS * 2;

export const modelSuggestionSchema = z.strictObject({
  sourcePath: z.string().max(MAX_RELATIVE_PATH_LENGTH),
  action: z.enum(SUGGESTION_ACTIONS),
  suggestedPath: z.string().max(MAX_RELATIVE_PATH_LENGTH),
  reason: z.string().trim().min(1).max(MAX_REASON_LENGTH),
});

/** The exact JSON structure the model is asked to return. */
export const modelPlanSchema = z.strictObject({
  suggestions: z.array(modelSuggestionSchema).max(MAX_MODEL_SUGGESTIONS),
});

export type ModelPlan = z.infer<typeof modelPlanSchema>;

/** JSON Schema handed to Ollama's `format` option for constrained decoding. */
export const modelPlanJsonSchema = z.toJSONSchema(modelPlanSchema);

const envelopeSchema = z.strictObject({
  suggestions: z.array(z.unknown()).max(MAX_MODEL_SUGGESTIONS),
});

const ECHO_LIMIT = 200;

/**
 * Parses the model's raw text. The overall shape must be right, otherwise the
 * whole answer is rejected; individual malformed suggestions are kept as
 * rejections so the user can see that something was discarded.
 */
export function parseModelPlan(content: string): ParsedModelItem[] {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(content));
  } catch (error) {
    throw new AiError("INVALID_JSON", {}, { cause: error });
  }

  const envelope = envelopeSchema.safeParse(json);
  if (!envelope.success) {
    throw new AiError("INVALID_OUTPUT", {}, { cause: envelope.error });
  }

  return envelope.data.suggestions.map((raw): ParsedModelItem => {
    const parsed = modelSuggestionSchema.safeParse(raw);
    if (parsed.success) {
      return { ok: true, value: parsed.data };
    }
    return {
      ok: false,
      reason: hasUnsupportedAction(raw) ? "unsupported-action" : "malformed",
      sourcePath: echoString(raw, "sourcePath"),
      suggestedPath: echoString(raw, "suggestedPath"),
    };
  });
}

/** Tolerates a Markdown code fence around otherwise valid JSON. */
function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? (fenced[1] ?? "") : trimmed;
}

function hasUnsupportedAction(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null || !("action" in raw)) {
    return false;
  }
  const { action } = raw as { action: unknown };
  return !(SUGGESTION_ACTIONS as readonly unknown[]).includes(action);
}

function echoString(raw: unknown, key: string): string | null {
  if (typeof raw !== "object" || raw === null || !(key in raw)) {
    return null;
  }
  const value = (raw as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim().slice(0, ECHO_LIMIT) : null;
}
