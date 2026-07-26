# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Fixed

#### Realtime reconciliation
- **Missed broadcasts are now recovered instead of silently lost.** Realtime state
  arrived two ways — an HTTP fetch when a view mounted, and websocket broadcasts
  after — with nothing bridging the gap. Anything broadcast while a client was not
  yet in a room stayed invisible until a manual reload. Two windows, the second
  routine: between a view's fetch and its socket joining the room, and every
  disconnect — a sleeping laptop, a network blip, and in particular the server's
  own force-disconnect of an expired access token, which hits every client every
  15 minutes. The server now emits `rooms:ready` once a socket has joined, the
  client raises a coalesced resync signal from that and from each project
  subscription ack, and the task, Today, Upcoming, project and sidebar views
  re-read on it. `resyncTasks` restores the reader's page depth rather than
  collapsing a paginated list back to page one, and does so without flipping the
  loading flag.

#### Data and permissions
- **Attachment bytes no longer leak when an account is deleted.** `Attachment.uploadedBy`
  cascades, so the rows vanished with the account and the orphan sweep — which can
  only see rows — never learned the objects existed. They stayed in storage, and in
  every backup, forever. Keys are now collected before the delete and reclaimed
  after it; a storage failure is logged rather than failing a delete that already
  happened.
- **Project admins can delete attachments other people uploaded.** Deletion was
  uploader-only, leaving no route to clean up a misfiled upload or one left behind
  by a departed colleague. Now: the uploader, or ADMIN on the owning project.
  Attachments linked to nothing stay uploader-only.
- **Duplicating a task copies its labels and its whole subtask tree.** Both were
  dropped, so duplicating a checklist produced an empty shell of its parent. The
  copy is also broadcast and logged now, instead of being invisible to other
  clients until a reload.
- **`/health` no longer volunteers the version and per-dependency status to
  anonymous callers.** Traefik routes it publicly for uptime monitoring, which
  needs only the verdict; the breakdown — an unauthenticated inventory of what
  this deployment runs and which part is currently broken — is now returned to
  loopback callers only.

#### Pre-production review
- **Rate limits could be bypassed with a header.** Fastify ran with `trustProxy: true`,
  which trusts the whole `X-Forwarded-For` chain, so `request.ip` — the key for every
  rate-limit bucket — was whatever the client put in that header. Rotating it gave
  unlimited attempts at the 5-per-15-minutes login limit. Now a hop count
  (`TRUST_PROXY_HOPS`, default 1) so only addresses a trusted proxy appended are believed.
- **`SMTP_*` and `ADMIN_EMAILS` never reached the containers.** `docker-compose.yml`
  enumerates the environment it passes through and these were absent, so configuring them
  in `.env` silently did nothing: no verification, invite, reset or digest mail was ever
  sent, and no account could hold the `ADMIN` role. Together that left a production install
  with no password-recovery path at all. `MAX_FILE_SIZE_MB`, `APP_URL` and
  `ENABLE_API_DOCS` were equally inert.
- **The worker never initialised its mailer.** `initMailer` was only called by the API, but
  reminder, digest, due-soon and overdue emails are produced *only* by the worker process,
  so all of them were dropped in production. Masked locally, where the API runs the same
  jobs in-process.
- **A Redis blip permanently broke the process.** Both connection factories returned `null`
  from `retryStrategy` after three ~200 ms attempts, which tells ioredis to stop
  reconnecting for good. A Redis restart therefore left the API serving 503s with no rate
  limiting, and the worker silently not running any job, until a manual restart. Now
  reconnects indefinitely with capped backoff.
- Background workers no longer run in the API process in production, where a dedicated
  `worker` container owns them (`RUN_WORKERS_IN_API` to override).
- `scripts/install.sh` now prompts for `ADMIN_EMAILS` instead of shipping the
  `admin@example.com` placeholder.
- Documentation: `docs/configuration.md` claimed SMTP was unimplemented, documented
  `S3_ACCESS_KEY` as optional with a default, and recommended both `--scale api=3` and a
  Redis `allkeys-lru` policy — the first contradicts the single-replica Socket.io
  constraint, the second would silently evict queued jobs. Local-development setup pointed
  at the wrong `.env` (the API and Prisma read `packages/api/.env`, now with a template).

### Added

#### Instance administration
- `SystemRole` (`USER` | `ADMIN`) on users — an instance-level role for managing accounts
  across the whole deployment, separate from `WorkspaceRole` and `ProjectRole`. It grants
  no access to other users' tasks, projects or comments.
- Admin console at **Settings → Users** (visible to admins only): list and search accounts,
  create users, promote/demote, suspend/reactivate, reset passwords, delete accounts.
- `/api/v1/admin/*` endpoints, gated by a fresh database read of the caller's role and
  active flag on every request, so demotion and suspension take effect immediately.
- Account suspension (`User.isActive`): blocks sign-in and token refresh, deletes refresh
  tokens and drops live sockets, while keeping all data. Reversible.
- Admin password reset with a server-generated temporary password shown exactly once —
  works with no SMTP configured, which is the default for a self-hosted install.
- `ADMIN_EMAILS` environment variable to bootstrap administrators. Promote-only and
  idempotent; a listed address that registers becomes an admin immediately.
- Guard rails: the last active administrator cannot be demoted, suspended or deleted;
  admins cannot suspend or delete their own account from the console; deletion still
  refuses while the user owns a workspace that other people are members of.

### Changed
- `/users/me` and the login/register responses now include `role` and `isActive`.

## [1.0.0] — 2025-05-01

Initial release.

### Added

#### Core task management
- Task CRUD with content, description, due date, due time, deadline, duration, and priority
- Sub-tasks (parent/child hierarchy)
- Task completion and uncomplete
- Task duplication and move (between projects/sections)
- Bulk operations: complete, delete, move, update priority
- Quick add via natural language parsing ("Buy milk tomorrow p1 #work")
- Recurring tasks with daily, weekly, monthly, and custom rules
- Task reordering via drag-and-drop

#### Project & organisation
- Projects with color and icon
- Sections within projects for column-based grouping
- Labels with custom colors
- Saved filters with complex conditions (AND/OR, any field)
- Board view (Kanban), List view, Calendar view per project

#### Collaboration
- Workspaces with member invitations by email
- Per-task comments
- Activity log for all task changes
- Real-time presence indicators (who's online, who's editing)
- Typing indicators on comments

#### Files & notifications
- File attachments via drag-and-drop (stored in S3 or MinIO)
- Image preview in attachments
- In-app notifications
- Browser push notification subscriptions
- Email notifications via SMTP (optional)
- Task reminders

#### Search & discovery
- Full-text search across tasks, projects, and comments
- Upcoming view (tasks due in the next 7 days)
- Today view (today's tasks + overdue)

#### Settings & account
- User profile (name, avatar)
- Account management (email change, password change)
- Theme preferences (light / dark / system)
- Task display preferences (order, grouping, completed visibility)
- Notification preferences
- Data export (JSON)
- Task templates (create, browse, apply)

#### Developer
- REST API documented with OpenAPI 3.0 (Swagger UI at `/api/docs`)
- JWT authentication (access + refresh tokens, httpOnly cookies)
- WebSocket server for real-time sync
- Background job processing with BullMQ
- Prisma ORM with PostgreSQL
- Docker Compose for development and production
- Integration test suite
- E2E test suite (Playwright)
