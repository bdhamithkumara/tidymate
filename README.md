# TidyMate

> Let local AI clean up the files you keep ignoring.

TidyMate uses local AI to suggest how to organize messy folders. You review the changes before anything happens.

TidyMate is a local-first tool for tidying folders like Downloads, Documents, and Desktop. It runs an open-weight model (Gemma 3 4B) through [Ollama](https://ollama.com) on your own machine. No cloud AI APIs, no accounts, no database.

Built for the Hacktoberfest Open-Source AI Challenge, Week 3: "Slow and Steady".

## Status

| Stage | State |
| --- | --- |
| Read-only folder scanner | ✅ Built |
| AI suggestions (Gemma 3 4B via Ollama) | Not started |
| Review, approval, and applying changes | Not started |

Today TidyMate can scan a folder you choose and list its files with safe metadata. It does not call a model and never changes anything on disk.

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
- Model output is treated as untrusted input and validated before it is shown.
- Nothing is renamed or moved without the user's explicit approval.

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
3. Next.js's built-in Server Action CSRF check rejects requests whose `Origin` doesn't match the `Host`.

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

To prepare the local model for upcoming features:

```bash
ollama pull gemma3:4b
```

## Configuration

| Variable          | Default                  | Purpose                        |
| ----------------- | ------------------------ | ------------------------------ |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Local Ollama server            |
| `OLLAMA_MODEL`    | `gemma3:4b`              | Model used to propose plans    |

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

## Project structure

```
app/
  actions/           Server Actions (the only entry points into server code)
components/
  landing/           Landing page sections
  scanner/           Folder picker form and scan results
  ui/                shadcn/ui primitives (generated)
lib/
  config/            Server-side env parsing (Zod)
  files/             Browser-safe helpers: file kinds, formatting, input schema
  server/            Server-only code; every module imports "server-only"
    files/           Read-only scanner, path safety, protected locations
  site.ts            Brand copy shared across the app
types/               Shared serializable types (scan results)
tests/               Vitest unit tests, mirroring the source layout
```

Planned: `lib/ai/` for the Ollama provider, kept separate from UI.

## License

To be decided.
