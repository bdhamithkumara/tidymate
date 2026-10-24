import { describe, expect, it } from "vitest";

import { AiError } from "@/lib/ai/errors";
import {
  MAX_MODEL_SUGGESTIONS,
  modelPlanJsonSchema,
  modelPlanSchema,
  parseModelPlan,
} from "@/lib/ai/plan-schema";

const valid = {
  sourcePath: "IMG_4821.jpg",
  action: "move",
  suggestedPath: "Images/IMG_4821.jpg",
  reason: "Photo that belongs with other images.",
};

function expectAiError(fn: () => unknown, code: AiError["code"]) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).code).toBe(code);
    return;
  }
  throw new Error(`Expected AiError ${code}`);
}

describe("modelPlanSchema", () => {
  it("accepts a valid plan", () => {
    expect(modelPlanSchema.parse({ suggestions: [valid] })).toEqual({ suggestions: [valid] });
  });

  it("accepts an empty plan", () => {
    expect(modelPlanSchema.parse({ suggestions: [] })).toEqual({ suggestions: [] });
  });

  it.each(["keep", "rename", "move", "move_and_rename"])("accepts action %s", (action) => {
    expect(modelPlanSchema.safeParse({ suggestions: [{ ...valid, action }] }).success).toBe(true);
  });

  it.each(["delete", "remove", "overwrite", "execute", "copy", "MOVE", ""])(
    "rejects action %j",
    (action) => {
      expect(modelPlanSchema.safeParse({ suggestions: [{ ...valid, action }] }).success).toBe(false);
    },
  );

  it("rejects extra fields on a suggestion and on the plan", () => {
    expect(modelPlanSchema.safeParse({ suggestions: [{ ...valid, overwrite: true }] }).success).toBe(false);
    expect(modelPlanSchema.safeParse({ suggestions: [], notes: "hi" }).success).toBe(false);
  });

  it("produces a JSON Schema Ollama can use for constrained output", () => {
    const schema = modelPlanJsonSchema as unknown as {
      required: string[];
      additionalProperties: boolean;
      properties: { suggestions: { maxItems: number; items: { properties: { action: { enum: string[] } }; required: string[] } } };
    };
    expect(schema.required).toEqual(["suggestions"]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.suggestions.maxItems).toBe(MAX_MODEL_SUGGESTIONS);
    expect(schema.properties.suggestions.items.properties.action.enum).toEqual([
      "keep",
      "rename",
      "move",
      "move_and_rename",
    ]);
    expect(schema.properties.suggestions.items.required).toEqual([
      "sourcePath",
      "action",
      "suggestedPath",
      "reason",
    ]);
  });
});

describe("parseModelPlan", () => {
  it("parses a valid response", () => {
    expect(parseModelPlan(JSON.stringify({ suggestions: [valid] }))).toEqual([
      { ok: true, value: valid },
    ]);
  });

  it("trims reasons", () => {
    const [item] = parseModelPlan(JSON.stringify({ suggestions: [{ ...valid, reason: "  Photo.  " }] }));
    expect(item).toMatchObject({ ok: true, value: { reason: "Photo." } });
  });

  it("tolerates a Markdown code fence", () => {
    const fenced = "```json\n" + JSON.stringify({ suggestions: [valid] }) + "\n```";
    expect(parseModelPlan(fenced)).toHaveLength(1);
  });

  it.each([
    ["truncated", '{"suggestions":[{"sourcePath":"a.txt"'],
    ["prose", "Sure! Here is your plan."],
    ["empty", ""],
  ])("rejects malformed JSON (%s)", (_label, content) => {
    expectAiError(() => parseModelPlan(content), "INVALID_JSON");
  });

  it.each([
    ["an array", "[]"],
    ["a string", '"suggestions"'],
    ["missing suggestions", "{}"],
    ["suggestions not an array", '{"suggestions":{}}'],
    ["extra top-level fields", '{"suggestions":[],"thoughts":"..."}'],
  ])("rejects the wrong overall shape (%s)", (_label, content) => {
    expectAiError(() => parseModelPlan(content), "INVALID_OUTPUT");
  });

  it("rejects an oversized answer", () => {
    const suggestions = Array.from({ length: MAX_MODEL_SUGGESTIONS + 1 }, () => valid);
    expectAiError(() => parseModelPlan(JSON.stringify({ suggestions })), "INVALID_OUTPUT");
  });

  it("keeps malformed suggestions as rejections instead of failing the plan", () => {
    const items = parseModelPlan(
      JSON.stringify({
        suggestions: [
          valid,
          { sourcePath: "a.txt", action: "move" },
          { ...valid, reason: "" },
          { ...valid, extra: 1 },
          "not an object",
          { ...valid, sourcePath: 42 },
        ],
      }),
    );

    expect(items[0]).toEqual({ ok: true, value: valid });
    expect(items.slice(1)).toEqual([
      { ok: false, reason: "malformed", sourcePath: "a.txt", suggestedPath: null },
      { ok: false, reason: "malformed", sourcePath: valid.sourcePath, suggestedPath: valid.suggestedPath },
      { ok: false, reason: "malformed", sourcePath: valid.sourcePath, suggestedPath: valid.suggestedPath },
      { ok: false, reason: "malformed", sourcePath: null, suggestedPath: null },
      { ok: false, reason: "malformed", sourcePath: null, suggestedPath: valid.suggestedPath },
    ]);
  });

  it("labels destructive actions as unsupported", () => {
    const [item] = parseModelPlan(
      JSON.stringify({ suggestions: [{ ...valid, action: "delete" }] }),
    );
    expect(item).toEqual({
      ok: false,
      reason: "unsupported-action",
      sourcePath: valid.sourcePath,
      suggestedPath: valid.suggestedPath,
    });
  });

  it("limits how much model text is echoed back", () => {
    const [item] = parseModelPlan(
      JSON.stringify({ suggestions: [{ ...valid, action: "delete", sourcePath: "x".repeat(900) }] }),
    );
    expect(item?.ok).toBe(false);
    if (item && !item.ok) expect(item.sourcePath).toHaveLength(200);
  });
});
