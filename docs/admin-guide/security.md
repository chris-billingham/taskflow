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

All production traffic must use HTTPS. The default Nginx configuration redirects HTTP to HTTPS. See [installation.md](installation.md) for Let's Encrypt setup.

## Authentication

- Passwords are hashed with bcrypt (cost factor 10)
- Access tokens expire after 15 minutes
- Refresh tokens expire after 7 days and are stored in httpOnly cookies (not accessible to JavaScript)
- Failed login attempts are not rate-limited by default — consider adding a reverse proxy rate limit rule

## CORS

`CORS_ORIGIN` should be set to exactly the frontend URL (no wildcard). Example:

```env
CORS_ORIGIN=https://tasks.example.com
```

## File Uploads

- Maximum upload size is configurable via `MAX_FILE_SIZE_MB` (default 50 MB)
- Files are stored in S3/MinIO, not on the API container's disk
- Presigned URLs are used for downloads — direct bucket access is not exposed publicly

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
