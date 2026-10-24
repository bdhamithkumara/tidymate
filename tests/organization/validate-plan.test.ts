import { describe, expect, it } from "vitest";

import { deriveAction, validatePlan, type ParsedModelItem } from "@/lib/organization/validate-plan";

import { candidate, scannedFile } from "../helpers/organization";

const files = [
  scannedFile("IMG_4821.jpg", { sizeBytes: 2_000_000 }),
  scannedFile("IMG_4822.jpg"),
  scannedFile("invoice_march.pdf"),
  scannedFile("notes.txt"),
  scannedFile("setup.exe"),
  scannedFile("Documents/old-report.pdf"),
  scannedFile("Images/existing.jpg"),
];

function run(items: ParsedModelItem[], consideredFiles = files, allFiles = files) {
  return validatePlan({ items, consideredFiles, allFiles });
}

describe("validatePlan: valid suggestions", () => {
  it("accepts moves, renames and move-and-renames with derived actions", () => {
    const result = run([
      candidate("IMG_4821.jpg", "Images/IMG_4821.jpg"),
      candidate("notes.txt", "meeting-notes.txt", { action: "rename" }),
      candidate("invoice_march.pdf", "Documents/Invoices/Invoice March.pdf", { action: "move_and_rename" }),
    ]);

    expect(result.rejected).toEqual([]);
    expect(result.suggestions).toEqual([
      {
        sourcePath: "invoice_march.pdf",
        suggestedPath: "Documents/Invoices/Invoice March.pdf",
        suggestedName: "Invoice March.pdf",
        action: "move_and_rename",
        reason: "Groups similar files together.",
        source: { sizeBytes: 1024, modifiedAt: "2026-03-14T09:26:53.000Z", kind: "document" },
      },
      expect.objectContaining({ sourcePath: "IMG_4821.jpg", action: "move", source: expect.objectContaining({ sizeBytes: 2_000_000 }) }),
      expect.objectContaining({ sourcePath: "notes.txt", action: "rename", suggestedName: "meeting-notes.txt" }),
    ]);
  });

  it("uses the action implied by the paths, not the model's label", () => {
    const result = run([
      candidate("IMG_4821.jpg", "Images/IMG_4821.jpg", { action: "rename" }),
      candidate("notes.txt", "notes.txt", { action: "move" }),
    ]);

    expect(result.suggestions).toEqual([
      expect.objectContaining({ sourcePath: "IMG_4821.jpg", action: "move" }),
    ]);
    expect(result.keptSources).toEqual(["notes.txt"]);
  });

  it("treats keep suggestions as no change", () => {
    const result = run([candidate("Documents/old-report.pdf", "Documents/old-report.pdf", { action: "keep" })]);
    expect(result.suggestions).toEqual([]);
    expect(result.keptSources).toEqual(["Documents/old-report.pdf"]);
    expect(result.rejected).toEqual([]);
  });

  it("allows moving into a folder that already exists", () => {
    const result = run([candidate("IMG_4822.jpg", "Images/IMG_4822.jpg")]);
    expect(result.suggestions).toHaveLength(1);
  });

  it("allows a case-only rename of the same file", () => {
    const result = run([candidate("notes.txt", "Notes.txt")]);
    expect(result.suggestions).toEqual([expect.objectContaining({ action: "rename" })]);
  });

  it("collapses exact duplicate suggestions", () => {
    const result = run([
      candidate("IMG_4821.jpg", "Images/IMG_4821.jpg"),
      candidate("IMG_4821.jpg", "Images/IMG_4821.jpg"),
    ]);
    expect(result.suggestions).toHaveLength(1);
    expect(result.rejected).toEqual([]);
  });
});

describe("validatePlan: sources", () => {
  it("rejects files that were not scanned (invented files)", () => {
    const result = run([candidate("vacation.jpg", "Images/vacation.jpg")]);
    expect(result.suggestions).toEqual([]);
    expect(result.rejected).toEqual([
      { sourcePath: "vacation.jpg", suggestedPath: "Images/vacation.jpg", reason: "unknown-source" },
    ]);
  });

  it("rejects scanned files that the model was not shown", () => {
    const result = run([candidate("setup.exe", "Installers/setup.exe")], files.slice(0, 2), files);
    expect(result.rejected).toEqual([expect.objectContaining({ reason: "unknown-source" })]);
  });

  it("requires an exact, case-sensitive match", () => {
    const result = run([candidate("img_4821.JPG", "Images/img_4821.JPG")]);
    expect(result.rejected).toEqual([expect.objectContaining({ reason: "unknown-source" })]);
  });

  it.each([
    ["/home/sam/Downloads/IMG_4821.jpg", "absolute-path"],
    ["C:\\Users\\sam\\IMG_4821.jpg", "absolute-path"],
    ["~/IMG_4821.jpg", "absolute-path"],
    ["../IMG_4821.jpg", "path-traversal"],
    ["Images/../../etc/passwd", "path-traversal"],
    ["./IMG_4821.jpg", "invalid-path"],
  ])("rejects source %j as %s", (sourcePath, reason) => {
    const result = run([candidate(sourcePath, "Images/IMG_4821.jpg")]);
    expect(result.rejected).toEqual([expect.objectContaining({ reason })]);
  });
});

describe("validatePlan: destinations", () => {
  it.each([
    ["/Images/IMG_4821.jpg", "absolute-path"],
    ["/tmp/IMG_4821.jpg", "absolute-path"],
    ["C:\\Photos\\IMG_4821.jpg", "absolute-path"],
    ["\\\\nas\\photos\\IMG_4821.jpg", "absolute-path"],
    ["../IMG_4821.jpg", "path-traversal"],
    ["Images/../../IMG_4821.jpg", "path-traversal"],
    ["..\\IMG_4821.jpg", "path-traversal"],
    ["Images/", "invalid-path"],
    [".Trash/IMG_4821.jpg", "invalid-path"],
    ["Images\\IMG_4821.jpg", "invalid-path"],
    ["Images/IMG:4821.jpg", "invalid-path"],
    ["a/b/c/IMG_4821.jpg", "destination-too-deep"],
    ["Images/IMG_4821.png", "extension-changed"],
    ["Images/IMG_4821", "extension-changed"],
    ["Images/IMG_4821.jpg.exe", "extension-changed"],
  ])("rejects destination %j as %s", (suggestedPath, reason) => {
    const result = run([candidate("IMG_4821.jpg", suggestedPath)]);
    expect(result.suggestions).toEqual([]);
    expect(result.rejected).toEqual([
      { sourcePath: "IMG_4821.jpg", suggestedPath, reason },
    ]);
  });

  it("rejects two files moving to the same destination", () => {
    const result = run([
      candidate("IMG_4821.jpg", "Images/photo.jpg"),
      candidate("IMG_4822.jpg", "Images/photo.jpg"),
      candidate("notes.txt", "Documents/notes.txt"),
    ]);
    expect(result.suggestions.map((s) => s.sourcePath)).toEqual(["notes.txt"]);
    expect(result.rejected).toEqual([
      expect.objectContaining({ sourcePath: "IMG_4821.jpg", reason: "duplicate-destination" }),
      expect.objectContaining({ sourcePath: "IMG_4822.jpg", reason: "duplicate-destination" }),
    ]);
  });

  it("treats destinations differing only by case as duplicates", () => {
    const result = run([
      candidate("IMG_4821.jpg", "Images/Photo.jpg"),
      candidate("IMG_4822.jpg", "images/photo.jpg"),
    ]);
    expect(result.suggestions).toEqual([]);
    expect(result.rejected.map((r) => r.reason)).toEqual(["duplicate-destination", "duplicate-destination"]);
  });

  it("rejects conflicting suggestions for the same file", () => {
    const result = run([
      candidate("IMG_4821.jpg", "Images/IMG_4821.jpg"),
      candidate("IMG_4821.jpg", "Photos/IMG_4821.jpg"),
    ]);
    expect(result.suggestions).toEqual([]);
    expect(result.rejected.map((r) => r.reason)).toEqual([
      "conflicting-suggestions",
      "conflicting-suggestions",
    ]);
  });

  it("rejects a keep and a move for the same file as conflicting", () => {
    const result = run([
      candidate("notes.txt", "notes.txt", { action: "keep" }),
      candidate("notes.txt", "Documents/notes.txt"),
    ]);
    expect(result.keptSources).toEqual([]);
    expect(result.rejected.map((r) => r.reason)).toEqual([
      "conflicting-suggestions",
      "conflicting-suggestions",
    ]);
  });

  it("never overwrites an existing file", () => {
    const result = run([candidate("IMG_4822.jpg", "Images/existing.jpg")]);
    expect(result.rejected).toEqual([expect.objectContaining({ reason: "destination-exists" })]);
  });

  it("never takes the path of a file that is itself being moved (no chains or swaps)", () => {
    const result = run([
      candidate("IMG_4821.jpg", "IMG_4822.jpg", { action: "rename" }),
      candidate("IMG_4822.jpg", "Images/IMG_4822.jpg"),
    ]);
    expect(result.suggestions.map((s) => s.sourcePath)).toEqual(["IMG_4822.jpg"]);
    expect(result.rejected).toEqual([
      expect.objectContaining({ sourcePath: "IMG_4821.jpg", reason: "destination-exists" }),
    ]);
  });

  it("detects collisions with existing files case-insensitively", () => {
    const result = run([candidate("IMG_4822.jpg", "images/EXISTING.jpg")]);
    expect(result.rejected).toEqual([expect.objectContaining({ reason: "destination-exists" })]);
  });

  it("rejects a destination that would replace an existing folder", () => {
    const withFolder = [...files, scannedFile("Images.jpg/inner.txt")];
    const result = run([candidate("IMG_4821.jpg", "Images.jpg")], withFolder, withFolder);
    expect(result.rejected).toEqual([expect.objectContaining({ reason: "destination-exists" })]);
  });

  it("rejects a destination inside a path that is an existing file", () => {
    const result = run([candidate("IMG_4822.jpg", "notes.txt/IMG_4822.jpg")]);
    expect(result.rejected).toEqual([expect.objectContaining({ reason: "destination-exists" })]);
  });

  it("checks collisions against every scanned file, not just those shown to the model", () => {
    const result = run([candidate("IMG_4821.jpg", "Documents/old-report.jpg")], files.slice(0, 1), [
      ...files,
      scannedFile("Documents/old-report.jpg"),
    ]);
    expect(result.rejected).toEqual([expect.objectContaining({ reason: "destination-exists" })]);
  });
});

describe("validatePlan: schema-level rejections", () => {
  it("passes through malformed and unsupported items as rejections", () => {
    const result = run([
      { ok: false, reason: "unsupported-action", sourcePath: "IMG_4821.jpg", suggestedPath: null },
      { ok: false, reason: "malformed", sourcePath: null, suggestedPath: null },
      candidate("notes.txt", "Documents/notes.txt"),
    ]);
    expect(result.suggestions).toHaveLength(1);
    expect(result.rejected).toEqual([
      { sourcePath: "IMG_4821.jpg", suggestedPath: null, reason: "unsupported-action" },
      { sourcePath: null, suggestedPath: null, reason: "malformed" },
    ]);
  });
});

describe("deriveAction", () => {
  it.each([
    ["a.txt", "a.txt", "keep"],
    ["a.txt", "b.txt", "rename"],
    ["a.txt", "Docs/a.txt", "move"],
    ["Docs/a.txt", "a.txt", "move"],
    ["a.txt", "Docs/b.txt", "move_and_rename"],
  ])("%s → %s is %s", (source, destination, expected) => {
    expect(deriveAction(source, destination)).toBe(expected);
  });
});
