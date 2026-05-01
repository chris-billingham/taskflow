# Installation Guide

## Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| OS | Linux (Ubuntu 22.04+) | Ubuntu 24.04 LTS |
| RAM | 2 GB | 4 GB |
| Disk | 20 GB | 50 GB |
| Docker | 24.0+ | Latest |
| Docker Compose | v2.20+ | Latest |

A domain name with a DNS A record pointing to your server is required for HTTPS.

## Quick Install (Recommended)

```bash
git clone https://github.com/your-org/taskflow.git
cd taskflow
bash scripts/install.sh
```

The installer will:
- Generate cryptographically secure secrets
- Prompt for your domain name and SMTP settings
- Write `.env`
- Pull Docker images
- Run database migrations
- Obtain a Let's Encrypt TLS certificate (via Certbot)
- Start all services

Access the app at `https://your-domain.example.com`.

## Manual Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-org/taskflow.git
cd taskflow
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values. Required variables:

```env
# Database
DATABASE_URL=postgresql://taskflow:CHANGE_ME@postgres:5432/taskflow
POSTGRES_PASSWORD=CHANGE_ME

# Redis
REDIS_URL=redis://redis:6379

# Auth — generate with: openssl rand -base64 32
JWT_SECRET=CHANGE_ME
JWT_REFRESH_SECRET=CHANGE_ME

# App URL
APP_URL=https://your-domain.example.com
CORS_ORIGIN=https://your-domain.example.com

# Email (optional but recommended)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=yourpassword
SMTP_FROM=noreply@your-domain.example.com
```

See [configuration.md](configuration.md) for all available variables.

### 3. Start services

```bash
docker-compose up -d
```

### 4. Run migrations

```bash
docker-compose exec api npx prisma migrate deploy
```

### 5. Verify

```bash
curl https://your-domain.example.com/health
```

Should return `{"status":"ok",...}`.

## HTTPS with Let's Encrypt

The production `docker-compose.yml` includes an Nginx reverse proxy. To obtain a certificate:

```bash
docker-compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d your-domain.example.com \
  --email you@example.com \
  --agree-tos
```

Then restart Nginx:

```bash
docker-compose restart nginx
```

Certificates auto-renew via a Certbot container running on a daily schedule.

## Firewall

Open only ports 80 and 443:

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## Updating

See [upgrading.md](upgrading.md).
