# Upgrading

> **Recommended:** run `make upgrade` (or `bash scripts/upgrade.sh`). It pulls
> the latest source, takes a pre-upgrade backup, preserves the running images
> as a `:rollback` tag, migrates, and automatically rolls back to the previous
> images if the health check fails. The manual steps below are the fallback.

## Standard Upgrade Procedure

These are the same steps `scripts/upgrade.sh` runs, minus the automatic
rollback.

```bash
# 1. Back up first
make backup

# 2. Note the commit you are on, so you can return to it
git rev-parse HEAD

# 3. Pull latest code
git pull --ff-only

# 4. Build the new images from source
#    (Only if you set DOCKER_REGISTRY to a registry you publish to: replace this
#    with `docker compose -f docker-compose.yml pull api web worker`. Never pull
#    with the default DOCKER_REGISTRY=taskflow — that name resolves to Docker
#    Hub, where the project does not own the `taskflow` namespace.)
docker compose -f docker-compose.yml build api web

# 5. Run migrations with the NEW image, before any container is recreated
#    (`exec` into the running api would apply the OLD image's migrations)
docker compose -f docker-compose.yml run --rm api \
  sh -c "npx prisma migrate deploy --schema prisma/schema.prisma"

# 6. Restart with the new images
docker compose -f docker-compose.yml up -d
```

## Checking the Upgrade Succeeded

```bash
curl https://your-domain.example.com/health
docker compose -f docker-compose.yml logs api | tail -20
```

## Zero-Downtime Upgrades

Not supported. The API must run as a **single replica**: realtime sync keeps
its Socket.IO rooms and presence in process memory, so a second API container
would silently split clients between two servers that never see each other's
events. Expect the brief restart window above.

## Rollback

If the upgrade introduces a regression, return to the commit you noted in
step 2 and restore the pre-upgrade backup (migrations are not reversible):

```bash
docker compose -f docker-compose.yml down
git checkout <previous-commit>
make restore
docker compose -f docker-compose.yml up -d --build
```

`scripts/upgrade.sh` does the image half of this automatically if the new
version fails its health check.

## Breaking Changes

Check [CHANGELOG.md](../../CHANGELOG.md) before each upgrade. Breaking changes are called out explicitly and include migration steps.

## Database Migrations

Migrations run automatically during `docker compose -f docker-compose.yml exec api npx prisma migrate deploy`. They are applied in order and cannot be rolled back automatically — this is why a backup before upgrading is essential.

To view migration status:

```bash
docker compose -f docker-compose.yml exec api npx prisma migrate status
```
