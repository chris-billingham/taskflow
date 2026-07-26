# Local Development Setup

## Prerequisites

- Node.js >= 18 ([nvm](https://github.com/nvm-sh/nvm) recommended)
- pnpm >= 8: `npm install -g pnpm`
- Docker >= 24 with Compose v2

## Setup

```bash
# 1. Clone
git clone https://github.com/your-org/taskflow.git
cd taskflow

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp packages/api/.env.example packages/api/.env
# Defaults match docker-compose.dev.yml — no edits needed

# 4. Start infrastructure (Postgres, Redis, MinIO)
docker compose -f docker-compose.dev.yml up -d

# 5. Create database schema
pnpm --filter @taskflow/api db:migrate

# 6. Start all packages in watch mode
pnpm dev
```

URLs:
- Web: http://localhost:31779
- API: http://localhost:3001
- API docs: http://localhost:3001/api/docs
- Prisma Studio: `pnpm --filter @taskflow/api db:studio` → http://localhost:5555
- MinIO console: http://localhost:9001 (user: minioadmin / minioadmin)

## Package Scripts

### Root workspace

```bash
pnpm dev           # Start everything
pnpm build         # Build all packages
pnpm test:unit     # Unit tests (api + web)
pnpm test:ci       # Unit + API integration tests, as CI runs them
pnpm lint          # ESLint across the workspace
pnpm typecheck     # tsc --noEmit across the workspace
pnpm clean         # Remove dist/ and node_modules
```

### API

```bash
pnpm --filter @taskflow/api dev              # Watch mode with tsx
pnpm --filter @taskflow/api test             # All tests
pnpm --filter @taskflow/api test:unit        # Unit tests
pnpm --filter @taskflow/api test:integration # Integration (needs DB + Redis)
pnpm --filter @taskflow/api test:coverage    # Coverage report
pnpm --filter @taskflow/api db:migrate       # Apply migrations
pnpm --filter @taskflow/api db:seed          # Seed sample data
```

### Web

```bash
pnpm --filter @taskflow/web dev       # Vite dev server
pnpm --filter @taskflow/web build     # Production build
pnpm --filter @taskflow/web test      # Component/hook tests
```

## Adding Dependencies

```bash
# API dependency
pnpm --filter @taskflow/api add <package>

# Web dependency
pnpm --filter @taskflow/web add <package>

# Shared type (workspace)
pnpm --filter @taskflow/shared add <package>

# Root dev dependency
pnpm add -Dw <package>
```

## Database Workflow

1. Edit `packages/api/prisma/schema.prisma`
2. Create a migration: `pnpm --filter @taskflow/api db:migrate`
3. The Prisma client is regenerated automatically

To reset the database to a clean state:

```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up -d
pnpm --filter @taskflow/api db:migrate
```

## Running the E2E suite locally

Playwright drives a real browser against real servers, so both dev servers must
be running alongside the dev compose stack:

```bash
docker compose -f docker-compose.dev.yml up -d          # Postgres, Redis, MinIO

ADMIN_EMAILS=e2e-admin@taskflow.test \
  pnpm --filter @taskflow/api dev                       # terminal 2
pnpm --filter @taskflow/web dev                         # terminal 3

pnpm --filter @taskflow/e2e test                        # terminal 4
```

`ADMIN_EMAILS` is required: `admin.spec.ts` registers that address and asserts it
comes out an administrator, which is the bootstrap path under test. The CI job
sets the same value.

Two things that cost time when they go wrong:

- **Check nothing else is already bound to ports 3001 / 31779.** A stale dev
  server from an earlier session will happily serve the tests with old code, and
  the failures look like application bugs rather than a stale process.
  (`lsof -nP -iTCP:3001 -sTCP:LISTEN`)
- **Restart the Vite dev server after dependency changes** — a stale optimizer
  cache causes flaky, hard-to-read failures.

Note that `waitForLoadState('networkidle')` never settles on a signed-in page:
the realtime socket keeps a connection open. Wait for a rendered element instead.

## Environment Variables

Development configuration lives in **`packages/api/.env`** (template:
`packages/api/.env.example`). The API's dev script passes `--env-file=.env`,
which Node resolves against the package directory, and the Prisma CLI looks for
`.env` in the directory it runs in — so the repo-root `.env` is not what either
of them reads.

The root `.env` / `.env.example` is the **production** template: `docker-compose`
interpolates it and passes a fixed list of variables into the containers. Don't
copy it to `packages/api/.env` — it sets `NODE_ENV=production`, which enables
secure-only cookies and breaks sign-in over `http://localhost`.

The Vite dev server needs no `.env`; it proxies `/api` and `/socket.io` to
`localhost:3001`.

See [configuration.md](../admin-guide/configuration.md) for all variables.

## IDE Setup

**VS Code**: Install the recommended extensions in `.vscode/extensions.json`:
- Prisma
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript Importer

**WebStorm / IntelliJ**: Enable TypeScript service for the monorepo root.
