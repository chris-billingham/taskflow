# Architecture

## Overview

Taskflow is a pnpm + Turborepo monorepo:

```
packages/
├── api/     — Fastify REST API, Socket.IO server, BullMQ workers (TypeScript, Prisma)
├── web/     — React 19 single-page app (Vite, React Router 8, TanStack Query, Zustand, Tailwind 4)
├── e2e/     — Playwright end-to-end suite
└── shared/  — Placeholder. Both api and web list it as a dependency, but nothing imports it.
```

## Infrastructure

Production runs from `docker-compose.yml`:

| Service | Role |
|---------|------|
| `traefik` | Edge proxy. Terminates TLS (Let's Encrypt) and routes by path: `/api`, `/health` and `/socket.io` go to `api`; everything else goes to `web`. |
| `web` | nginx serving the built React app. It also has `/api` and `/socket.io` proxy blocks, but Traefik sends those paths straight to `api`. |
| `api` | Fastify HTTP API and Socket.IO on port 3001. |
| `worker` | Same image as `api`, started with `node dist/worker-entry.js`. Runs the BullMQ workers. |
| `migrate` | One-shot `prisma migrate deploy`. `api` and `worker` wait for it to exit successfully. |
| `postgres` | PostgreSQL 16. |
| `redis` | Redis 7. BullMQ queues, rate-limit counters and password-reset tokens. |
| `garage` | Garage, S3-compatible object storage for attachments. It replaced MinIO. Not exposed through Traefik. |
| `rclone` | Only started on demand (`tools` profile) by `scripts/backup.sh` / `scripts/restore.sh`. |

In development, `docker-compose.dev.yml` starts only Postgres, Redis and Garage. The API runs with `tsx watch` on port 3001. The Vite dev server runs on port 31779 and proxies `/api` and `/socket.io` to the API.

## API

### Request lifecycle

```
HTTP request
  → Fastify plugins: CORS, helmet, cookie, rate limit (Redis-backed), multipart
  → onRequest hook: request ID stored in AsyncLocalStorage (utils/requestContext.ts)
  → route plugin preHandler: authenticate (Bearer access JWT), plus requireAdmin on /admin
  → route handler: validates params/body/query with a Zod schema from src/schemas/
  → service: authorization via services/access.ts, then Prisma queries
  → side effects in-process: activity log, Socket.IO broadcast, notifications
  → response: { success: true, data }
```

Errors go through one global handler in `server.ts`. `AppError` subclasses (`src/errors/`) become their 4xx status with `{ success: false, error, message }`. Some Prisma errors are mapped too: P2025 → 404, P2002 → 409, P2003 → 400. Anything else becomes a 500, and in production the message is hidden.

All routes live under `/api/v1`. `/health` and `/api/health` are public. OpenAPI docs are at `/api/docs`, but only in development or when `ENABLE_API_DOCS` is set.

### Layers

| Layer | Directory | Responsibility |
|-------|-----------|----------------|
| Routes | `src/routes/` | HTTP handlers. Parse and validate input, call a service. |
| Schemas | `src/schemas/` | Zod schemas for request validation. |
| Services | `src/services/` | Business logic, authorization and database access. |
| Middleware | `src/middleware/` | `authenticate`, `requireAdmin`. |
| Utils | `src/utils/` | JWT, Quick Add parser, filter query parser, recurrence, dates. |
| Config | `src/config/` | Env validation, Prisma, Redis, S3 client, rate limits. |
| Jobs | `src/jobs/` | BullMQ queues and processors. |
| WebSocket | `src/websocket/` | Socket.IO server, room handling, event names. |
| Errors | `src/errors/` | `AppError` hierarchy. |

### Authentication

- Login (and registration) returns a **15-minute access JWT** in the response body. The client keeps it in memory and sends it as `Authorization: Bearer <token>`.
- It also sets a **30-day refresh JWT** in an httpOnly cookie scoped to `/api/v1/auth`. Refresh tokens are stored as SHA-256 hashes in the `RefreshToken` table.
- `POST /api/v1/auth/refresh` **rotates** the token: the old row is deleted and a new pair is issued in one transaction. If a refresh token comes in that is valid but not in the table (already used or expired), that counts as **reuse**. All of the user's refresh tokens are revoked and their live sockets are disconnected.
- Password change or reset, suspension and reuse detection all revoke sessions. `requireAdmin` re-reads the user's role and active status from the database on every admin request.
- When SMTP is configured and verified at boot, new accounts start unverified. Password login is refused until the email link is used.

### Authorization

`src/services/access.ts` is the single source of truth. Every service calls it.

- A project is visible to its owner, its direct `ProjectMember`s, and every member of its workspace.
- Access levels are ordered `VIEW < COMMENT < EDIT < ADMIN`.
- Workspace roles grant a baseline on every project in the workspace: `GUEST → COMMENT`, `MEMBER → EDIT`, `ADMIN`/`OWNER → ADMIN`. Project roles map as `VIEWER → VIEW`, `COMMENTER → COMMENT`, `MEMBER → EDIT`, `ADMIN → ADMIN`. The project owner is always `ADMIN`. The highest grant wins.
- A task's assignee always has at least `EDIT` on that task.
- `projectAccessWhere` / `taskAccessWhere` are the Prisma fragments list endpoints use. `requireProjectAccess`, `requireTaskAccess` and `requireWorkspaceRole` are the throwing point checks.

`ProjectMember` exists in the schema and is honoured by these checks, but there is no API for adding project members. In practice, workspaces are the only way to share.

### Real-time

Socket.IO shares the API's HTTP server (path `/socket.io`).

- **Handshake:** the client sends its access token in `auth.token`. The server disconnects the socket when that token expires. The client then reconnects with a fresh token.
- **Rooms:** each socket joins `user:<id>`, plus `project:<id>` and `workspace:<id>` for every project and workspace it can read. These are looked up at connect time. `subscribe:project` (sent by `useProjectRoom` when a project view mounts) covers projects shared after connecting. The server acks whether the join was allowed.
- **Events:** task, section and comment changes are emitted to the `project:<id>` room from `services/syncService.ts`. `project:updated` / `project:deleted` also go to the workspace room. The `user:<id>` room is only used to disconnect a user's sockets.
- **Resync:** joining rooms is asynchronous, so the server emits `rooms:ready` once the joins land. The client (`services/socket.ts`) turns `rooms:ready` and each subscribe ack into a coalesced bump of `resyncEpoch` in `socketStore`. `useRealTimeSync` then invalidates every query (active ones refetch at once), and store-backed hooks such as `useProjects` refetch too. That closes the gap for anything broadcast while the socket was disconnected or not yet joined.
- **Presence and typing:** the server handles `presence:update` and `typing:start`/`typing:stop`, and the web app sends presence updates. `PresenceIndicator` and `TypingIndicator` exist but are never mounted, so neither is visible to users.
- **Notifications** are not pushed over the socket. The bell polls `/api/v1/notifications` every 30 seconds.

### Background jobs (BullMQ)

Queues are defined in `src/jobs/` and started by `initializeWorkers()` in `src/worker.ts`:

| Queue | Schedule | Purpose |
|-------|----------|---------|
| `reminder-check` | every 60 s | Claims due reminders and sends them (browser push; email when a reminder's method is email) |
| `due-task-check` | hourly | Due-soon and overdue notifications, gated on each user's local time |
| `notification-digest` | hourly | Daily and weekly email digests of unread notifications, sent at the user's local time |
| `maintenance` | 03:30 UTC daily | Deletes expired refresh tokens and workspace invites |

The process entry point is `src/worker-entry.ts`. In production it runs in the separate `worker` container. In development the API runs the same workers in-process. `RUN_WORKERS_IN_API` controls this: it defaults to on when `NODE_ENV` isn't `production`, and you can set it to `true` for a deployment without a worker container.

Activity logging does not use a queue. Services write `ActivityLog` rows in-process right after the change. Immediate notifications (push and "immediate" email) are also sent in-process by `notificationService`.

### Storage

Attachments go to the S3-compatible bucket configured in `src/config/storage.ts` (the bundled Garage, or any S3 endpoint). Uploads are multipart requests to the API. Downloads are streamed **through the API** (`GET /api/v1/attachments/:id/download`) after an access check, with `Content-Disposition: attachment` and `nosniff`. `?inline=1` is honoured only for images. The browser never talks to the bucket directly.

## Frontend

### Structure

```
src/
├── App.tsx        — Routes (React Router v6); non-core pages are lazy-loaded
├── layouts/       — AppLayout (sidebar, mobile header, global q and / keys, Quick Add and search modals),
│                    SettingsLayout, AuthLayout
├── pages/         — app/ (Today, Upcoming, Project, Label, Filter, FiltersLabels),
│                    auth/ (Login, Register, ForgotPassword, ResetPassword, VerifyEmail),
│                    settings/ (Profile, Account, Preferences, Notifications, Templates,
│                               Integrations, DataExport, Admin, Workspace)
├── components/    — feature folders: task/, project/, board/, calendar/, views/, comment/,
│                    attachment/, filter/, label/, search/, workspace/, notification/,
│                    template/, settings/, admin/, layout/ (Sidebar), ui/ (primitives)
├── queries/       — TanStack Query: all server data (tasks, projects, labels, filters,
│                    comments, activity, workspaces, notifications, templates, …) and
│                    the actions that change it
├── types/         — web-side types (the task and project shapes the app handles)
├── stores/        — Zustand, client state only: auth session, socket status, toasts,
│                    UI, the selected workspace
├── hooks/         — the task panel URL hook, realtime sync, socket, focus-trap, theme, search
├── services/      — api.ts (axios client), socket.ts, notifications.ts (push), attachments.ts, admin.ts
└── utils/         — date formatting, recurrence, mentions, link tokens
```

### Routes

```
/login, /register, /forgot-password, /reset-password, /verify-email, /join   — public
/today, /upcoming, /projects/:id, /labels/:id, /filters/:id, /tasks/:id,
/filters-labels, /workspace/settings                                        — AppLayout, signed in
/settings/{profile,account,preferences,notifications,templates,
           integrations,export,admin}                                        — SettingsLayout, signed in
```

The open task lives in the URL: `?task=<id>` on any AppLayout page opens it in the one task panel (`components/task/TaskPanel.tsx`, mounted by AppLayout), over whatever page is showing. Back closes it, or steps from a subtask back to its parent. `/tasks/:id` is a stable link that redirects to the task's project with the panel open. Notification, push and search links use `/projects/:id?task=<id>`.

### State and data flow

Tasks are server state in **TanStack Query** (`src/queries/`). Every task query is keyed under `['tasks', kind, …]` (`taskKeys.ts`): paged project lists, Today, Upcoming, paged filter results, a task's subtasks, and task detail.

```
Component → useTaskActions() (queries/taskActions.ts)
  → the change applied to every cached copy of the task at once (taskCache.ts)
  → api.ts request
  → cached copies reconciled with the response, or rolled back with an error toast
  → when the last in-flight task change settles, task queries refetch
    (so membership is right: a new due date moves a task out of Today)
Socket events (useRealTimeSync) → patch the cached copies, then a debounced refetch
resyncEpoch bump (reconnect) → invalidate every query
```

Task rows, board cards and calendar entries call `useTaskActions()` and `useTaskPanel()` themselves, so pages only pass them tasks.

All other server data is in queries too, one module per area (`projects.ts` with sections, `labels.ts`, `filters.ts`, `comments.ts`, `activity.ts`, `workspaces.ts`, `notifications.ts`, `templates.ts`, `taskExtras.ts` for members, reminders and attachments). Each exports read hooks and an actions hook; list changes go through `optimistic.ts`, which rolls back and shows the error on failure. Socket events patch or invalidate the matching queries. The cache is cleared when the signed-in user changes (`App.tsx`).

Zustand holds client state only: `authStore` (session), `socketStore` (connection status and the resync counter), `toastStore`, `uiStore` and `workspaceStore` (which workspace the switcher shows).

`services/api.ts` is an axios instance with `withCredentials`. It attaches the in-memory access token. On a 401 it refreshes once through a shared promise (and a Web Locks mutex across tabs, because the refresh cookie is single-use), then retries the request.

## Data model

Key Prisma models (`packages/api/prisma/schema.prisma`):

```
User ── RefreshToken, NotificationPreference, PushSubscription, Notification
     ── Label (personal), Filter (personal, text query)
Workspace ── WorkspaceMember (OWNER/ADMIN/MEMBER/GUEST), WorkspaceInvite
Project ── belongs to a Workspace (team project) or has no workspace (personal)
        ── optional parent Project, ProjectMember (no API yet), Section, Task
Task ── Section?, parent Task? (subtasks), TaskLabel → Label, Comment, Attachment,
        Reminder, ActivityLog, assignee User?
Template (project templates), InstanceSetting (e.g. sign-up mode)
```

Each user gets a "Personal" workspace and an Inbox project at registration. `WorkspaceLabel` exists in the schema but is unused.

## Testing

| Tier | Location | Command | Needs |
|------|----------|---------|-------|
| API unit | `packages/api/src/test/unit` | `pnpm --filter @taskflow/api test:unit` | nothing |
| API integration | `packages/api/src/test/integration` | `pnpm --filter @taskflow/api test:integration` | nothing. Routes run via Fastify `inject` with services mocked. |
| API DB | `packages/api/src/test/db` | `pnpm --filter @taskflow/api test:db` | a real Postgres (dev compose, or `TEST_DATABASE_URL`) |
| Web | `packages/web/src/test` | `pnpm --filter @taskflow/web test` | nothing. Vitest; hooks, stores and components, plus MSW-backed page tests in `src/test/pages`. |
| E2E | `packages/e2e/tests` | `pnpm --filter @taskflow/e2e test` | running API and web servers plus the dev compose stack |

CI (`.github/workflows/test.yml`) runs lint and typecheck; the API suites with coverage and the DB tier against a Postgres service; web tests with coverage; `pnpm audit`; Playwright against dev servers; and a **production-stack** job. That job builds and boots the real `docker-compose.yml` (Traefik, migrate, Garage, api, worker, web) with `scripts/ci/prod-stack.sh` and runs the E2E suite against it over HTTPS.

See [setup.md](setup.md) for running page tests and E2E locally.
