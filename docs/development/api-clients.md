# Building an API Client

How a native app, script or integration talks to the Taskflow API. The full reference is the OpenAPI document: [`openapi.json`](../../openapi.json) in the repository, or `/api/docs` on a running server (JSON at `/api/docs/json`).

## Generated clients

`openapi.json` is generated from the API's route schemas and committed, so any client generator can use it. CI checks that it's current, that real responses match it, and that a change doesn't remove routes or fields or change types that installed apps rely on.

A Swift package lives in [`clients/swift`](../../clients/swift). It runs Apple's [swift-openapi-generator](https://github.com/apple/swift-openapi-generator) at build time, so its types always match the document. Add it to an app with a transport such as [OpenAPIURLSession](https://github.com/apple/swift-openapi-urlsession):

```swift
import OpenAPIURLSession
import TaskflowAPI

let api = Client(taskflowServer: URL(string: "https://tasks.example.com")!, transport: URLSessionTransport())
let signIn = try await api.postApiV1AuthLogin(
  body: .json(.init(email: email, password: password, client: .app, deviceName: "Sam's iPhone")))
let tokens = try signIn.ok.body.json.data
```

Create it with `init(taskflowServer:transport:)`: Taskflow's timestamps carry milliseconds, which the generator's default date format rejects. Calendar dates (`dueDate`, `deadline`) are plain `"2026-10-05"` strings, since they have no time zone. Error responses aren't in the document yet, so they arrive as `.undocumented(statusCode:_:)`. Read the body's `error` field: for example `VERSION_CONFLICT`, which also sends the server's copy in `current`.

## Sign-in for apps

The web app keeps its refresh token in an httpOnly cookie. Anything that isn't a browser should ask for it in the body instead:

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "pat@example.com", "password": "…", "client": "app", "deviceName": "Pat's iPhone" }
```

The response carries `accessToken` (valid 15 minutes) and `refreshToken` (valid 30 days, single use). Store the refresh token somewhere safe, such as the iOS keychain.

If the account uses two-factor sign-in, the response is a challenge instead: `{ "twoFactorRequired": true, "challengeToken": "…" }`. Ask for a code and send it within five minutes, with the same `client` and `deviceName`:

```http
POST /api/v1/auth/login/two-factor
Content-Type: application/json

{ "challengeToken": "…", "code": "123456", "client": "app", "deviceName": "Pat's iPhone" }
```

Send `recoveryCode` instead of `code` for a recovery code. The response is the usual `accessToken` and `refreshToken`. A wrong code gets `401` with `INVALID_TWO_FACTOR_CODE` (ask again); `CHALLENGE_EXPIRED` means starting over with the password; `429` means too many wrong codes. In the Swift client, the login response's `data` has `value1` (a `SignedIn`) or `value2` (a `TwoFactorChallenge`) set.

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

## Push notifications (iOS)

After signing in, register the APNs device token iOS gave the app (hex), saying which APNs environment the build uses:

```http
POST /api/v1/push/apple
{ "token": "a1b2…", "environment": "PRODUCTION" }
```

Use `SANDBOX` for development builds. The device is tied to the session that registered it: once that session ends (sign-out, or revoked from **Devices & tokens**) it gets no more notifications. Register again after each sign-in, and `DELETE /api/v1/push/apple/:token` if the user turns notifications off. The payload is `{ "aps": { "alert": { "title", "body" }, "sound": "default" }, …data }`, where data carries ids such as `taskId` and `projectId`.

## Realtime

Socket.IO at `/socket.io`, with `auth: { token: <accessToken> }`. The server disconnects the socket when that token expires and when its session is signed out; reconnect with a fresh token. See [architecture.md](architecture.md#real-time) for rooms and events.
