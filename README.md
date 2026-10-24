# TidyMate

> Let local AI clean up the files you keep ignoring.

TidyMate uses local AI to suggest how to organize messy folders. You review the changes before anything happens.

TidyMate is a local-first tool for tidying folders like Downloads, Documents, and Desktop. It runs an open-weight model (Gemma 3 4B) through [Ollama](https://ollama.com) on your own machine. No cloud AI APIs, no accounts, no database.

Built for the Hacktoberfest Open-Source AI Challenge, Week 3: "Slow and Steady".

## Status

Early foundation. The landing page and project tooling are in place. Folder scanning, AI suggestions, review, and applying changes are not built yet.

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

Open http://localhost:3000.

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
| `npm run dev`        | Start the dev server            |
| `npm run build`      | Production build                |
| `npm run start`      | Serve the production build      |
| `npm run lint`       | ESLint                          |
| `npm run typecheck`  | Generate route types and run `tsc` |
| `npm test`           | Run tests once                  |
| `npm run test:watch` | Run tests in watch mode         |

## Project structure

```
app/                 Routes, layouts, global styles (App Router)
components/          App components
  landing/           Landing page sections
  ui/                shadcn/ui primitives (generated, lightly edited)
lib/                 Framework-agnostic logic
  config/            Server-side env parsing (Zod)
  site.ts            Brand copy shared across the app
tests/               Vitest unit tests
```

Planned as features arrive: `lib/ai/` (Ollama provider, kept separate from UI), `lib/server/` (server-only filesystem layer), and `types/` for shared domain types.

## License

To be decided.
