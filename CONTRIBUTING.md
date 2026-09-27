# Contributing to Taskflow

## Code of Conduct

Be respectful, constructive, and inclusive. We do not tolerate harassment in any form.

## How to Contribute

### Reporting Bugs

1. Check existing issues to avoid duplicates.
2. Open an issue with:
   - A clear title
   - Steps to reproduce
   - Expected vs actual behaviour
   - Taskflow version and environment (OS, Docker version)

### Suggesting Features

Open an issue tagged `enhancement` describing:
- The problem it solves
- Your proposed solution
- Any alternatives you considered

### Submitting Code

1. Fork the repository
2. Create a feature branch from `main`: `git checkout -b feat/my-feature`
3. Make your changes (see standards below)
4. Run linting, type checks and tests (see [Testing](#testing))
5. Open a PR against `main`

## Development Setup

See [docs/development/setup.md](docs/development/setup.md) for the full local development guide.

Short version (Node 24 from `.nvmrc`, pnpm 10, Docker with Compose v2):

```bash
corepack enable                                  # provides the pnpm version pinned in package.json
pnpm install
cp packages/api/.env.example packages/api/.env   # dev config; defaults match docker-compose.dev.yml
docker compose -f docker-compose.dev.yml up -d   # Postgres, Redis, Garage
pnpm --filter @taskflow/api db:migrate
pnpm dev                                         # web on :31779, API on :3001
```

The repo-root `.env.example` is the production template for `docker-compose.yml`. Don't use it for development.

## Coding Standards

### General

- TypeScript strict mode is enforced — no `any` unless absolutely necessary
- Prefer editing existing files over creating new ones
- Keep functions small and focused
- No commented-out code

### Backend (Fastify API)

- Validate all inputs with Zod before using them
- All routes must require authentication via `authenticate` middleware (except public auth routes)
- Use service layer for business logic — routes should only parse input and delegate
- Throw `AppError` subclasses for known errors; let the global handler catch unknown ones
- New routes must use the existing Zod schemas in `src/schemas/` or create a new schema file

### Frontend (React)

- Components live in `src/components/<feature>/`; pages live in `src/pages/`
- Server data lives in TanStack Query (`src/queries/`): read through the hooks there and change data through their action hooks (tasks: `useTaskActions()`, which updates every cached copy). Zustand (`src/stores/`) is for client state only. All API calls go through `src/services/api.ts`.
- Use the shared UI components in `src/components/ui/` (Modal, ConfirmDialog, Menu, Sheet, IconButton, Button) rather than hand-built overlays, and the `primary-*` colour classes rather than hex values. Icon-only buttons need an accessible name.
- No prop drilling beyond 2 levels — lift to store or context
- Wrap feature sections with `<ErrorBoundary>` for fault isolation
- Use `Skeleton` components while data is loading

### Database

- Always create a migration for schema changes: `pnpm --filter @taskflow/api db:migrate`
- Never push schema changes without a migration in production (`db:push` is for local experimentation only)
- Add indexes for columns that appear in `WHERE` clauses on large tables

## Testing

There is no root `pnpm test`. Use these instead:

```bash
pnpm lint          # ESLint across the workspace
pnpm typecheck     # tsc --noEmit across the workspace
pnpm test:unit     # API unit tests + web tests
pnpm test:ci       # test:unit plus API integration tests

# API, individually
pnpm --filter @taskflow/api test:unit
pnpm --filter @taskflow/api test:integration   # routes via Fastify inject, services mocked; no infrastructure needed
pnpm --filter @taskflow/api test:db            # real Postgres (the dev compose database)

# Web (Vitest: components, hooks, stores and MSW-backed page tests)
pnpm --filter @taskflow/web test

# E2E (Playwright; needs the dev compose stack plus API and web dev servers running)
pnpm --filter @taskflow/e2e test
```

[docs/development/setup.md](docs/development/setup.md) explains how to write page tests (`packages/web/src/test/pages`) and how to run the E2E suite locally, including against the production stack.

New features should include:
- Unit tests for service-layer functions
- Integration tests for new API routes
- Component or page tests for non-trivial UI

## Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:

```
feat(tasks): add recurring task support
fix(auth): refresh token not cleared on logout
docs: update installation guide
```

## PR Process

1. Ensure CI passes (tests + linting)
2. Keep PRs focused — one feature or fix per PR
3. Include a description of _what_ changed and _why_
4. Link to the related issue if one exists
5. Request a review once the PR is ready

## Project Maintainers

PRs are reviewed on a best-effort basis. For urgent issues, tag them `priority`.
