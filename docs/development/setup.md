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
cp .env.example .env
# Edit .env — defaults work for local Docker services without changes

# 4. Start infrastructure (Postgres, Redis, MinIO)
docker-compose -f docker-compose.dev.yml up -d

# 5. Create database schema
pnpm --filter @taskflow/api db:migrate

# 6. Start all packages in watch mode
pnpm dev
```

URLs:
- Web: http://localhost:5173
- API: http://localhost:3001
- API docs: http://localhost:3001/api/docs
- Prisma Studio: `pnpm --filter @taskflow/api db:studio` → http://localhost:5555
- MinIO console: http://localhost:9001 (user: minioadmin / minioadmin)

## Package Scripts

### Root workspace

```bash
pnpm dev           # Start everything
pnpm build         # Build all packages
pnpm test          # Run all tests
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
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up -d
pnpm --filter @taskflow/api db:migrate
```

## Environment Variables

The `.env` file at the repo root is shared by all packages. The API reads it via `tsx --env-file=.env`.

See [configuration.md](../admin-guide/configuration.md) for all variables.

## IDE Setup

**VS Code**: Install the recommended extensions in `.vscode/extensions.json`:
- Prisma
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript Importer

**WebStorm / IntelliJ**: Enable TypeScript service for the monorepo root.
