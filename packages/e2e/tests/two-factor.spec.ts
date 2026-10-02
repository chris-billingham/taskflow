import { createHmac } from 'node:crypto';
import { test, expect } from '@playwright/test';

/** The code an authenticator app shows (RFC 6238: SHA-1, 6 digits, 30 s). */
function totp(base32Secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32Secret.replace(/=+$/, '')) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

test('set up two-factor sign-in, then sign in with a code', async ({ page }) => {
  const email = `e2e-2fa-${Date.now()}@taskflow.test`;
  const password = 'SecurePass123!';

  await page.goto('/register');
  await page.getByLabel('Name').fill('Two Factor');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByLabel(/terms/i).check();
  await page.getByRole('button', { name: /create account|sign up|register/i }).click();
  await expect(page).toHaveURL(/\/today/);

  // Turn it on.
  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Set up' }).click();
  await page.getByLabel('Enter your password to continue').fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByAltText('QR code for your authenticator app')).toBeVisible();
  const secret = (await page.locator('code').first().textContent())!.trim();
  await page.getByLabel('Code from the app').fill(totp(secret));
  await page.getByRole('button', { name: 'Turn on' }).click();
  await expect(page.getByRole('list', { name: 'Recovery codes' }).locator('li')).toHaveCount(10);
  await page.getByRole('button', { name: 'I’ve saved them' }).click();
  await expect(page.getByText(/10 of 10 recovery codes left/)).toBeVisible();

  // Sign out and back in: the password alone isn't enough.
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Enter the 6-digit code from your authenticator app.')).toBeVisible();

  // The code used to turn it on can't be used again, so take the next one.
  await page.getByLabel('Code').fill(totp(secret, Date.now() + 30_000));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/today/);
});
