# Contributing (Developer Guide)

See [CONTRIBUTING.md](../../CONTRIBUTING.md) at the repo root for the general contribution guide.

This page covers additional technical details for code contributors.

## Directory Conventions

### Adding a new API feature

1. Create `packages/api/src/schemas/<feature>.ts` — Zod schemas
2. Create `packages/api/src/services/<feature>Service.ts` — business logic + Prisma
3. Create `packages/api/src/routes/<feature>.ts` — Fastify route handlers
4. Register the route in `packages/api/src/routes/index.ts`
5. Add route documentation to `packages/api/src/docs/openapi.ts`

### Adding a new frontend feature

1. Create `packages/web/src/services/<feature>Service.ts` — API client functions
2. Create `packages/web/src/stores/<feature>Store.ts` — Zustand store (if needed)
3. Create `packages/web/src/components/<feature>/` — React components
4. Add a route in `packages/web/src/App.tsx` if it's a new page

## Type Sharing

Types in `packages/shared/src/types/` are available to both `api` and `web` via the `@taskflow/shared` workspace package. Put types there if they're needed on both sides (e.g. API response shapes).

## Error Handling

**API errors**: throw a subclass of `AppError` from `src/errors/`. The global Fastify error handler converts these to the standard `{ success, error, message }` shape.

**Frontend errors**: React Query handles server errors. Wrap feature sections in `<ErrorBoundary>` for unexpected render errors. Log errors to console in development; wire up an error reporting service in production.

## Testing Patterns

### API integration tests

Use `vitest` + `supertest` (or Fastify's `inject`). Tests in `src/test/integration/` run against a real test database.

```ts
import { buildTestApp } from '../helpers/app';

test('POST /api/v1/tasks creates a task', async () => {
  const app = await buildTestApp();
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/tasks',
    headers: { authorization: `Bearer ${token}` },
    payload: { content: 'Test task', projectId: project.id },
  });
  expect(res.statusCode).toBe(201);
});
```

### Frontend component tests

Use `@testing-library/react` + `vitest`.

```ts
import { render, screen } from '@testing-library/react';
import { TaskItem } from '../TaskItem';

test('renders task content', () => {
  render(<TaskItem task={mockTask} />);
  expect(screen.getByText('Test task')).toBeInTheDocument();
});
```

## Code Review Checklist

Before submitting a PR, verify:

- [ ] All inputs validated with Zod (API) or react-hook-form (frontend)
- [ ] New route added to `openapi.ts`
- [ ] Database changes have a migration file
- [ ] No `console.log` left in production code paths
- [ ] Tests pass: `pnpm test`
- [ ] TypeScript compiles: `pnpm build`
