# Signing In Securely

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

## Single sign-on

If your Taskflow is connected to your organisation's sign-in (Authentik, Keycloak, Google Workspace and so on), the login page shows **Sign in with …**. Your first sign-in this way creates your account, or links it to an existing one with the same address. To use a password too, choose one under **Settings → Account** within 15 minutes of signing in.

## Two-factor sign-in

With two-factor sign-in on, Taskflow asks for a 6-digit code from an authenticator app (such as 1Password, Google Authenticator or Authy) after your password, so a stolen password alone can't get into your account.

**Turning it on.** Go to **Settings → Account → Two-factor sign-in** and click **Set up**.

1. Enter your password.
2. Scan the QR code with your authenticator app, or type the key shown under it.
3. Enter the code the app shows, and click **Turn on**.
4. Save the ten **recovery codes**: copy or download them into a password manager or somewhere safe. They're shown once.

**Signing in.** After your password, enter the current code from the app. If you don't have your phone, choose **Use a recovery code instead**; each recovery code works once. **New recovery codes** replaces the whole set (the old ones stop working), and the settings show how many you have left.

**Turning it off** needs your password and a current code or recovery code.

**Lost your phone and your recovery codes?** Ask an administrator of your Taskflow to turn two-factor sign-in off for your account. You can then sign in with your password and set it up again.

Apps and personal access tokens aren't affected: an app signs in once with the code, and tokens never ask for one.

## Deleting your account

**Settings → Account → Delete account** asks for your password before it deletes anything.
