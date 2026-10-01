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

## Realtime

Socket.IO at `/socket.io`, with `auth: { token: <accessToken> }`. The server disconnects the socket when that token expires and when its session is signed out; reconnect with a fresh token. See [architecture.md](architecture.md#real-time) for rooms and events.
