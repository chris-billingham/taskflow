# Taskflow

A self-hosted, open-source task management application — a Todoist-style workflow running entirely on your own infrastructure.

## Features

- **Tasks** — due dates and times, deadlines, priorities, durations, descriptions, sub-tasks and reminders
- **Projects** — color-coded projects with sections, one level of sub-projects, favorites and archiving
- **Labels & Filters** — personal labels, and saved filters written in a text query language (`today & p1 & @work`)
- **List / Board / Calendar views** — list, Kanban board, and week or month calendar
- **Workspaces and sharing** — share team projects with invited members (Owner, Admin, Member and Guest roles), or share a single project with someone as an admin, member, commenter or viewer
- **Real-time updates** — task, section, project and comment changes broadcast live over WebSockets, with who's viewing a task and who's typing
- **Comments & Activity** — per-task discussion with Markdown and @mentions, plus an audit log
- **File Attachments** — drag-and-drop uploads stored in the bundled Garage server or any S3-compatible bucket
- **Reminders** — time-based reminders delivered by browser push and in the app
- **Notifications** — in-app, browser push, and email (immediately or as a daily/weekly digest)
- **Project templates** — start a project from a built-in template or save your own
- **Global Search** — full-text search across tasks, projects, and comments
- **Quick Add** — natural language input ("Buy milk tomorrow p1 #work")
- **Recurring Tasks** — daily, weekly, monthly, yearly and custom rules, from the task panel or Quick Add ("every Monday")
- **Bulk actions** — select several tasks to complete, reschedule, prioritise, label, move or delete them together
- **Works offline** — installable as an app; changes made offline are kept and sent when you reconnect
- **Import and export** — your data as a ZIP, and imports from Todoist and CSV
- **Integrations** — calendar feeds for any calendar app, signed webhooks, and personal access tokens for the REST API (with a published OpenAPI document and a Swift client)
- **Security** — two-factor sign-in, single sign-on through OpenID Connect, and a list of signed-in devices you can sign out
- **Dark Mode** — light, dark, or follow the system
- **Keyboard Shortcuts** — Quick Add, search, a command palette, and moving through and acting on tasks from the keyboard (press `?` in the app)
- **Mobile Responsive** — responsive layout with a drawer sidebar on phones
- **Admin console** — invite-only sign-up by default, user management, suspension and password resets

### Not yet implemented

- **Native iOS app**. It's planned; the API, push support (APNs) and Swift client it will use are in place.
- **Email reminders**. Reminders are always delivered by push; the email path exists on the server but can't be chosen in the app.
- **Changing your email address**. An account's email can't be changed after sign-up, by its owner or an admin.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | Fastify 5, TypeScript, Zod |
| Database | PostgreSQL + Prisma ORM |
| Cache / Queue | Redis + BullMQ |
| Real-time | WebSocket + Socket.IO |
| Auth | JWT (access + refresh tokens, httpOnly cookies) |
| Email | Nodemailer |
| Storage | S3-compatible (bundled Garage, or AWS S3 and others) |
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS 4 (brand tokens in `src/index.css`) |
| Server data | TanStack Query |
| Client state | Zustand |
| Forms | React Hook Form + Zod |
| Drag & Drop | dnd-kit |
| Monorepo | pnpm workspaces + Turborepo |
| Containers | Docker + Docker Compose |

## Quick Start

### Prerequisites

- **Node.js** >= 22.12 (24 LTS recommended — see `.nvmrc`)
- **pnpm** 10 (`corepack enable`, which picks up the version pinned in `package.json`, or `npm install -g pnpm@10`)
- **Docker** >= 24 with Compose v2

### 1. Clone and install

```bash
git clone https://github.com/chris-billingham/taskflow.git
cd taskflow
pnpm install
```

### 2. Configure environment

```bash
cp packages/api/.env.example packages/api/.env
```

The defaults match `docker-compose.dev.yml`, so no edits are needed to get
running. This is the file the API dev server and the Prisma CLI read; the
repo-root `.env.example` is the separate **production** template used by
`docker-compose.yml`.

### 3. Start infrastructure

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 4. Run migrations

```bash
pnpm --filter @taskflow/api db:migrate
```

### 5. Start the app

```bash
pnpm dev
```

- **Web app**: http://localhost:31779
- **API**: http://localhost:3001
- **API Docs**: http://localhost:3001/api/docs
- **Health check**: http://localhost:3001/health

### 6. Register your account

Open http://localhost:31779/register and create your first user.

## Production Deployment

See [docs/admin-guide/installation.md](docs/admin-guide/installation.md) for a full production deployment guide using Docker Compose with HTTPS.

Quick production start:

```bash
bash scripts/install.sh
```

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/user-guide/getting-started.md) | First steps, creating tasks and projects |
| [Tasks](docs/user-guide/tasks.md) | Full task reference |
| [Projects](docs/user-guide/projects.md) | Project management |
| [Keyboard Shortcuts](docs/user-guide/keyboard-shortcuts.md) | All keyboard shortcuts |
| [Installation](docs/admin-guide/installation.md) | Production setup |
| [Configuration](docs/configuration.md) | All environment variables |
| [User Management](docs/admin-guide/user-management.md) | Admin role, creating and suspending accounts |
| [Single Sign-On](docs/admin-guide/single-sign-on.md) | Signing in through Authentik, Keycloak or Google Workspace |
| [Backup & Restore](docs/admin-guide/backup-restore.md) | Data backup procedures |
| [Importing and Exporting](docs/user-guide/import-export.md) | Your data as a ZIP; imports from Todoist and CSV |
| [Signing In Securely](docs/user-guide/devices-and-tokens.md) | Two-factor sign-in, signed-in devices, personal access tokens |
| [Architecture](docs/development/architecture.md) | System design |
| [Building an API Client](docs/development/api-clients.md) | Sign-in for apps, access tokens |
| [Webhooks](docs/development/webhooks.md) | Events, payloads and checking signatures |
| [Releasing](docs/development/releasing.md) | Publishing a version: images and release notes |
| [Development Setup](docs/development/setup.md) | Local dev guide |
| [API Reference](http://localhost:3001/api/docs) | Interactive OpenAPI docs |

## Scripts

### Root

```bash
pnpm dev          # Start all packages in development mode
pnpm build        # Build all packages
pnpm test:unit    # Unit tests (api + web)
pnpm test:ci      # Unit + API integration tests, as CI runs them
pnpm test:e2e     # Playwright suite (needs both dev servers running)
pnpm lint         # ESLint across the workspace
pnpm typecheck    # tsc --noEmit across the workspace
pnpm clean        # Remove build artifacts
```

### API (`packages/api`)

```bash
pnpm dev              # Watch mode
pnpm build            # Compile TypeScript
pnpm test             # Unit + integration tests
pnpm test:unit        # Unit tests only
pnpm test:integration # Route tests (services mocked; no DB or Redis needed)
pnpm test:db          # Service tests against a real Postgres (dev compose DB)
pnpm db:migrate       # Run migrations
pnpm db:studio        # Open Prisma Studio
pnpm db:seed          # Seed sample data
```

### Web (`packages/web`)

```bash
pnpm dev          # Vite dev server
pnpm build        # Production build
pnpm preview      # Preview production build
pnpm test         # Run tests
```

### Makefile shortcuts

```bash
make start        # Start all services
make stop         # Stop all services
make logs         # Tail logs
make backup       # Backup database
make restore      # Restore from backup
```

## Project Structure

```
taskflow/
├── packages/
│   ├── api/                    # Fastify backend
│   │   ├── prisma/
│   │   │   └── schema.prisma   # Database schema
│   │   └── src/
│   │       ├── config/         # DB, Redis, S3, env
│   │       ├── errors/         # Error classes
│   │       ├── jobs/           # BullMQ background jobs
│   │       ├── middleware/     # Auth middleware
│   │       ├── routes/         # Fastify route handlers
│   │       ├── services/       # Business logic
│   │       ├── utils/          # Helpers
│   │       ├── websocket/      # WebSocket server
│   │       └── server.ts       # Entry point
│   ├── web/                    # React frontend
│   │   └── src/
│   │       ├── components/     # UI components
│   │       ├── hooks/          # Custom hooks
│   │       ├── layouts/        # Page layouts
│   │       ├── pages/          # Route pages
│   │       ├── services/       # API client
│   │       ├── queries/        # TanStack Query: server data and actions
│   │       └── stores/         # Zustand: client state
│   ├── contract/               # Zod schemas shared by the API and web app
│   └── e2e/                    # Playwright end-to-end tests
├── clients/swift/              # Swift API client, generated from openapi.json
├── openapi.json                # The API's OpenAPI document (generated)
├── docs/                       # Documentation
├── scripts/                    # Install and maintenance scripts
├── docker-compose.yml          # Production Compose
├── docker-compose.dev.yml      # Development services
├── Makefile                    # Common commands
└── .env.example                # Environment template
```

## API

The REST API is documented interactively at `/api/docs` (Swagger UI). All endpoints require a Bearer JWT token except auth routes.

Base URL: `/api/v1`

Key endpoint groups:
- `POST /auth/login` — authenticate
- `GET/POST /tasks` — task management
- `GET/POST /projects` — project management
- `GET /search` — full-text search
- `GET /health` — service health

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution guide, code standards, and PR process.

## License

MIT — see [LICENSE](LICENSE).
