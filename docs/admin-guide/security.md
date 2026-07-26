# Security

## Secrets Management

All sensitive values go in `.env` and are never committed to source control. The `.env.example` file shows which variables are needed with placeholder values.

**Rotate secrets** by updating `.env` and restarting services:

```bash
# Generate a new JWT secret
openssl rand -base64 32
# Update JWT_SECRET and JWT_REFRESH_SECRET in .env
# Restart API (all existing sessions will be invalidated)
docker-compose restart api
```

## Network Security

Expose only ports 80 and 443 to the internet. All other ports (3001, 5432, 6379, 9000) should be firewall-blocked:

```bash
ufw allow 80/tcp
ufw allow 443/tcp
ufw deny 3001/tcp
ufw deny 5432/tcp
ufw deny 6379/tcp
ufw deny 9000/tcp
ufw enable
```

## HTTPS

All production traffic must use HTTPS. Traefik terminates TLS with automatic
Let's Encrypt certificates and redirects HTTP to HTTPS; HSTS is applied via a
Traefik middleware. See [installation.md](installation.md).

## Authentication

- Passwords are hashed with bcrypt (cost factor 12)
- Access tokens expire after 15 minutes; websocket sessions are force-disconnected when their token expires
- Refresh tokens expire after 30 days, are stored in httpOnly `SameSite=Strict` cookies, are rotated on every use (reuse detection revokes all sessions), and are stored server-side only as sha256 hashes
- Rate limits: global 300 requests/minute per IP, plus stricter budgets on auth routes (login 5/15min, register 5/h, password reset 3/h, verify-email 10/15min) and uploads (60/10min). Limits are Redis-backed and key on the real client IP behind the proxy

## CORS

`CORS_ORIGIN` should be set to exactly the frontend URL (no wildcard). Example:

```env
CORS_ORIGIN=https://tasks.example.com
```

## File Uploads

- Maximum upload size is configurable via `MAX_FILE_SIZE_MB` (default 25 MB)
- Declared MIME types are verified against the file's magic bytes; SVG is not accepted
- Files are stored in S3/MinIO, not on the API container's disk
- Downloads are streamed through the authenticated API with `Content-Disposition: attachment` — the bucket is never exposed publicly

## Database

- Use a strong, unique password for `POSTGRES_PASSWORD`
- The PostgreSQL container is not exposed externally in the default setup
- Run `VACUUM ANALYZE` regularly on large installations for performance and to prevent bloat

## Dependency Updates

Keep dependencies updated to pick up security patches:

```bash
pnpm update --recursive
pnpm audit
```

Review and apply security advisories promptly, especially for `fastify`, `jsonwebtoken`, `bcrypt`, and `prisma`.

## Reporting Vulnerabilities

Please report security issues privately by emailing the maintainers rather than opening a public GitHub issue.
