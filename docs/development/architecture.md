# Architecture

## Overview

Taskflow is a monorepo containing three packages:

```
packages/
├── api/     — Fastify REST API + WebSocket server
├── web/     — React single-page app
└── shared/  — Shared TypeScript types
```

## API Architecture

### Request lifecycle

```
HTTP Request
  → Fastify router
    → authenticate middleware (validates JWT)
      → route handler (parses + validates input with Zod)
        → service layer (business logic, Prisma queries)
          → response
```

### Layers

| Layer | Directory | Responsibility |
|-------|-----------|----------------|
| Routes | `src/routes/` | HTTP handlers, input parsing, Zod validation |
| Services | `src/services/` | Business logic, database operations |
| Schemas | `src/schemas/` | Zod schemas shared between validation and types |
| Middleware | `src/middleware/` | Auth, authorization |
| Config | `src/config/` | Env, Prisma, Redis, S3 clients |
| Jobs | `src/jobs/` | BullMQ background job processors |
| WebSocket | `src/websocket/` | Real-time event broadcasting |
| Errors | `src/errors/` | AppError hierarchy |

### Authentication

- Login returns an **access token** (15min TTL) and a **refresh token** (7 day TTL)
- Access token is sent as `Authorization: Bearer <token>`
- Refresh token is stored in an httpOnly cookie
- `/api/v1/auth/refresh` issues a new access token using the cookie

### Real-time

The WebSocket server runs alongside the Fastify HTTP server on the same port. It handles:

- Task create / update / delete / complete events
- Comment events
- Presence (who is online, who is viewing a project)
- Typing indicators

Events are scoped to **workspaceId** — clients only receive events for their workspace.

### Background Jobs (BullMQ)

Jobs run in a separate worker process (`src/worker.ts`). Current job types:

| Queue | Purpose |
|-------|---------|
| `notifications` | Send email / push notifications |
| `reminders` | Deliver task reminders at the scheduled time |
| `activity` | Write activity log entries asynchronously |

## Frontend Architecture

### Data flow

```
User interaction
  → Component (React)
    → Zustand action (optimistic update)
      → TanStack Query mutation (API call)
        → Zustand store update (settled state)
          → Component re-render
```

### State management

| Store | Purpose |
|-------|---------|
| `authStore` | Current user, authentication state |
| `workspaceStore` | Current workspace and members |
| `projectStore` | Project list |
| `taskStore` | Task list, optimistic updates |
| `notificationStore` | Notification list and unread count |
| `uiStore` | Modal state, sidebar open/closed |

TanStack Query manages caching and background refetching. Zustand stores hold UI-local and optimistic state.

### Routing

React Router v6. All routes under `AppLayout` require authentication (via `ProtectedRoute`).

```
/login              — Login page
/register           — Registration
/today              — Today view
/upcoming           — Upcoming view
/projects/:id       — Project view (list, board, calendar)
/labels/:id         — Label view
/filters/:id        — Filter view
/filters-labels     — Labels & filters management
/settings/*         — Settings pages
```

### Component structure

```
components/
├── ui/          — Design system primitives (Button, Input, Modal, Skeleton, ...)
├── task/        — TaskItem, TaskDetail, TaskForm, ...
├── project/     — ProjectList, ProjectItem, AddProjectModal, ...
├── board/       — BoardView, BoardColumn, BoardCard
├── calendar/    — CalendarView, CalendarDay
├── layout/      — Sidebar, Topbar
└── ...
```

## Database Schema

Key models and relationships:

```
Workspace
  └─ has many Members (User)
  └─ has many Projects

Project
  └─ belongs to Workspace
  └─ has many Sections
  └─ has many Tasks

Task
  └─ belongs to Project
  └─ belongs to Section (optional)
  └─ has parent Task (optional — subtasks)
  └─ has many Labels (M2M)
  └─ has many Comments
  └─ has many Attachments
  └─ has many Reminders
  └─ has many ActivityLog entries

User
  └─ has many Labels
  └─ has many SavedFilters
  └─ has Settings
  └─ has many Notifications
```

## Infrastructure

```
Internet
  → Nginx (reverse proxy, TLS termination)
    → API container (Fastify, port 3001)
    → Web container (Nginx serving built React app)

API container
  → PostgreSQL container
  → Redis container
  → MinIO container (S3-compatible object storage)
```

The `docker-compose.yml` defines all services. In production, each service runs in its own container with Docker named volumes for persistence.
