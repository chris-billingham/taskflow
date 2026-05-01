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
4. Run the test suite and linting
5. Open a PR against `main`

## Development Setup

See [docs/development/setup.md](docs/development/setup.md) for the full local development guide.

Short version:

```bash
pnpm install
cp .env.example .env
docker-compose -f docker-compose.dev.yml up -d
pnpm --filter @taskflow/api db:migrate
pnpm dev
```

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
- Use Zustand stores for global state; TanStack Query for server state
- No prop drilling beyond 2 levels — lift to store or context
- Wrap feature sections with `<ErrorBoundary>` for fault isolation
- Use `Skeleton` components while data is loading

### Database

- Always create a migration for schema changes: `pnpm --filter @taskflow/api db:migrate`
- Never push schema changes without a migration in production (`db:push` is for local experimentation only)
- Add indexes for columns that appear in `WHERE` clauses on large tables

## Testing

```bash
# All tests
pnpm test

# API unit tests
pnpm --filter @taskflow/api test:unit

# API integration tests (requires running DB + Redis)
pnpm --filter @taskflow/api test:integration

# Frontend tests
pnpm --filter @taskflow/web test

# E2E tests
pnpm --filter @taskflow/e2e test
```

New features should include:
- Unit tests for service-layer functions
- Integration tests for new API routes
- Component tests for non-trivial UI components

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
