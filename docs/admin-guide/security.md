# Security

## Secrets Management

All sensitive values go in `.env` and are never committed to source control. The `.env.example` file shows which variables are needed with placeholder values.

**Rotate secrets** by updating `.env` and restarting services:

```bash
# Generate a new JWT secret
openssl rand -base64 32
# Update JWT_SECRET and JWT_REFRESH_SECRET in .env
# Restart API (all existing sessions will be invalidated)
docker compose -f docker-compose.yml restart api
```

Rotating `JWT_REFRESH_SECRET` signs every stored refresh token out at once, so
all users on all devices must log in again. Restart `worker` alongside `api`
whenever you rotate a value both of them read.

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
- Refresh tokens expire after 30 days, are stored in httpOnly `SameSite=Strict` cookies (native apps hold theirs themselves), are rotated on every use (reuse detection revokes all sessions), and are stored server-side only as sha256 hashes
- People can see and sign out their devices, and create personal access tokens (read-only or read-write, optionally expiring, stored as sha256 hashes). Tokens can't change passwords, manage sessions or tokens, delete accounts or reach the admin console
- Two-factor sign-in (TOTP, RFC 6238) with ten single-use recovery codes. After the password, `/auth/login` returns a five-minute challenge instead of a session; a code then completes the sign-in. Codes can't be replayed (the last accepted time step is stored), and ten wrong codes in 15 minutes lock that account's second step for 15 minutes, whatever the address. Setting up, replacing recovery codes and turning it off all need the password; turning it off also needs a code. TOTP secrets are stored in the database (recovery codes only as sha256 hashes), so treat database backups as sensitive
- Single sign-on (OpenID Connect) uses the authorization code flow with PKCE, state and nonce; the pending sign-in is held in a signed, httpOnly cookie for 10 minutes. Accounts are linked by the provider's subject, or by email only when the provider marks it verified, and new accounts follow the sign-up policy
- Deleting an account requires the account's password
- Rate limits: global 300 requests/minute per IP, plus stricter budgets on auth routes (login 5/15min, two-factor step 10/15min, register 5/h, password reset 3/h, verify-email 10/15min) and uploads (60/10min). Limits are Redis-backed, so they survive restarts and are shared across processes. `RATE_LIMIT_MULTIPLIER` scales them all (minimum 1), for teams that share one office IP

### `TRUST_PROXY_HOPS` and rate limiting

Every limit above is counted against `request.ip`, which is derived from
`X-Forwarded-For` by trusting exactly `TRUST_PROXY_HOPS` addresses nearest the
server. Getting this wrong disables the limits in one direction or the other:

- **Too high** (or the old `trustProxy: true`, which trusts the whole chain):
  the client's own `X-Forwarded-For` is believed, so rotating that header hands
  an attacker a fresh bucket per request — the login limit stops existing.
- **Too low**: every request keys on your proxy's address, making all traffic
  share one bucket, so a handful of failed logins by anyone locks out login for
  everyone.

`1` is correct for the shipped stack (client → Traefik → API). Raise it by one
for each additional proxy you place in front, such as a CDN.

Each trusted hop must also connect from a network listed in
`TRUST_PROXY_ADDRS` (default: loopback and the private ranges Docker uses), so
a client that reaches the API directly can't set its own key by sending
`X-Forwarded-For`.

## Calendar Feeds and Webhooks

- A calendar feed's URL is its only credential: 32 random characters, read-only, limited to what its owner can still see, and replaceable from the feed dialog. Feeds stop working when their owner is suspended or loses access to the project.
- Webhook deliveries are signed (HMAC-SHA256 over a timestamp and the body) and never follow redirects. By default they refuse private, loopback, link-local and other internal addresses, checked on the address actually connected to, after DNS; `WEBHOOK_ALLOW_PRIVATE_NETWORKS=true` lifts this. Only a project's admins can add webhooks to it.

## CORS

`CORS_ORIGIN` should be set to exactly the frontend URL (no wildcard). Example:

```env
CORS_ORIGIN=https://tasks.example.com
```

## File Uploads

- Maximum upload size is configurable via `MAX_FILE_SIZE_MB` (default 25 MB)
- Declared MIME types are verified against the file's magic bytes; SVG is not accepted
- Files are stored in S3-compatible storage (bundled Garage), not on the API container's disk
- Downloads are streamed through the authenticated API with `Content-Disposition: attachment` — the bucket is never exposed publicly

## Database

- Use a strong, unique password for `POSTGRES_PASSWORD`
- The PostgreSQL container is not exposed externally in the default setup
- Run `VACUUM ANALYZE` regularly on large installations for performance and to prevent bloat

## Dependency Updates

Security fixes reach an install through releases: run `make upgrade` to move
to the latest one (see [Upgrading](upgrading.md)), and watch the
[releases page](https://github.com/chris-billingham/taskflow/releases) for
notes that call out security fixes.

Behind the releases, Dependabot proposes dependency and base-image updates
every week, CI fails on known vulnerabilities in production dependencies
(`pnpm audit`), and a weekly check fails if any image an install pulls
(Postgres, Redis, Garage, Traefik, the base images) stops being published.

## Reporting Vulnerabilities

Please report security issues privately by emailing the maintainers rather than opening a public GitHub issue.
