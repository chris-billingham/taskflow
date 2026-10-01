# Devices and Access Tokens

Open **Settings → Devices & tokens**.

## Signed-in devices

Every browser or app you've signed in on is listed, with when you signed in and when it was last active. The one you're using is marked **This device**.

- **Sign out** next to a device ends that session. Within 15 minutes at the most it stops working, and it needs your password again. Live updates on it stop straight away.
- **Sign out of all others** does that for every device except this one.

Browser sessions are named after the browser ("Firefox on Windows"); apps name themselves. A session lasts 30 days from its last use. Changing your password signs you out everywhere.

## Personal access tokens

A personal access token lets a script or another tool use Taskflow as you, without your password.

1. Enter a name that says what it's for.
2. Choose **Read only** (it can look but not change anything) or **Read and write**.
3. Choose when it expires, then click **Create token**.
4. Copy the token straight away. It's shown once; Taskflow only keeps a fingerprint of it.

Send it in the `Authorization` header:

```bash
curl -H "Authorization: Bearer tfp_…" https://taskflow.example.com/api/v1/views/today
```

The list shows each token's first characters, its access, and when it was last used. **Revoke** stops it working at once.

No token can change your password, sign devices out, create or revoke tokens, delete your account or use the admin console. Those always need you to sign in.

## Deleting your account

**Settings → Account → Delete account** asks for your password before it deletes anything.
