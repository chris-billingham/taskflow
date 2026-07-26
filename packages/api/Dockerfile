# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Prisma needs OpenSSL, and needs to be able to SEE which version it has.
# node:20-alpine ships libssl.so.3 but no `openssl` binary, so Prisma's platform
# detection fell back to its "openssl-1.1.x" default and generated a client
# bound to engines for an OpenSSL that isn't in the image. The result was a
# schema engine that could not load its shared library at all — `prisma migrate
# deploy` died with "Could not parse schema engine response", i.e. no production
# install could create its database schema. Required in BOTH stages: here so
# `prisma generate` resolves the right engine, and at runtime so it loads.
RUN apk add --no-cache openssl

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

# Create self-contained deployment directory with prod deps only.
# NOTE: `prisma` (the CLI) is deliberately a prod dependency so it survives
# this pruning — install/upgrade run `npx prisma migrate deploy` inside this
# image, and without a local install npx would download WHATEVER the latest
# Prisma major is from npmjs.org at migration time (or die without egress).
RUN pnpm deploy --filter @taskflow/api --prod /build/deploy

# Overlay compiled output
RUN cp -r packages/api/dist /build/deploy/dist

# The schema lives in the deployment tree: needed at runtime for `migrate deploy`,
# and needed here so the client is generated against it in place (below).
RUN cp -r packages/api/prisma /build/deploy/prisma

# Generate the Prisma client INSIDE the pruned deployment tree, so the client and
# its engine binary end up exactly where the runtime resolves them.
#
# This replaces copying node_modules/.prisma out of the pnpm workspace, which
# guessed at two possible source paths and then tolerated total failure with
# `|| echo "WARNING: .prisma not found, skipping"`. Under pnpm the generated
# client is in neither of those places, so the guess always missed, the warning
# scrolled past in build output nobody reads, and the image shipped with an empty
# .prisma directory and no query engine.
RUN cd /build/deploy && ./node_modules/.bin/prisma generate --schema prisma/schema.prisma

# Prove the engines are present AND loadable, rather than shipping an image whose
# database layer cannot work. `prisma -v` executes both engines to report their
# versions, so it fails exactly the way `migrate deploy` did when the engine
# could not load libssl — turning a silent broken image into a failed build.
RUN cd /build/deploy && \
    find . -name 'libquery_engine*' -o -name 'schema-engine*' && \
    ./node_modules/.bin/prisma version

# Production stage
FROM node:20-alpine AS production

# See the builder stage: Prisma's engines link against libssl and Prisma probes
# the `openssl` binary to pick which build to load.
RUN apk add --no-cache openssl

RUN addgroup -g 1001 -S taskflow && adduser -S taskflow -u 1001 -G taskflow
WORKDIR /app

COPY --from=builder /build/deploy .

RUN chown -R taskflow:taskflow /app
USER taskflow

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/server.js"]
