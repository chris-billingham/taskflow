# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [1.0.1] - 2026-10-02

- **Keep working offline in the browser.** Completing, reopening, editing
  and deleting tasks show at once and are saved when you reconnect, in the
  order you made them; new tasks wait in the offline banner until saved.
  A task someone else changed meanwhile isn't overwritten: you're told
  which change wasn't saved. The task panel no longer fails to open
  offline (it's fetched ahead of time and can't take the page down).
- **Single sign-on in apps.** Native apps sign in with your organisation's
  provider through the system browser, using a one-time code and PKCE
  (`/auth/oidc/start?client=app`, `POST /auth/oidc/token`).
- **Webhook delivery log.** The Webhooks dialog lists the latest 50
  delivery attempts with their status or error, and can resend one.
- **Boards and calendars use the full window width.**
- **API document:** every operation documents its error response
  (`ErrorResponse`, with the current row for a version conflict), and
  unused duplicate schemas are gone (72 components down to 35).
- **Fixed:** opening a calendar feed, or adding two tasks with the same new
  `@label`, could fail when two requests arrived at once.

## [1.0.0] - 2026-10-02

The first published release: images on GHCR (`ghcr.io/chris-billingham/taskflow-api` and `-web`), installed and upgraded with `scripts/install.sh` and `make upgrade`. Installs from before this should run `git pull --ff-only` once, then `make upgrade`, as `docs/admin-guide/upgrading.md` explains.

### Phase 7: self-hosting and integrations

- **Versioned releases.** Pushing a version tag publishes images for amd64
  and arm64 to `ghcr.io/chris-billingham/taskflow-api` and `-web`, and a
  GitHub release with its notes. Servers no longer build images:
  `TASKFLOW_VERSION` in `.env` picks the release, `install.sh` uses the
  latest, and `make upgrade [version=1.2.0]` checks out that release,
  backs up, pulls, migrates, checks the new version is running, and goes
  back to the previous one if it isn't. `DOCKER_REGISTRY` and `IMAGE_TAG`
  are gone. The web image runs nginx as an unprivileged user.
- **Know when something is wrong.** Admin console **System** panel: the
  release, database, Redis, background worker (from a heartbeat), queue
  depth, and failed jobs, which can be run again or discarded.
  `/health/live` and `/health/ready`, a Prometheus `/metrics` endpoint
  (optionally behind `METRICS_TOKEN`), and a worker healthcheck that
  notices a lost Redis connection or a stuck process.
- **Two-factor sign-in** with an authenticator app and ten single-use
  recovery codes. Admins can turn it off for someone who lost their phone.
  The login response can now be a challenge (`twoFactorRequired`), with
  `POST /auth/login/two-factor` as the second step.
- **Single sign-on** with OpenID Connect (Authentik, Keycloak, Google
  Workspace…), following the sign-up policy and still asking for
  Taskflow's own second factor. Accounts made this way can choose a
  password later.
- **Calendar feeds:** a private iCal link per project or filter for
  Apple, Google or Outlook calendars.
- **Webhooks:** a project's admins can send its task and comment events
  to n8n, Zapier or scripts, signed with HMAC-SHA256, retried, and kept
  away from private addresses unless allowed.
- **Import and export.** Export is now a ZIP of everything in your
  projects, attachments included, that any Taskflow can import. Imports
  also read Todoist CSVs and backups, and plain CSVs.
- **History is pruned:** activity after a year and read notifications
  after 90 days by default (`ACTIVITY_RETENTION_DAYS`,
  `NOTIFICATION_RETENTION_DAYS`).
- **CI** checks every Monday that each image an install pulls is still
  published.
- **Fixed:** labels not linked to their fields on the Account page and in
  inputs without a name, and unnamed icon buttons on filter pages.

### Phase 6: mobile-ready API and sync

- **Install Taskflow as an app.** The web app can be installed from the
  browser (home screen on iPhone and Android, an app window on desktop).
  It opens without a connection and shows the projects and tasks it last
  loaded, kept for 3 days; a banner says when you're offline, and changes
  made offline explain that they weren't saved.
- **Signed-in devices.** **Settings → Devices** lists every browser and
  app signed in to your account, with when each was last used; sign out
  any of them, or every device but this one.
- **Personal access tokens** for scripts and integrations, read-only or
  read and write, created and revoked in the same place. They can't
  change your password, manage devices or tokens, or use admin pages.
  Deleting your account now asks for your password.
- **Sign-in for apps.** Native apps get their refresh token in the
  response body and send it back to refresh or sign out; a device stays
  the same session across refreshes.
- **Delta sync.** `GET /api/v1/sync` returns everything that changed since
  a cursor, including deletions and projects shared with you since then,
  so an app can keep an offline copy. Tasks, projects, sections and labels
  carry a `version`; send `ifVersion` with an edit to get a conflict (with
  the current row) instead of overwriting someone else's change. Apps can
  choose ids when creating things, so a retried request never duplicates.
- **Moving a task updates one row.** Tasks have fractional sort orders and
  `POST /tasks/:id/position` places one after another, instead of
  rewriting the order of the whole list.
- **iOS push notifications** through Apple's push service (APNs), set up
  with `APNS_*` settings. Notifications for a device stop when it signs
  out.
- **OpenAPI document and Swift client.** `openapi.json` is generated from
  the route schemas and committed, with named schemas. `clients/swift` is
  a Swift package generated from it. CI checks the document is current,
  that responses match it, and that changes don't break installed apps,
  and builds the Swift client.
- **Fixed:** the API documentation described due dates as timestamps and
  enums by their internal names, which didn't match what the API sends.

### Phase 5: team collaboration

- **Share a project with specific people.** **Share** at the top of a
  project adds someone with an account as admin, member, commenter or
  viewer; admins change roles or remove people, and anyone can leave.
  Personal projects can be shared (not the Inbox). The person is notified
  and the project appears in their sidebar straight away.
- **Workspace guests see only what's shared with them**, as the invite
  dialog always said; they used to read every team project. They also no
  longer receive workspace-wide live updates.
- **A personal space for everyone.** Each account's Inbox and personal
  projects are its own, with no workspace; workspaces are for teams. The
  automatic "Personal" workspaces are migrated away (kept and renamed if
  anyone else had joined). The sidebar shows My Projects, each workspace,
  and Shared with me; the workspace switcher is gone.
- **Team labels.** A label belongs to a space: yours, or a workspace's,
  shared by everyone in it. A task uses its project's labels, so editing a
  shared task's labels no longer wipes other people's. Existing labels on
  team tasks became team labels. Moving tasks between spaces carries
  labels across by name; filters match labels by name everywhere.
- **Your own arrangement.** Favourites, sidebar order and collapsed
  sections (and label favourites and order) are per person instead of
  shared with everyone on the project.
- **Live notifications.** New notifications appear the moment they're
  created, including from background jobs (the worker publishes through
  Redis; Socket.IO uses the Redis adapter). Email and push are sent from a
  queue with retries, so a slow mail server never holds up an action.
  Reordering tasks and sections shows up live for others.
- **See who's here.** The task panel shows who else has the task open,
  and who is typing a comment.
- **Assigning work.** `+name` in Quick Add (`+me`, a full name, or a
  unique first name), an **Assigned to me** view, and a project
  **Activity** feed.
- **Leave a workspace, transfer ownership** from workspace settings.
- **Data model.** Prisma 7 (with the pg driver adapter; the database URL
  moved to `prisma.config.ts`). Due dates and deadlines are `DATE` columns
  sent as `YYYY-MM-DD`; display preferences and email frequency are enums;
  superseded columns are dropped. New setting: `NOTIFICATION_DELIVERY`.
- **Fixed:**
  - Deleting an account left its personal projects behind with no owner.
  - Search results showed the previous day's due date west of UTC.
  - A project's assignee and @mention list ignored direct collaborators.
- **CI:** API coverage is now measured across the unit, integration and
  DB suites together (43% to 81% of statements), with the thresholds
  raised to match. `nodemailer` 10.0.13 for new advisories.

### Phase 4: everyday UX

- **Trash and Undo.** Deleting a task moves it and its subtasks to a Trash
  page for 30 days, then the daily maintenance job deletes it for good.
  Completing, deleting and moving a task offer Undo. Undoing a repeating
  task's completion also removes the next occurrence it created. New
  endpoints: `GET /tasks/trash`, `POST /tasks/:id/restore` and
  `DELETE /tasks/:id/permanent`. Trashed tasks never appear in reads,
  counts or search, and their reminders don't fire.
- **Move tasks** between projects and sections from "Move to…" in the row
  menu, from the project name in the task panel, or by dragging between
  sections in a project's list view. A section's "Add task" box now reads
  Quick Add shorthand and files the task in that section.
- **Multi-select.** Ctrl/⌘/Shift-click rows, or choose "Select" in a row's
  menu. A toolbar then completes, dates, prioritises, moves, labels or
  deletes the selected tasks together, with Undo where it applies.
- **Keyboard control.** J/K move between tasks. On the focused task, E
  renames, C completes, T sets the date, 1–4 set the priority, X selects and
  D deletes. ⌘K / Ctrl+K opens a command palette, and ? lists every
  shortcut.
- **Better Quick Add.** One parser in `@taskflow/contract` both highlights
  the shorthand as you type and creates the task. It adds ISO dates, "next
  Friday", "every weekday" and multi-word project and label names. `#` and
  `@` autocomplete, with "Create label" for new ones. Unknown `@labels` now
  stay in the task text instead of vanishing. Today's Quick Add dates tasks
  today.
- **Deadlines you can see.** Task rows and board cards show deadlines.
  Filters can use them (`deadline`, `no deadline`, `deadline passed`,
  `deadline before:` and `deadline after:`), and you're notified the
  morning before a deadline and again once it passes.
- **Projects.** An Archived projects page appears in the sidebar when any
  project is archived. Projects can have a description, and can move under
  another parent from the Edit project dialog. The API checks the new
  parent: you need edit access, it must be in the same space and not the
  Inbox, and the move can't create a loop.
- **Sign-up defaults.** New accounts take their timezone, week start and
  date and time formats from the browser.
- **Markdown descriptions.** Task descriptions render as GitHub-flavoured
  Markdown, and checklist boxes can be ticked without opening the editor.
  Comments use the same renderer.
- **Board grouping.** Project boards can be grouped by section, priority,
  assignee or due date, and dragging a card to another column changes that
  field. Filter and label pages gain a board view, groupable by priority,
  due date, assignee or project.

### Phase 3: frontend architecture

- **Every task has a URL.** `?task=<id>` on any page opens the task panel,
  one panel for the whole app in place of seven separate copies. Back closes
  it, or steps from a subtask back to its parent. Subtasks and the parent can
  be opened from the panel, and `/tasks/:id` is a stable link to a task.
- **Server data moved to TanStack Query.** Tasks, projects, sections, labels,
  filters, comments, activity, workspaces, notifications, templates, members,
  reminders and attachments are all cached queries. A change to a task shows
  everywhere it appears at once, and realtime events update the same cache.
  Failed changes roll back and say so; several stores used to roll back
  silently. The cache is cleared when the signed-in user changes.
- **One set of task actions.** Rows, board cards and calendar entries act on
  tasks themselves, so list pages no longer repeat the same handlers or
  refetch after every change.
- **Design system groundwork.** The brand colour is a token (CSS variables
  behind Tailwind's `primary-*`) instead of 138 hard-coded values. There are
  shared, labelled, keyboard-operable components: IconButton, Menu, Sheet,
  Modal and ConfirmDialog, and every dialog and dropdown now uses them.
  Escape closes only the topmost dialog, focus returns to what opened it,
  menus open beside their trigger above everything else (flipping upwards
  near the bottom of the screen), and each row's options button names its
  item. The last browser `confirm()` prompts are gone, and the mobile sidebar
  closes on Escape.
- **Smaller first load.** The app's own first chunk went from 170 KB to 28 KB
  gzipped. The task panel (comments, Markdown, attachments), the login page
  and the other views load on demand, and Upcoming and Project are prefetched
  while the browser is idle. Libraries sit in separate long-cached files, and
  Zod no longer loads up front.
- **Smoother long lists.** Task rows are memoised and open tasks through a
  stable function, so navigating no longer re-renders every row.
- **Web stack upgraded:** React 19, React Router 8 (clears the last
  production advisories), Zustand 5 and Tailwind CSS 4. The brand scale now
  lives in `@theme` in `src/index.css`. Base styles sit in the base cascade
  layer: under Tailwind 4, an unlayered rule overrides every utility.
- **Fixed:**
  - The Overdue section and row hover had no dark-mode styles, which left
    white text on a pale background.
  - Expanding a task's subtasks in a project list showed nothing unless that
    task had been loaded elsewhere.
  - The assignee pickers crashed for guests as soon as they typed a search.
  - The template dialog's "Make public" box did nothing and has been removed.
  - The notification bell had no accessible name.

### Phase 2: API contract

- `buildApp()` factory: integration tests now run the real app (plugins,
  error handler, routes) instead of per-file copies.
- Zod 4 in the API and web app (`@hookform/resolvers` 5); string formats use
  the top-level `z.email()` / `z.url()` / `z.iso.datetime()`.
- **`@taskflow/contract`** replaces the unused shared package: Zod schemas for
  requests and responses. Routes validate input and serialize output through
  them (unlisted fields are dropped, so e.g. attachment storage keys and push
  subscription keys no longer reach clients). The OpenAPI document at
  `/api/docs` is generated from the same schemas; the hand-written spec is
  gone.
- **Read notifications disappeared from the bell.** `?unreadOnly=false` was
  coerced to `true`, so the list only ever showed unread items. Activity
  endpoints now cap `limit` at 100 (it was unbounded).
- **Shared rules live in the contract.** Recurrence rules and @mention handles
  were implemented separately in the API and the web app; both now come from
  `@taskflow/contract`. Task create/update reject unsupported recurrence
  rules instead of storing them and quietly repeating daily.
- **One access rule for every project lookup.** Quick add's `#project` now
  needs an exact name (`#Work` no longer files into "Homework") and finds team
  projects; an unmatched `#tag` stays in the task text. Filter `#project`
  finds team projects too. Workspace members can reorder team projects.
  Search no longer shows a comment to its author after they lose access to
  the project, and filter `assigned to:` only matches people you work with.
- **Case-insensitive name lookups treated `_` and `%` as wildcards.** This let
  an invite for bob@corp.com admit b_b@corp.com on an invite-only instance.
  Matches are now confirmed exactly.
- **Email addresses are case-insensitive.** Alice@x.com and alice@x.com were
  two possible accounts, and sign-in needed the original case.
- **Consistent pagination.** Tasks, filter results, comments, activity and
  notifications all take `limit` + `cursor` and return
  `{ data, nextCursor }`. Filter and label pages were capped at 200 tasks and
  now have **Load more tasks**.
- **Structured logging.** Service, job and worker logs go through the same
  pino logger as request logs, as JSON in production, and carry the reqId of
  the request that triggered them.
- **Fixed:** an admin could invite someone as an admin (making admins is
  owner-only); transferring a workspace to yourself left it with no owner;
  workspace members couldn't save team projects as templates, and guests could
  apply templates into the workspace; malformed filter queries could be saved
  and silently matched more than intended; "Urgent" and "urgent" could exist
  as separate labels.

### Phase 1: safety net

- **CI now boots the production stack and runs the end-to-end suite against
  it.** `scripts/ci/prod-stack.sh` builds the images and starts
  `docker-compose.yml` as an install would (Traefik on https://localhost,
  migrations, Garage, api, worker, web) with generated secrets; the "Production
  Stack" job replaces the build-only image job. Runs locally too.
- **`docker compose up` applies migrations.** A one-shot `migrate` service runs
  `prisma migrate deploy` and the API and worker wait for it to succeed, so
  new code can't start against an old schema. It never pulls (the image is
  built locally), so a missing image can't be fetched from Docker Hub.
- **`RATE_LIMIT_MULTIPLIER`** scales every production rate limit (default 1,
  minimum 1). Limits count per client IP, so a team behind one office IP
  shared a single 5-logins-per-15-minutes bucket. The limits now live in one
  place (`config/rateLimits.ts`) instead of nine inline conditions.
- **Test and build stack upgraded:** Vite 8 (Rolldown), Vitest 5, coverage-v8
  5, jsdom 30, Testing Library 16 (+ explicit `@testing-library/dom`),
  jest-dom 7, `@types/node` 24. Clears both critical advisories; the full
  audit now has no high or critical findings and CI gates on it. Coverage
  thresholds were re-baselined: Vitest 5 measures by AST and counts files no
  test loads, so its branch/function figures aren't comparable with Vitest 1's.
- **Sign-in tokens no longer reach access logs.** Verification, password-reset
  and invite links carried their token in the query string, so Traefik, nginx
  and the API logged it on every click. Links now use the URL fragment
  (`#token=…`), which browsers never send to a server; pages read it, scrub it
  from the address bar, and POST it (`GET /auth/verify-email` is now
  `POST` with a JSON body). Signed-out invitees keep the token in session
  storage during sign-in instead of in the login redirect URL. Links already
  sent with `?token=` still work.
- **Page-level frontend tests.** A Mock Service Worker harness drives the real
  stores, hooks and API client, with tests for Today, Upcoming, Project (list,
  pagination, deep links, not-found) and the board. Web statement coverage
  went from 13% to 28%, and the thresholds moved up with it. Board columns now
  have accessible names and a labelled collapse button.
- **New installs are invite-only.** The first account, `ADMIN_EMAILS`
  addresses and anyone holding an unexpired workspace invite can still sign up;
  everyone else is added by an admin. **Settings → Users → Sign-ups** switches
  to open registration (stored in the new `instance_settings` table, which then
  overrides `REGISTRATION_MODE`). The sign-in page only offers "Sign up" when it
  would work. Refusals return `REGISTRATION_CLOSED` before the duplicate-email
  check, so a closed instance doesn't reveal which addresses have accounts.
  Existing installs: set `REGISTRATION_MODE=open` to keep today's behaviour.
- **Prisma 6** (from 5.22). No schema drift (the migration diff is empty) and
  none of the removed APIs were in use. The `migrate` service calls the image's
  Prisma binary directly instead of through `npx`.
- Removed unused API dependencies: `@fastify/websocket`, `@fastify/jwt`, a
  direct `pino`; `pino-pretty` is dev-only and no longer ships in the image.
- **pnpm 10 and Turbo 2.** Lockfile v9; dependency install scripts are
  allow-listed (`pnpm.onlyBuiltDependencies`: the Prisma packages, esbuild,
  msgpackr-extract); the API image deploys with `pnpm deploy --legacy`.
  `turbo.json` uses `tasks`, with loose env mode to keep today's behaviour.
  **Local setup:** run `corepack enable` (or `npm i -g pnpm@10`); pnpm 8
  can't read the new lockfile.
- Prisma 6's config loader pins `deepmerge-ts` 7.1.5 (GHSA-ggr8-5vv4-36mx,
  stack exhaustion on deeply nested input). A scoped override,
  `@prisma/config>deepmerge-ts: 8.0.2`, removes it; `prisma generate`,
  `validate` and `migrate deploy` were checked against it. Drop the override
  when Prisma ships a fixed version.
- **ESLint 10** with `eslint-plugin-react-hooks` 7 (only the two classic hook
  rules for now; the React Compiler rules wait for the Phase 3 frontend work)
  and `defineConfig`. Its new `no-useless-assignment` and
  `preserve-caught-error` rules found four spots, now fixed. The web app
  targets ES2022 and no longer uses `baseUrl`.
- **TypeScript 6.0** in every package (7.0 waits for typescript-eslint
  support). The unused shared package moved off the deprecated `node10`
  module resolution.
- **CI hygiene and automated updates.** Actions moved to their Node 24
  majors and are pinned by commit SHA; read-only default permissions;
  superseded pull-request runs are cancelled (pushes to main always finish);
  every job has a timeout. Dependabot opens weekly PRs for npm, GitHub
  Actions, Dockerfile base images and compose service images, with minor and
  patch bumps grouped.

### Fixed

#### September review

- **Unverified accounts could stay signed in indefinitely.** With email
  verification on, registration still issued a session and refresh never
  checked `emailVerified`; only password sign-in was blocked. Registration
  now creates the account without a session and the page asks the user to
  check their inbox; refresh refuses unverified accounts (`EMAIL_NOT_VERIFIED`).
- **Tasks added on a calendar day or under an Upcoming day could land a year
  out,** and a week-view slot's time ended up in the task name. Quick Add now
  takes an exact `dueDate`/`dueTime` from those views, and a typed month/day
  that falls today means today.
- **Deleting a project from the sidebar didn't ask first.** It now confirms,
  like the project header. The invite dialog's Guest description is accurate
  (comment access to every team project).
- **Due-soon and overdue notifications stopped for everyone once an instance
  had more than 500 stale overdue tasks.** The hourly job read one fixed batch
  of the 500 oldest due tasks and never skipped already-notified ones, so the
  same backlog was re-read every run. It now walks every candidate page by page.
- **The Inbox was invisible by default.** It lives in the auto-created
  "Personal" workspace, and the sidebar hid workspace projects whenever no
  workspace was selected — the default. It is now a pinned nav entry.
- **Notification, push and search links opened the project but not the task.**
  They all carry `?task=<id>`, which nothing read. The project page now opens
  that task (fetching it if it isn't loaded), and closing it clears the param.
- **An expired verification link locked the user out.** Login now returns
  `EMAIL_NOT_VERIFIED` and offers to resend the link.
- **Upgrading Fastify to 5.12 would have collapsed every rate limit onto
  Traefik's address.** Fastify 5.12.1 treats a numeric `trustProxy` as "trust
  nothing". Trust is now `TRUST_PROXY_HOPS` *and* a check that each hop connects
  from `TRUST_PROXY_ADDRS` (default: loopback and Docker's private ranges).
- **The manual upgrade guide pulled `taskflow/*` from Docker Hub** (a namespace
  the project doesn't own) and ran migrations with the old image. It now builds
  from source and migrates with the new image, as `upgrade.sh` does.

### Changed — breaking for existing installs

- **Object storage is now Garage instead of MinIO.** MinIO's images were
  withdrawn from Docker Hub and quay.io (its repository was archived in 2026),
  so `install.sh`, restoring onto new hardware, new dev setups and CI could no
  longer start file storage at all. Garage (`dxflrs/garage:v2.4.1`) creates its
  key and bucket from `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET` on first
  start; `GARAGE_RPC_SECRET` is new and the `MINIO_*` variables are gone.
  Backups and restores copy the bucket with a pinned rclone tool container.
  `upgrade.sh` stops on an old `.env`; `docs/admin-guide/upgrading.md` has the
  move-your-files procedure. Verified with a backup → mutate → restore drill on
  the production compose file.

### Security

- Patched runtime dependencies within their ranges: nodemailer 9.1.1, fastify
  5.12.5, socket.io 4.8.4 (socket.io-parser 4.2.7), @fastify/swagger-ui 6,
  fast-uri 4.1.3, ws 8.21+. `pnpm audit --prod` has no high or critical findings
  (two moderate react-router 6 advisories remain; fixed by React Router 7).
- All 17 `pnpm.overrides` removed — several were unbounded `>=` ranges that had
  already pulled in unplanned majors. `file-type` is now declared at the major
  actually in use (22).
- CI now fails on any high/critical advisory in production dependencies.

### Changed

- Node 24 LTS in both Dockerfiles and CI (Node 20 reached end of life in April
  2026); `engines.node` is `>=22.12.0`, and `.nvmrc` pins 24.

#### Production stack (found by booting it, not by reading it)

None of these were reachable by any test suite: CI builds the images but never
runs them, and every other suite runs against dev servers.

- **`prisma migrate deploy` could not run in the production image, so no
  deployment could create its database schema.** `node:20-alpine` ships
  `libssl.so.3` but no `openssl` binary, so Prisma's platform detection fell back
  to its `openssl-1.1.x` default and generated a client bound to engines for an
  OpenSSL not present in the image; the schema engine then failed to load its
  shared library and died with "Could not parse schema engine response". Both
  stages now install `openssl`, and the build asserts the engines actually load
  (`prisma version`) rather than shipping an image whose database layer is dead.
- **The production image shipped with no Prisma query engine at all.** The
  Dockerfile copied `node_modules/.prisma` out of the pnpm workspace by guessing
  two paths and swallowing total failure with `|| echo "WARNING: .prisma not
  found, skipping"`. Under pnpm the client is in neither place, so the guess
  always missed and the directory arrived empty. The client is now generated
  inside the pruned deployment tree, where the runtime resolves it.
- **Every healthcheck failed against a perfectly healthy API.** The server binds
  IPv4 `0.0.0.0`, but `localhost` resolves to `::1` first inside the container, so
  BusyBox `wget` got connection refused. The api container sat permanently
  `unhealthy`; worse, `install.sh` aborted with "API failed to become healthy" and
  `upgrade.sh` triggered its rollback — both on a working deployment. All
  container-internal probes now use `127.0.0.1`.
- **`docker compose build --parallel` raced and failed on a cold cache.** `api`
  and `worker` deliberately share one image tag, and two simultaneous exports onto
  it fail with `image "...": already exists`. `install.sh` and `upgrade.sh` now
  build `api web` explicitly; the worker uses the image api just built.
  `upgrade.sh` was the worse case — it builds `--no-cache`, so both sides always
  did real work and the race was near-certain on every source upgrade.

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

## Before releases — 2025-05-01

The first version, from before Taskflow published numbered releases (it was
never tagged). Everything since is in 1.0.0 above.

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
