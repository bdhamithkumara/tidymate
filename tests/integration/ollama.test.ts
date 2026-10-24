/**
 * Live check against a real local Ollama + Gemma. Excluded from `npm test`;
 * run explicitly with `npm run test:ollama`. Uses a throwaway temp folder.
 */
import { mkdir, readdir, realpath } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getOllamaConfig } from "@/lib/ai/config";
import { createOllamaProvider } from "@/lib/ai/ollama";
import { generateOrganizationPlan } from "@/lib/server/organization/generate-plan";

import { createTempDir, removeTempDir, writeFixture } from "../helpers/temp-dir";

const FIXTURES = [
  "IMG_4821.jpg",
  "IMG_4822.jpg",
  "Screenshot 2024-03-02 at 10.15.22.png",
  "invoice_march_2024.pdf",
  "resume-final-v3.docx",
  "budget.xlsx",
  "setup-installer.exe",
  "holiday-video.mp4",
  "song.mp3",
  "project-backup.zip",
];

let workspace: string;
let root: string;

beforeAll(async () => {
  workspace = await realpath(await createTempDir());
  root = path.join(workspace, "Downloads");
  await mkdir(root);
  for (const name of FIXTURES) {
    await writeFixture(root, name, "placeholder");
  }
});

afterAll(async () => {
  await removeTempDir(workspace);
});

describe("Ollama integration", () => {
  it("generates a validated plan with the configured local model", async () => {
    const config = getOllamaConfig();
    const provider = createOllamaProvider(config);
    const before = await readdir(root);

    const plan = await generateOrganizationPlan(root, { provider });

    console.info(
      `[ollama] ${config.model}: ${plan.suggestions.length} suggestions, ` +
        `${plan.rejected.length} rejected, ${plan.durationMs} ms`,
    );
    for (const s of plan.suggestions) {
      console.info(`  ${s.action}: ${s.sourcePath} → ${s.suggestedPath} (${s.reason})`);
    }
    for (const r of plan.rejected) {
      console.info(`  rejected ${r.reason}: ${r.sourcePath} → ${r.suggestedPath}`);
    }

    const sources = new Set(FIXTURES);
    for (const suggestion of plan.suggestions) {
      expect(sources.has(suggestion.sourcePath)).toBe(true);
      expect(path.isAbsolute(suggestion.suggestedPath)).toBe(false);
      expect(suggestion.suggestedPath.split("/")).not.toContain("..");
    }
    // Suggestions only: the folder is untouched.
    expect(await readdir(root)).toEqual(before);
  });
});
