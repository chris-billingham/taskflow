# Taskflow

A self-hosted task management application (Todoist clone) built with modern web technologies.

## Tech Stack

### Backend (`packages/api`)
- **Framework**: Fastify 5.x
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis with ioredis
- **Queue**: BullMQ
- **Real-time**: Socket.IO & WebSocket
- **Auth**: JWT with cookies
- **Email**: Nodemailer
- **Validation**: Zod
- **Security**: bcrypt for password hashing

### Frontend (`packages/web`)
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Routing**: React Router v6
- **Forms**: React Hook Form with resolvers
- **Drag & Drop**: dnd-kit
- **Real-time**: Socket.IO client
- **Icons**: Lucide React
- **Date Utils**: date-fns

### Shared (`packages/shared`)
- Shared TypeScript types and utilities

## Project Structure

```
taskflow/
├── packages/
│   ├── api/                    # Fastify backend
│   │   ├── prisma/
│   │   │   └── schema.prisma   # Database schema
│   │   ├── src/
│   │   │   └── server.ts       # Main server file
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── web/                    # React frontend
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   └── index.css
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── tailwind.config.js
│   │   └── vite.config.ts
│   └── shared/                 # Shared types
│       ├── src/
│       │   ├── types/
│       │   └── index.ts
│       └── package.json
├── docker-compose.dev.yml      # Local dev services
├── turbo.json                  # Turborepo config
├── package.json                # Root package.json
├── pnpm-workspace.yaml         # PNPM workspace config
├── .env.example                # Environment variables template
└── README.md
```

## Prerequisites

- **Node.js**: >= 18.0.0
- **pnpm**: >= 8.0.0
- **Docker**: For running PostgreSQL and Redis locally

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Environment Variables

Copy the example environment file and update with your values:

```bash
cp .env.example .env
```

Edit `.env` and configure:
- Database connection (`DATABASE_URL`)
- Redis connection (`REDIS_URL`)
- JWT secret (`JWT_SECRET`)
- Email settings (optional, for notifications)

### 3. Start Development Services

Start PostgreSQL and Redis using Docker Compose:

```bash
docker-compose -f docker-compose.dev.yml up -d
```

Verify services are running:

```bash
docker-compose -f docker-compose.dev.yml ps
```

### 4. Set Up Database

Generate Prisma client and run migrations:

```bash
cd packages/api
pnpm db:generate
pnpm db:migrate
```

### 5. Start Development Servers

From the root directory, start all packages in development mode:

```bash
pnpm dev
```

This will start:
- **API**: http://localhost:3001
- **Web**: http://localhost:5173

### 6. Verify Installation

- Visit http://localhost:5173 - You should see the Taskflow homepage
- Visit http://localhost:3001/health - You should see API health status
- Visit http://localhost:3001 - You should see API info

## Available Scripts

### Root Level

```bash
pnpm dev         # Start all packages in development mode
pnpm build       # Build all packages
pnpm clean       # Clean all build artifacts and node_modules
```

### API Package (`packages/api`)

```bash
pnpm dev              # Start API in watch mode
pnpm build            # Build for production
pnpm start            # Start production build
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run database migrations
pnpm db:push          # Push schema changes (no migration)
pnpm db:studio        # Open Prisma Studio
```

### Web Package (`packages/web`)

```bash
pnpm dev         # Start Vite dev server
pnpm build       # Build for production
pnpm preview     # Preview production build
```

## Development Workflow

### Working with the Database

1. **Update the schema**: Edit `packages/api/prisma/schema.prisma`
2. **Create a migration**: `cd packages/api && pnpm db:migrate`
3. **Regenerate client**: `pnpm db:generate` (usually done automatically)

### Adding Dependencies

Add to specific package:

```bash
# Add to API
pnpm --filter @taskflow/api add package-name

# Add to Web
pnpm --filter @taskflow/web add package-name

# Add to Shared
pnpm --filter @taskflow/shared add package-name
```

Add dev dependency to root:

```bash
pnpm add -Dw package-name
```

### Viewing Logs

API logs are formatted with `pino-pretty` in development. To view formatted logs:

```bash
cd packages/api
pnpm dev
```

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://taskflow:taskflow@localhost:5432/taskflow` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Secret for JWT signing | `your-super-secret-jwt-key` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `API_PORT` | API server port | `3001` |
| `NODE_ENV` | Environment mode | `development` |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |
| `SMTP_*` | Email configuration | - |

## Database Schema

The initial schema includes:

- **Users**: User accounts with authentication
- **Projects**: Task organization into projects
- **Tasks**: Individual tasks with priorities, due dates, and completion status

See `packages/api/prisma/schema.prisma` for the full schema.

## API Endpoints

The API scaffolding includes:

- `GET /` - API information
- `GET /health` - Health check endpoint

Additional endpoints will be added as features are implemented.

## Docker Services

### PostgreSQL

- **Port**: 5432
- **Database**: taskflow
- **User**: taskflow
- **Password**: taskflow

### Redis

- **Port**: 6379
- **Persistence**: Enabled with volume

### Managing Services

```bash
# Start services
docker-compose -f docker-compose.dev.yml up -d

# Stop services
docker-compose -f docker-compose.dev.yml down

# View logs
docker-compose -f docker-compose.dev.yml logs -f

# Stop and remove volumes (deletes all data)
docker-compose -f docker-compose.dev.yml down -v
```

## Troubleshooting

### Port Already in Use

If ports 3001 or 5173 are already in use:

1. Change `API_PORT` in `.env`
2. Update proxy configuration in `packages/web/vite.config.ts`
3. Update `VITE_API_URL` in `.env`

### Database Connection Issues

Ensure PostgreSQL is running:

```bash
docker-compose -f docker-compose.dev.yml ps
```

Test connection:

```bash
docker-compose -f docker-compose.dev.yml exec postgres psql -U taskflow -d taskflow
```

### Redis Connection Issues

Test Redis connection:

```bash
docker-compose -f docker-compose.dev.yml exec redis redis-cli ping
```

Should return `PONG`.

## Next Steps

The project scaffolding is complete. Next steps include:

1. Implement authentication (register, login, JWT handling)
2. Create task CRUD operations
3. Add project management
4. Implement real-time updates with Socket.IO
5. Add task filtering and sorting
6. Implement drag-and-drop task reordering
7. Add email notifications
8. Create background job processing with BullMQ

## Contributing

This is a self-hosted project. Feel free to customize and extend it to your needs.

## License

MIT
