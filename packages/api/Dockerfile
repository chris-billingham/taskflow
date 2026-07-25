# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Pin the exact pnpm from package.json's packageManager field. Installing pnpm@9
# globally against a v6 lockfile + --frozen-lockfile diverges from CI/dev (pnpm 8).
RUN corepack enable && corepack prepare pnpm@8.15.1 --activate

# Cache dependency layer
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/api/package.json ./packages/api/
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ ./packages/shared/
COPY packages/api/ ./packages/api/

# Build shared then API
RUN pnpm --filter @taskflow/shared build
RUN pnpm --filter @taskflow/api exec prisma generate
RUN pnpm --filter @taskflow/api build

# Create self-contained deployment directory with prod deps only
RUN pnpm deploy --filter @taskflow/api --prod /build/deploy

# Overlay compiled output
RUN cp -r packages/api/dist /build/deploy/dist

# Copy generated Prisma client (contains platform-specific query engine binary)
RUN mkdir -p /build/deploy/node_modules/.prisma && \
    { cp -r packages/api/node_modules/.prisma/. /build/deploy/node_modules/.prisma/ 2>/dev/null || \
      cp -r node_modules/.prisma/. /build/deploy/node_modules/.prisma/ 2>/dev/null || \
      echo "WARNING: .prisma not found, skipping"; }

# Production stage
FROM node:20-alpine AS production

RUN addgroup -g 1001 -S taskflow && adduser -S taskflow -u 1001 -G taskflow
WORKDIR /app

COPY --from=builder /build/deploy .

# Prisma schema needed at runtime for migrations
COPY packages/api/prisma ./prisma

RUN chown -R taskflow:taskflow /app
USER taskflow

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
