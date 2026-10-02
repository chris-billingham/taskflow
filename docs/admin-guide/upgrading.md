# Upgrading

Taskflow is published as numbered releases, listed on the
[releases page](https://github.com/chris-billingham/taskflow/releases) with
what changed in each. `TASKFLOW_VERSION` in `.env` is the release you run.

```bash
make upgrade                    # the latest release
make upgrade version=1.2.0      # a chosen release
```

(`bash scripts/upgrade.sh [version]` does the same.) The upgrade:

1. checks out that release's tag, so `docker-compose.yml` and the scripts match its images;
2. takes a backup;
3. sets `TASKFLOW_VERSION` and pulls the release's images (nothing is built on the server);
4. restarts; the `migrate` service applies database migrations before the API and worker start;
5. waits for the API to report the new version, and goes back to the previous release if it doesn't.

Images come from `ghcr.io/chris-billingham/taskflow-api` and `taskflow-web`,
for `linux/amd64` and `linux/arm64`. To check which release is running:

```bash
docker compose -f docker-compose.yml exec api wget -qO- http://127.0.0.1:3001/health
```

### Coming from an install before versioned releases

Installs from before 1.0 built their images on the server, and their
`upgrade.sh` pulls `main` rather than a release. Update the checkout once,
then upgrade as usual:

```bash
git pull --ff-only
make upgrade
```

### Running your own build

`bash scripts/upgrade.sh --build` builds images from the current checkout and
sets `TASKFLOW_VERSION=local`. It's for testing changes; go back to a release
with `make upgrade`.

## Upgrading by hand

These are the steps `scripts/upgrade.sh` runs, without the automatic rollback:

```bash
# 1. Back up first
make backup

# 2. Check out the release's files
git fetch --tags && git checkout v1.2.0

# 3. Choose the release and pull its images
sed -i.bak 's/^TASKFLOW_VERSION=.*/TASKFLOW_VERSION=1.2.0/' .env
docker compose -f docker-compose.yml pull

# 4. Restart; migrations run first
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

## Going back to an earlier release

`scripts/upgrade.sh` goes back by itself if the new version doesn't start.
To go back later, run `make upgrade version=<the earlier release>`.
Migrations aren't reversed, so if the earlier release can't run on the newer
database, restore the backup taken before the upgrade as well:

```bash
make upgrade version=1.1.0
make restore file=backups/<the pre-upgrade archive>.tar.gz
```

## Breaking Changes

Check [CHANGELOG.md](../../CHANGELOG.md) before each upgrade. Breaking changes are called out explicitly and include migration steps.

## Database Migrations

The `migrate` service applies pending migrations every time the stack starts, before the API and worker. They are applied in order and can't be rolled back automatically, which is why every upgrade takes a backup first. `make migrate` runs them on their own.

To view migration status:

```bash
docker compose -f docker-compose.yml exec api ./node_modules/.bin/prisma migrate status
```
