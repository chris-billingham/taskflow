# Upgrading

## Standard Upgrade Procedure

```bash
# 1. Back up first
make backup

# 2. Pull latest code
git pull origin main

# 3. Pull new Docker images
docker-compose pull

# 4. Run any new migrations
docker-compose exec api npx prisma migrate deploy

# 5. Restart with new images
docker-compose up -d --force-recreate
```

The API is typically down for 5–15 seconds during `up -d`.

## Checking the Upgrade Succeeded

```bash
curl https://your-domain.example.com/health
docker-compose logs api | tail -20
```

## Zero-Downtime Upgrades

For production systems that cannot tolerate any downtime, run two API containers behind a load balancer and do a rolling restart. This requires external load balancer configuration not included in the default setup.

## Rollback

If the upgrade introduces a regression:

```bash
# Stop services
docker-compose down

# Check out the previous release tag
git checkout v1.0.0

# Restore the database backup
make restore

# Restart
docker-compose up -d
```

## Breaking Changes

Check [CHANGELOG.md](../../CHANGELOG.md) before each upgrade. Breaking changes are called out explicitly and include migration steps.

## Database Migrations

Migrations run automatically during `docker-compose exec api npx prisma migrate deploy`. They are applied in order and cannot be rolled back automatically — this is why a backup before upgrading is essential.

To view migration status:

```bash
docker-compose exec api npx prisma migrate status
```
