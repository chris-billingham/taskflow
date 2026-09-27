# Upgrading

> **Recommended:** run `make upgrade` (or `bash scripts/upgrade.sh`). It pulls
> the latest source, takes a pre-upgrade backup, preserves the running images
> as a `:rollback` tag, migrates, and automatically rolls back to the previous
> images if the health check fails. The manual steps below are the fallback.

## Standard Upgrade Procedure

These are the same steps `scripts/upgrade.sh` runs, minus the automatic
rollback. (A plain `docker compose up -d` also applies pending migrations now:
the `migrate` service runs first and the API and worker wait for it. The
explicit step below keeps migration failures visible before anything restarts.)

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

## Moving from MinIO to Garage

Versions before October 2026 bundled MinIO for attachments. MinIO's images
have been withdrawn from Docker Hub and quay.io, so current versions bundle
Garage instead, and `upgrade.sh` stops if your `.env` hasn't been updated.
Garage can't read MinIO's data directory, so existing files move across via a
backup:

```bash
# 1. BEFORE pulling the new version: take a backup with the old scripts,
#    while MinIO is still running. Note the archive name it prints.
make backup

# 2. Add the new storage settings to .env
echo "S3_ACCESS_KEY=GK$(openssl rand -hex 12)" >> .env
echo "S3_SECRET_KEY=$(openssl rand -hex 32)"   >> .env
echo "GARAGE_RPC_SECRET=$(openssl rand -hex 32)" >> .env
#    ...and delete the old MINIO_ROOT_USER / MINIO_ROOT_PASSWORD / MINIO_BUCKET
#    and any earlier S3_ACCESS_KEY / S3_SECRET_KEY lines.

# 3. Upgrade as usual
make upgrade

# 4. Copy the files from that backup into Garage
mkdir -p /tmp/taskflow-files
tar -xzf backups/<archive>.tar.gz -C /tmp/taskflow-files
docker compose -f docker-compose.yml run --rm --no-deps \
  -v /tmp/taskflow-files/<archive>/files:/in:ro rclone copy /in store:taskflow

# 5. Once attachments open correctly, remove the old container and volume
docker compose -f docker-compose.yml up -d --remove-orphans
docker volume rm taskflow_minio_data   # name may differ: docker volume ls
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
