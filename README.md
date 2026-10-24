# TidyMate

> Let local AI clean up the files you keep ignoring.

TidyMate uses local AI to suggest how to organize messy folders. You review the changes before anything happens.

TidyMate is a local-first tool for tidying folders like Downloads, Documents, and Desktop. It runs an open-weight model (Gemma 3 4B) through [Ollama](https://ollama.com) on your own machine. No cloud AI APIs, no accounts, no database.

Built for the Hacktoberfest Open-Source AI Challenge, Week 3: "Slow and Steady".

## Status

| Stage | State |
| --- | --- |
| Read-only folder scanner | ✅ Built |
| AI suggestions (Gemma 3 4B via Ollama) | ✅ Built |
| Review, select, confirm, and apply | ✅ Built (move/rename only, no undo) |

The full loop works: scan a folder, ask local Gemma for suggestions, pick the ones you want, confirm, and TidyMate moves or renames those files after re-checking every one. It never deletes or overwrites anything.

## Safety model

The model never touches your files. It only proposes a plan.

```
Folder
  → File scanner (server-side)
  → Safe file metadata
  → Gemma 3 4B via Ollama
  → Structured organization plan
  → Validation (Zod)
  → Human review
  → Explicit approval
  → Apply filesystem changes (server-side)
```

- Filesystem access lives only in server-side modules guarded by `import "server-only"`. Client components never get arbitrary filesystem access.
- Model output is treated as untrusted input and validated before it is shown, and again before it is applied.
- Nothing is renamed or moved without the user selecting it and confirming. Nothing is ever deleted or overwritten.

## Choosing a folder: why you paste a path

Browsers deliberately do not tell web pages where a folder lives on disk:

- `<input type="file" webkitdirectory>` gives the page a `File` object for every file in the folder, with relative names but no real path. Scanning on the server from that would mean uploading the files, just to look at names and sizes.
- The File System Access API (`showDirectoryPicker`) returns an opaque handle, not a path, works only in Chromium browsers, and would put file access in client-side code instead of the server.

Neither gives the server a path it can scan, and both push filesystem work into the browser. So TidyMate asks you to paste the folder's full path (e.g. `/Users/you/Downloads` or `C:\Users\you\Downloads`). The server (your own machine) scans it with Node's filesystem APIs. The page includes tips for copying a path on macOS, Windows, and Linux, and surrounding quotes from Windows "Copy as path" are stripped automatically.

Typing a path is a deliberate act, and the server treats it as untrusted input (see below). A native folder dialog can come later with a desktop shell; Electron/Tauri are intentionally out of scope for now.

### Local-only

The scanner can read any folder your user account can, so it must only be reachable from your machine:

1. `npm run dev` and `npm run start` bind to `127.0.0.1`, not Next.js's default `0.0.0.0`, so other devices on your network cannot connect.
2. The scan action rejects any request whose `Host` (or `X-Forwarded-Host`) is not `localhost`, `127.0.0.1`, or `[::1]`. This blocks requests through a LAN address, a reverse proxy, or a DNS-rebinding domain.
3. Next.js's built-in Server Action CSRF check rejects requests whose `Origin` doesn't match the `Host`. The suggestions route handler, which has no built-in check, rejects any request that isn't same-origin JSON (foreign `Origin`, cross-site `Sec-Fetch-Site`, or a form/text content type a cross-site page could send without a CORS preflight).

Do not deploy TidyMate to a public server.

## The scanner

`scanDirectory()` in `lib/server/files/scanner.ts` is strictly read-only. It lists directories and calls `lstat`; it never opens, hashes, executes, moves, renames, or uploads files.

For each file it returns only:

| Field | Example |
| --- | --- |
| `name` | `Invoice March.pdf` |
| `extension` | `pdf` (lowercase; `tar.gz` kept whole; empty for none) |
| `relativePath` | `receipts/Invoice March.pdf` (always `/`-separated, relative to the chosen folder) |
| `sizeBytes` | `48213` |
| `modifiedAt` | `2026-03-14T09:26:53.000Z` |
| `kind` | `document`, `image`, `archive`, … (from the extension) |

Absolute paths of individual files are never included, so the same data can later be sent to the model without exposing your directory layout.

**Safety rules**

- **Input validation.** The path must be absolute, at most 4096 characters, and free of NUL bytes. It is normalized and then resolved with `realpath` before use.
- **Protected locations.** TidyMate refuses filesystem/drive roots, your home folder itself (subfolders like `~/Downloads` are fine), and system folders (`/etc`, `/usr`, `/System`, `C:\Windows`, `C:\Program Files`, …). This check runs before touching the disk and again after resolving symlinks.
- **No symlink following.** Links inside the folder are skipped, never followed, whether they point inside or outside it. Before reading each subfolder, the scanner re-checks that its real path is still inside the root, guarding against a folder being swapped for a link mid-scan. If the chosen folder itself is a link, its real target is scanned (and checked against the protected list).
- **Special entries.** Sockets, FIFOs, and devices are skipped without being opened.
- **Resilience.** An unreadable file or subfolder is recorded as skipped and the scan continues. Only an unreadable root fails the scan.
- **Hidden items.** Dotfiles and dot-folders (`.git`, `.DS_Store`) are skipped by default.
- **Limits.** At most 2,000 files and 6 levels deep. Traversal is breadth-first, so shallow files are kept when the limit is hit, and the result is marked as truncated.
- **Safe errors.** Failures map to a fixed set of codes with friendly messages. Raw OS errors are never sent to the browser.

## AI suggestions

After a scan, **Suggest organization** asks Gemma 3 4B, running locally in Ollama, for a plan. The model is treated as an untrusted suggestion generator: it never touches files, and every suggestion is checked by deterministic code before you see it.

```
Browser ──{ folderPath }──▶ POST /api/suggestions  (local-only, same-origin JSON)
                              │
                              ├─ re-scan the folder on the server  (browser metadata is never trusted)
                              ├─ pick up to 30 files, top-level first
                              ├─ compact metadata ─▶ OrganizationProvider ─▶ Ollama /api/chat (gemma3:4b)
                              ├─ Zod: parse the model's JSON
                              ├─ validatePlan(): deterministic safety checks against the fresh scan
                              └─ validated suggestions ─▶ Browser (review only, nothing applied)
```

### What the model sees

Only, per file: its relative path (which includes the name and extension), kind, human-readable size, and modified date. Plus the scanned folder's base name (e.g. `Downloads`). Never absolute paths, file contents, hashes, or anything else. Files are sent as compact JSON rows (`["IMG_4821.jpg","image","2.1 MB","2024-03-02"]`) to keep prompts small for low-end hardware.

The prompt (`lib/ai/prompt.ts`) tells Gemma it is writing a **plan**, not acting; to use only the listed files; not to guess contents or speculate about sensitive matters; to keep extensions; to be conservative with a few simple folders; to never suggest deleting, overwriting, or running anything; and to treat file names as data, not instructions.

### Plan schema

Gemma must return exactly this structure (enforced with Ollama's `format` JSON Schema, generated from Zod, and re-checked with Zod):

```json
{
  "suggestions": [
    {
      "sourcePath": "IMG_4821.jpg",
      "action": "move",
      "suggestedPath": "Images/IMG_4821.jpg",
      "reason": "Photo that belongs with other images."
    }
  ]
}
```

- `action` is one of `keep`, `rename`, `move`, `move_and_rename`. Anything else (e.g. `delete`) is rejected.
- `suggestedPath` is the full new relative path. There is no separate `suggestedName` from the model: a second field could contradict the path, so the name is derived from it.
- The displayed action is **derived from the two paths**, not taken from the model, so the label always matches the actual change.
- Unknown fields are rejected. Malformed suggestions are dropped individually; a wrongly shaped answer is rejected as a whole.

Validated suggestions also carry the source file's size and modified time from the scan, so a later step can confirm a file hasn't changed before anything is applied.

### Deterministic validation (`lib/organization/validate-plan.ts`)

A suggestion is shown only if **all** of these hold:

1. Its source exactly matches a file from the fresh server-side scan that was shown to the model. Invented or unseen files are rejected.
2. Source and destination are relative: no leading `/` or `\`, no drive letter, no UNC path, no `~`.
3. No `..` segment (checked for both `/` and `\`), no `.` or empty segments, no control characters.
4. Destination names are portable: no hidden (`.`-prefixed) names, no characters invalid on Windows, no reserved names like `CON`, no trailing dots or spaces.
5. At most two folder levels deep.
6. The file extension is unchanged, so nothing can be disguised as another file type.
7. One suggestion per file. Conflicting suggestions for the same file are all rejected.
8. No two files may share a destination (compared case-insensitively and Unicode-normalized).
9. A destination may not be an existing file or folder, or sit inside a path that is a file. This rules out overwrites, chains, and swaps.

Rejected suggestions are listed (collapsed) in the review panel with the reason. If Gemma proposed changes but none survive, the request fails with a "didn't pass safety checks" error instead of showing an empty plan.

### Errors

Failures map to fixed, friendly messages. Stack traces, raw Ollama responses, and filesystem paths never reach the browser: Ollama not running, model not installed (with the `ollama pull` command), timeout, Ollama HTTP error, unreadable JSON, wrong structure, failed validation, cancelled. TidyMate never downloads a model by itself.

### Performance on modest hardware

Gemma 3 4B on a CPU-only machine can be slow. In testing on a laptop with a 2 GB GPU (model ~97% on CPU), it produced ~2–3 tokens/s and took about 4 minutes for 10 files, plus up to 2 minutes to load the model the first time. To cope:

- The request to Ollama is **streamed**. Besides enabling cancellation, this avoids Node's built-in `fetch` giving up when response headers take longer than 5 minutes, which a non-streaming request to a slow machine hits.
- At most 30 files are sent per request, the prompt is compact, and answers are capped.
- The model is kept loaded for 15 minutes after a request (`keep_alive`), so a retry doesn't pay the load cost again.
- `OLLAMA_TIMEOUT_MS` (default 5 minutes) is configurable. On slow machines, set it to `900000` (15 minutes) or more.
- The loading state shows elapsed time and a **Cancel** button. Cancelling aborts the request to Ollama.

## Reviewing and applying changes

Gemma suggests. You select. The server re-checks. Only then does the filesystem change.

1. Each suggestion in the review list has a checkbox; **Select all** / **Deselect all** and a live count ("3 of 10 selected: 2 files moved, 1 file renamed") are provided. Nothing is selected by default.
2. **Apply selected changes** opens a confirmation: how many files, that they'll be moved or renamed, that nothing will be deleted, and that there is no undo.
3. After applying, a result list shows every requested change: done (with its new path), skipped, failed, or not attempted, with a plain-language reason. Raw filesystem errors are never shown.

### What the browser can and can't send

When suggestions are generated, the server keeps the validated plan in memory under a random `planId` (single use, expires after an hour or when TidyMate restarts). To apply, the browser sends only:

```json
{ "planId": "…", "sourcePaths": ["IMG_4821.jpg", "notes.txt"] }
```

No destinations, no actions, no folder, no file metadata. Those come from the server's own copy of the plan, so the browser can only choose among suggestions the server produced. Unknown fields (e.g. `action: "delete"`) are rejected by a strict Zod schema. A plan is removed when an apply starts, so it can't be replayed.

### Re-checks before anything changes (`lib/server/organization/apply-plan.ts`)

1. **Fresh scan** of the folder. Its real path must still equal the plan's. A folder swapped for a symlink, deleted, or now protected aborts everything.
2. **Re-validation** of the selected suggestions against that fresh scan with the same rules used at suggestion time (relative paths only, no `..`, portable names, unchanged extension, no duplicate or conflicting destinations, no chains or swaps, no existing destination).
3. **Unchanged source**: size and modified time must match the plan exactly, so you only ever apply what you reviewed.
4. **Immediately before each change**, on disk, without following links:
   - the source is still a regular file (`lstat`), unchanged, inside the root, and reached only through real directories (`realpath` of its folder must be exactly where expected);
   - every destination folder is either a real directory or is created, one level at a time, only if missing; a file or symlink in the way blocks the change;
   - the destination itself does not exist (a symlink counts as existing);
   - neither path is in a protected location.
5. **No-overwrite move.** Node's `rename` silently replaces an existing file on macOS and Linux, so TidyMate instead hard-links the file to its new name (which fails if anything is there, even if it appeared a microsecond earlier) and then removes the old name. If the process stopped in between, the file would have two names, but nothing would be lost or overwritten. If removing the old name fails, the new name is removed again. Case-only renames on case-insensitive filesystems use `rename`, since both names are the same file.

### Partial failure, honestly reported

Filesystem changes are not transactional, and TidyMate doesn't pretend they are. Changes run one at a time, in a fixed order (by current path), and each gets its own result:

- A safety re-check that fails just skips that change (`rejected`), and the rest continue. They're independent, because chains and swaps are never allowed.
- An expected filesystem error (permission denied, drive doesn't support hard links) marks that change `failed`, and the rest continue.
- An **unexpected** error stops the run. The remaining changes are reported as `not attempted`, and nothing is retried.
- Folders created for a change that then fails are removed again if they're still empty.

The summary never claims more than happened: "8 files organized successfully." or "7 files organized. 1 change could not be applied."

Only one apply runs at a time.

### No undo (yet)

There is **no undo system** in this version. The result list shows exactly where every file went, so changes can be reversed by hand. The confirmation dialog says this before anything happens. A proper undo log is a planned improvement.

### Not supported

Deleting files, overwriting files, and moving anything outside the chosen folder are not supported, by design.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript (strict)
- Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com)
- [Zod](https://zod.dev) for validating config, metadata, and AI output
- [Vitest](https://vitest.dev) for unit tests
- Ollama + Gemma 3 4B for local inference, called over plain HTTP (no AI SDK)

## Getting started

Requirements: Node.js 20.9+ (developed on Node 24) and npm.

```bash
npm install
cp .env.example .env.local   # optional, defaults match a stock Ollama install
npm run dev
```

Open http://localhost:3000 and paste the path of a folder to scan.

Install Ollama and the model for AI suggestions (TidyMate never downloads models itself):

```bash
ollama pull gemma3:4b
```

## Configuration

| Variable          | Default                  | Purpose                        |
| ----------------- | ------------------------ | ------------------------------ |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama server            |
| `OLLAMA_MODEL`    | `gemma3:4b`              | Model used to propose plans    |
| `OLLAMA_TIMEOUT_MS` | `300000`               | How long to wait for the model (1s–1h) |

Config is parsed and validated server-side in `lib/config/env.ts`.

## Scripts

| Command              | What it does                    |
| -------------------- | ------------------------------- |
| `npm run dev`        | Start the dev server on 127.0.0.1 |
| `npm run build`      | Production build                |
| `npm run start`      | Serve the production build on 127.0.0.1 |
| `npm run lint`       | ESLint                          |
| `npm run typecheck`  | Generate route types and run `tsc` |
| `npm test`           | Run tests once                  |
| `npm run test:watch` | Run tests in watch mode         |
| `npm run test:ollama` | Optional live test against your local Ollama (not part of `npm test`) |

## Project structure

```
app/
  actions/           Server Actions (folder scan)
  api/suggestions/   Route handler for AI suggestions (cancellable)
  api/apply/         Route handler that applies selected changes (the only writer)
components/
  landing/           Landing page sections
  organizer/         Suggestions, selection, confirmation, apply results
  scanner/           Folder picker form and scan results
  ui/                shadcn/ui primitives (generated)
lib/
  ai/                Server-only AI layer: provider interface, Ollama client,
                     prompt, response schema, errors. No UI or filesystem code.
  config/            Server-side env parsing (Zod)
  files/             Browser-safe helpers: file kinds, formatting, input schema
  organization/      Plan validation, path rules, selection, labels, API client
  server/            Server-only code; every module imports "server-only"
    files/           Read-only scanner, path safety, protected locations
    organization/    Plan generation, plan store, apply engine, error mapping
  site.ts            Brand copy shared across the app
types/               Shared serializable types (scan results, plans)
tests/               Vitest unit tests, mirroring the source layout
  integration/       Optional live Ollama test (`npm run test:ollama`)
```

## License

To be decided.
