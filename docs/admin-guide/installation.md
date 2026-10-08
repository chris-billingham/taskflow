# Installation Guide

## Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| OS | Linux (Ubuntu 22.04+) | Ubuntu 24.04 LTS |
| RAM | 2 GB | 4 GB |
| Disk | 20 GB | 50 GB |
| Docker | 24.0+ | Latest |
| Docker Compose | v2.20+ | Latest |

A domain name with a DNS A record pointing to your server is required for
HTTPS — Traefik obtains Let's Encrypt certificates automatically via the
HTTP-01 challenge, so port 80 must be reachable from the internet.

## Quick Install (Recommended)

```bash
git clone https://github.com/chris-billingham/taskflow.git
cd taskflow
bash scripts/install.sh
```

The installer will:
- Generate cryptographically secure secrets and write `.env`
- Prompt for your domain name and Let's Encrypt email
- Pull the latest release's images from GHCR (or build from source if no release is published yet), and record the version as `TASKFLOW_VERSION`
- Start everything, creating the database schema before the API starts, and wait for it to become healthy

Access the app at `https://your-domain.example.com`.

## Manual Installation

### 1. Clone the repository

```bash
git clone https://github.com/chris-billingham/taskflow.git
cd taskflow
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`. Required variables:

```env
# Domain + TLS (used by Traefik for routing and Let's Encrypt)
DOMAIN=your-domain.example.com
ACME_EMAIL=you@example.com

# Datastore credentials — generate with: openssl rand -hex 24
POSTGRES_PASSWORD=CHANGE_ME
REDIS_PASSWORD=CHANGE_ME

# Object storage (Garage) — the formats are strict:
S3_ACCESS_KEY=CHANGE_ME       # GK$(openssl rand -hex 12)
S3_SECRET_KEY=CHANGE_ME       # openssl rand -hex 32
GARAGE_RPC_SECRET=CHANGE_ME   # openssl rand -hex 32

# Auth — generate with: openssl rand -base64 32 (minimum 32 characters)
JWT_SECRET=CHANGE_ME
JWT_REFRESH_SECRET=CHANGE_ME

# Links in emails go to https://$DOMAIN. Set APP_URL only if people reach
# the app somewhere else.
# APP_URL=https://your-domain.example.com

# Email (optional — requires a REACHABLE SMTP server; the API verifies the
# connection at boot and only enables email features when it succeeds)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=yourpassword
SMTP_FROM=noreply@your-domain.example.com
```

See [configuration.md](configuration.md) for all available variables.

### 3. Choose a release and pull its images

> **Always pass `-f docker-compose.yml` in production.** A bare
> `docker compose up` also merges `docker-compose.override.yml`, which is a
> DEVELOPMENT override (dev servers, exposed debug ports, self-signed TLS).
> The `make` targets and scripts do this for you.

Pick a version from the [releases page](https://github.com/chris-billingham/taskflow/releases)
and check out its files, so the compose file matches the images:

```bash
git checkout v1.2.0
echo "TASKFLOW_VERSION=1.2.0" >> .env
docker network create traefik
docker compose -f docker-compose.yml pull
```

### 4. Start

The `migrate` service creates the database schema, then the API and worker start:

```bash
docker compose -f docker-compose.yml up -d
```

### 5. Verify

```bash
curl https://your-domain.example.com/health
```

Should return `{"status":"ok",...}`.

## HTTPS

Traefik handles TLS end-to-end: certificates are requested from Let's Encrypt
automatically on first start (HTTP-01 challenge on port 80), stored in the
`letsencrypt` volume, renewed automatically, and HTTP is redirected to HTTPS.
No certbot, no manual renewal, no nginx TLS configuration.

If certificates fail to issue, check that DNS resolves to this server and
port 80 is reachable, then inspect `docker compose -f docker-compose.yml logs traefik`.

## Firewall

Open only ports 80 and 443:

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

The database, Redis, Garage and the API itself are only reachable on the
internal Docker network — none of them publish host ports in production.

## Updating

Run `make upgrade` for the latest release, or `make upgrade version=1.2.0`.
It backs up first, pulls the release's images, migrates, and goes back to the
previous release if the new one doesn't start. See [upgrading.md](upgrading.md).
