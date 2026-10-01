# Building an API Client

How a native app, script or integration talks to the Taskflow API. The full reference is the OpenAPI document at `/api/docs` (JSON at `/api/docs/json`).

## Sign-in for apps

The web app keeps its refresh token in an httpOnly cookie. Anything that isn't a browser should ask for it in the body instead:

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "pat@example.com", "password": "…", "client": "app", "deviceName": "Pat's iPhone" }
```

The response carries `accessToken` (valid 15 minutes) and `refreshToken` (valid 30 days, single use). Store the refresh token somewhere safe, such as the iOS keychain.

- Send `Authorization: Bearer <accessToken>` on every request.
- When a request returns 401, exchange the refresh token for a new pair and retry once:

  ```http
  POST /api/v1/auth/refresh
  { "refreshToken": "…" }
  ```

  The response has a new `accessToken` **and a new `refreshToken`**: the old one is spent. Replace it before doing anything else. Presenting a spent refresh token is treated as theft, and every session the account has is revoked.
- To sign out, `POST /api/v1/auth/logout` with `{ "refreshToken": "…" }`.
- `deviceName` is what the person sees in **Settings → Devices & tokens**. The session keeps that name, and its id, across refreshes. People can revoke it from there.

Registration takes the same `client` and `deviceName` fields.

## Personal access tokens

For scripts and server-to-server integrations, a person can create a token in **Settings → Devices & tokens** (or `POST /api/v1/tokens` while signed in). Tokens start with `tfp_` and are sent the same way:

```http
Authorization: Bearer tfp_…
```

- `READ` tokens may only make `GET` requests; `WRITE` tokens may also change data.
- Routes for account security (password, sessions, tokens, account deletion) and the admin console refuse access tokens with 403.
- Tokens can expire; an expired or revoked one gets 401.
- Access tokens don't authenticate the websocket. Use a session's access token for realtime.

## Offline sync

`GET /api/v1/sync` returns projects, sections, tasks (with `labelIds`) and labels. Call it without `since` the first time, then with the `cursor` it returned:

```http
GET /api/v1/sync?since=81234
```

- **Upsert** every row by id. The same row may come twice; that's normal.
- **Delete** the ids in `deleted.projects`, `deleted.sections`, `deleted.tasks` and `deleted.labels`.
- **Prune by access:** `projectIds` lists every project you can see now. Drop projects that aren't in it, with their sections and tasks (keep tasks assigned to you, which you can always see).
- A task with `deletedAt` set is in the trash.
- **`reset: true`** means your cursor is older than the deletions the server still remembers (90 days). Drop everything, then apply the response, which is complete.
- A full sync leaves out tasks completed more than 30 days ago. Later deltas include any task that changes.
- Store the new `cursor` only after you've applied the whole response.

Sync while the app is open after each realtime event batch or every few minutes, and when it comes back online.

### Editing offline

- **Create with your own id.** `POST /tasks`, `/projects`, `/projects/:id/sections` and `/labels` accept an `id` (16–64 characters of letters, digits, `-` and `_`, e.g. a UUID). Retrying the same create returns the first one rather than a duplicate. An id someone else already used is a 409.
- **Say which version you edited.** Every project, section, task and label has a `version` that goes up with each change. Send it back as `ifVersion` on `PATCH`. If someone changed the row since, you get **409 `VERSION_CONFLICT`** with the row as it is now in `current`: merge, then retry with its `version`. Leave `ifVersion` out to overwrite regardless.

- **Reorder with a neighbour, not an index.** `POST /tasks/:id/position` with `{ "afterId": "…" }` (or `null` for first) puts one task after another in its list. Only that task changes, so concurrent reorders by different people don't fight. `sortOrder` is fractional: sort by it, then by id.

## Realtime

Socket.IO at `/socket.io`, with `auth: { token: <accessToken> }`. The server disconnects the socket when that token expires and when its session is signed out; reconnect with a fresh token. See [architecture.md](architecture.md#real-time) for rooms and events.
