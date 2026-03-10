# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup          # Install deps, generate Prisma client, run migrations
npm run dev            # Dev server with Turbopack (localhost:3000)
npm run build          # Production build
npm run lint           # ESLint via next lint
npm test               # Vitest (watch mode)
npx vitest run         # Run tests once
npx vitest run src/lib/__tests__/file-system.test.ts  # Run single test file
npm run db:reset       # Reset SQLite database
npx prisma generate    # Regenerate Prisma client after schema changes
npx prisma migrate dev # Create/apply migrations after schema changes
```

## Architecture

UIGen is an AI-powered React component generator. Users describe components in natural language, Claude generates the code via tool calls, and a live preview renders the result in a sandboxed iframe — all without writing files to disk.

### Core Data Flow

1. User submits a prompt via `ChatInterface` → `ChatContext` (wraps Vercel AI SDK's `useAIChat`)
2. `POST /api/chat` receives `{ messages, files, projectId }`, streams Claude's response with two tools: `str_replace_editor` and `file_manager`
3. Tool calls stream back to the client; `FileSystemContext.handleToolCall` applies each operation to the in-memory `VirtualFileSystem` and increments `refreshTrigger`
4. `PreviewFrame` watches `refreshTrigger`, transforms all files with Babel (client-side via `@babel/standalone`), creates blob URLs + an ES module import map, and sets `iframe.srcdoc`
5. On stream completion, if authenticated, messages and file system state are persisted to the Prisma `Project` record

### Key Subsystems

**Virtual File System** (`src/lib/file-system.ts`): In-memory file tree using `Map<string, FileNode>`. Supports create, update, delete, rename, and text editor operations (view, str_replace, insert). Serializable to/from JSON for persistence and API transport.

**AI Tools** (`src/lib/tools/`): Two tools wrap the VFS for Claude — `str_replace_editor` (view/create/str_replace/insert/undo_edit) and `file_manager` (rename/delete).

**Transform/Preview** (`src/lib/transform/jsx-transformer.ts`): All JSX/TSX transformation happens client-side. `createImportMap()` transforms every file, creates blob URLs, and maps local imports (including `@/` aliases in 8 path variations). Third-party imports resolve to `esm.sh`. `createPreviewHTML()` produces a complete HTML document with Tailwind CDN, import map, and React error boundary.

**Auth** (`src/lib/auth.ts`): JWT-based (jose, HS256, 7-day expiry) with httpOnly cookies. Server-only module. Client uses `useAuth` hook which wraps server actions from `src/actions/index.ts`.

**AI Provider** (`src/lib/provider.ts`): Returns `claude-haiku-4-5` if `ANTHROPIC_API_KEY` is set; otherwise returns a `MockLanguageModel` that produces hardcoded component sequences (app works without an API key).

**System Prompt** (`src/lib/prompts/generation.tsx`): Instructs Claude to always create `/App.jsx` as the entry point, use Tailwind for styling, and use `@/` import aliases.

### Database

SQLite via Prisma. Prisma client generated to `src/generated/prisma/`. Always reference `prisma/schema.prisma` to understand the database structure before working with data models or queries.

### Layout

`MainContent` (`src/app/main-content.tsx`) is the root layout: resizable panels with chat on the left (35%) and preview/code on the right (65%). The code view splits into `FileTree` (30%) + `CodeEditor` (Monaco, 70%).

### Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json).

### node-compat.cjs

Required via `NODE_OPTIONS` in all scripts. Deletes `globalThis.localStorage`/`sessionStorage` server-side to fix Node.js 25+ exposing non-functional Web Storage APIs that break SSR `typeof` guards (used by `anon-work-tracker.ts`).

## Code Style

- Use comments sparingly. Only comment complex code.

## Testing

Tests use Vitest with jsdom environment. Tests colocate with source in `__tests__/` directories. Key test files cover: VirtualFileSystem operations, JSX transformer + import map generation, context providers (ChatContext, FileSystemContext), and UI components (ChatInterface, FileTree, MessageInput, etc.).
