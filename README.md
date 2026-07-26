# Taskflow

A self-hosted, open-source task management application — full-featured and Todoist-compatible, running entirely on your own infrastructure.

## Features

- **Tasks** — create, complete, prioritize, set due dates, add descriptions and sub-tasks
- **Projects** — organize tasks into color-coded projects with sections
- **Labels & Filters** — tag tasks and save complex filters for later
- **Board / Calendar views** — switch between list, Kanban board, and calendar
- **Real-time collaboration** — live presence indicators, collaborative editing via WebSockets
- **Comments & Activity** — per-task discussion and audit log
- **File Attachments** — drag-and-drop uploads stored in S3 or MinIO
- **Reminders** — time-based notifications delivered via email or browser push
- **Templates** — create and apply task templates for repeatable workflows
- **Global Search** — full-text search across tasks, projects, and comments
- **Quick Add** — natural language input ("Buy milk tomorrow p1 #work")
- **Recurring Tasks** — daily, weekly, monthly, and custom recurrence rules
- **Dark Mode** — full dark-mode support
- **Keyboard Shortcuts** — complete keyboard navigation
- **Mobile Responsive** — works on all screen sizes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | Fastify 5, TypeScript, Zod |
| Database | PostgreSQL + Prisma ORM |
| Cache / Queue | Redis + BullMQ |
| Real-time | WebSocket + Socket.IO |
| Auth | JWT (access + refresh tokens, httpOnly cookies) |
| Email | Nodemailer |
| Storage | S3-compatible (AWS S3 or MinIO) |
| Frontend | React 18, TypeScript, Vite |
| Styling | Tailwind CSS |
| State | Zustand + TanStack Query |
| Forms | React Hook Form + Zod |
| Drag & Drop | dnd-kit |
| Monorepo | pnpm workspaces + Turborepo |
| Containers | Docker + Docker Compose |

## Quick Start

### Prerequisites

- **Node.js** >= 18
- **pnpm** >= 8 (`npm install -g pnpm`)
- **Docker** >= 24 with Compose v2

### 1. Clone and install

```bash
git clone https://github.com/your-org/taskflow.git
cd taskflow
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — the minimum required variables:

```env
DATABASE_URL=postgresql://taskflow:taskflow@localhost:5432/taskflow
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me-to-a-long-random-string
```

### 3. Start infrastructure

```bash
docker-compose -f docker-compose.dev.yml up -d
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
| [Configuration](docs/admin-guide/configuration.md) | All environment variables |
| [User Management](docs/admin-guide/user-management.md) | Admin role, creating and suspending accounts |
| [Backup & Restore](docs/admin-guide/backup-restore.md) | Data backup procedures |
| [Architecture](docs/development/architecture.md) | System design |
| [Development Setup](docs/development/setup.md) | Local dev guide |
| [API Reference](http://localhost:3001/api/docs) | Interactive OpenAPI docs |

## Scripts

### Root

```bash
pnpm dev          # Start all packages in development mode
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm clean        # Remove build artifacts
```

### API (`packages/api`)

```bash
pnpm dev              # Watch mode
pnpm build            # Compile TypeScript
pnpm test             # Run all tests
pnpm test:unit        # Unit tests only
pnpm test:integration # Integration tests (requires running DB + Redis)
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
│   │       ├── docs/           # OpenAPI spec
│   │       ├── errors/         # Error classes
│   │       ├── jobs/           # BullMQ background jobs
│   │       ├── middleware/     # Auth middleware
│   │       ├── routes/         # Fastify route handlers
│   │       ├── schemas/        # Zod validation schemas
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
│   │       └── stores/         # Zustand stores
│   └── shared/                 # Shared TypeScript types
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
