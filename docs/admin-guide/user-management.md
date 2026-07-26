# User Management

Taskflow has an **instance-level administrator** role for managing accounts across
the whole deployment: creating users, suspending them, resetting passwords and
deleting accounts.

## What an admin is (and is not)

`SystemRole` (`USER` | `ADMIN`) is deliberately separate from the existing
`WorkspaceRole` and `ProjectRole`:

| Role | Scope | Governs |
|---|---|---|
| `SystemRole.ADMIN` | The whole instance | Account lifecycle |
| `WorkspaceRole` (OWNER/ADMIN/MEMBER/GUEST) | One workspace | Access to that workspace's content |
| `ProjectRole` (ADMIN/MEMBER/COMMENTER/VIEWER) | One project | Access to that project's content |

**An instance admin gets no access to other people's tasks, projects or comments.**
Content access is governed entirely by `services/access.ts` and is unchanged by
promotion. Promoting someone cannot quietly turn into a data breach; if an admin
needs to see a project's contents, they still have to be added to it.

## Creating the first administrator

Set `ADMIN_EMAILS` in `.env`:

```env
ADMIN_EMAILS=you@example.com,ops@example.com
```

The behaviour is **promote-only and idempotent**:

- an address that **registers** is created as an admin immediately — no restart needed
- an address that **already has an account** is promoted when the API starts
- addresses with no account yet are logged at startup and promoted when they register
- it **never** demotes, deletes, or reactivates an account

That last point matters: if you suspend a departing colleague who is still listed
in `ADMIN_EMAILS`, they stay suspended across restarts. Remove them from the list
at your convenience — it is config, not the source of truth.

After editing `.env`:

```bash
docker compose -f docker-compose.yml restart api
docker compose -f docker-compose.yml logs api | grep '\[admin\]'
```

## Day-to-day management

Sign in as an admin and go to **Settings → Users** (the entry only appears for
admins). From there you can:

| Action | Effect |
|---|---|
| **Add user** | Creates the account, its personal workspace and its Inbox. Optionally generates a password, shown once. |
| **Make / revoke admin** | Toggles `SystemRole`. Takes effect on the target's next request. |
| **Suspend** | Blocks sign-in, deletes every refresh token, drops live sockets. Keeps all data. Reversible. |
| **Reactivate** | Restores sign-in with the same password. |
| **Reset password** | Sets a new password and revokes all that user's sessions. Generated passwords are shown once. |
| **Delete** | Permanently removes the account. Irreversible. |

### Temporary passwords

Password generation exists because SMTP is optional in a self-hosted install — a
"we emailed them a reset link" flow is useless when no mailer is configured.

Generated passwords are shown **exactly once**, in the response to the request
that created them. They are hashed with bcrypt before storage and are never
logged or retrievable afterwards. Copy the password and pass it to the user over
a channel you trust; they can change it under Settings → Account.

If you would rather not handle a password at all, untick "Generate a temporary
password" and set one you have already agreed with the user.

## Guard rails

These are enforced in the service layer, so they apply to the API as well as the UI:

- **The last active administrator cannot be demoted, suspended or deleted.** Only
  *active* admins count — a suspended admin cannot sign in, so they are not a way
  back in.
- **You cannot suspend or delete your own account** from the admin console. Deleting
  your own account is still possible under Settings → Account.
- **A user who owns a workspace that other people are members of cannot be deleted**
  until ownership is transferred. Deleting them would take the team's projects,
  tasks and comments with them.

## Suspension and session lifetime

Suspending an account immediately:

1. sets `isActive = false`, so sign-in is refused
2. deletes every refresh token, so no session can be renewed
3. disconnects the user's live websockets

One caveat worth knowing: **access tokens are stateless and last 15 minutes.** A
suspended user holding a valid access token can continue to make ordinary API
calls until it expires. They cannot renew it, so the window is bounded by that
15-minute lifetime.

The admin surface itself is not subject to this. Every `/api/v1/admin/*` request
re-reads the caller's role and active flag from the database, so a demoted or
suspended admin loses the console on their very next request.

If you need a hard cutoff — for example an immediate offboarding — reset the
user's password as well as suspending them, or restart the API.

## Recovering lost admin access

The guard rails make it very hard to end up with no administrator. If it happens
anyway (for instance a direct database edit), add the address to `ADMIN_EMAILS`
and restart the API:

```bash
# .env
ADMIN_EMAILS=recovery@example.com

docker compose -f docker-compose.yml restart api
```

The account must already exist. If it does not, register it normally first — a
listed address becomes an admin at registration.

## Auditing

Account changes are visible in the API logs. Startup promotions are logged under
the `[admin]` prefix:

```
[admin] promoted from ADMIN_EMAILS: ops@example.com
[admin] ADMIN_EMAILS lists 1 address(es) with no account yet: new@example.com. Each becomes an admin when it registers.
```
