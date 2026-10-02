# Single Sign-On

Taskflow can sign people in through an OpenID Connect provider, such as
Authentik, Keycloak or Google Workspace. The login page then shows **Sign in
with …** under the password form. Passwords keep working alongside it.

## How accounts are matched

1. Someone who has signed in this way before is recognised by the provider's
   account ID (the `sub` claim), even if their email address has changed.
2. Otherwise, an existing Taskflow account with the same email address is
   linked, but only if the provider says the address is verified.
3. Otherwise a new account is created, **if the sign-up policy allows it**:
   when sign-ups are open, for addresses in `ADMIN_EMAILS`, or for an address
   with a pending workspace invitation. On an invite-only Taskflow, add people
   in the admin console or invite them first.

Taskflow's own two-factor sign-in still applies: someone who has turned it on
enters a code after the provider sends them back.

Accounts created through single sign-on have no password at first. People can
choose one under **Settings → Account** within 15 minutes of signing in, or
with **Forgot password**. Actions that ask for a password (setting up
two-factor, deleting the account) explain this.

## Setting it up

Register Taskflow with your provider as a confidential web application:

- **Redirect URI:** `https://<your domain>/api/v1/auth/oidc/callback`
- **Grant type:** authorization code (Taskflow uses PKCE)
- **Scopes:** `openid email profile`

Then set these in `.env` and restart (`make start`):

```env
OIDC_ISSUER=https://auth.example.com/application/o/taskflow/
OIDC_CLIENT_ID=…
OIDC_CLIENT_SECRET=…
OIDC_NAME=Authentik
```

The API must be able to reach `OIDC_ISSUER/.well-known/openid-configuration`.
A provider on the internal network can use plain `http://`.

### Authentik

Create an **OAuth2/OpenID Provider** (client type *Confidential*, redirect URI
as above) and an **Application** using it. The issuer is
`https://<authentik>/application/o/<application slug>/`. Authentik sends
`email_verified` as `true` only if your property mapping says so; if it
leaves it out, set `OIDC_TRUST_EMAIL=true` (only when every address in
Authentik is one you trust).

### Keycloak

In your realm, create a client with **Client authentication** on and the
redirect URI above. The issuer is `https://<keycloak>/realms/<realm>`.
Keycloak sends `email_verified` from each user's profile.

### Google Workspace

In Google Cloud Console, create an **OAuth client ID** of type *Web
application* with the redirect URI above. The issuer is
`https://accounts.google.com`. To limit sign-in to your organisation, set the
OAuth consent screen's user type to *Internal*.

## When something goes wrong

The login page explains failures (no invitation, unverified address,
deactivated account). Provider errors are logged by the API:

```bash
docker compose -f docker-compose.yml logs api | grep "single sign-on"
```

## Apps

The iOS app signs in with single sign-on too: it opens the provider in the
system browser and Taskflow sends it back to `taskflow://auth/callback`.
Nothing needs registering with the provider for this; the provider still
redirects to Taskflow's own `/api/v1/auth/oidc/callback`. If you build your
own app, add its redirect URI to `OIDC_APP_REDIRECT_URIS` (comma separated).
