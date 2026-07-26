# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Pin the exact pnpm from package.json's packageManager field (matches CI/dev, pnpm 8).
RUN corepack enable && corepack prepare pnpm@8.15.1 --activate

# Cache dependency layer
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/web/package.json ./packages/web/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/shared/ ./packages/shared/
COPY packages/web/ ./packages/web/

RUN pnpm --filter @taskflow/shared build
RUN pnpm --filter @taskflow/web build

# Production stage
FROM nginx:alpine AS production

COPY packages/web/nginx.conf /etc/nginx/nginx.conf
COPY packages/web/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=builder /app/packages/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/index.html || exit 1

CMD ["nginx", "-g", "daemon off;"]
