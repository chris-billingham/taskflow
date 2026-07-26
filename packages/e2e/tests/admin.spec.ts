import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { request } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

// Matches ADMIN_EMAILS on the API under test (see the e2e job in CI and
// docs/development/setup.md for the local run). Registering this address is
// what makes it an administrator.
const ADMIN = {
  name: 'E2E Admin',
  email: 'e2e-admin@taskflow.test',
  password: 'AdminPassword123!',
};

/** Registers an account, tolerating one left behind by an earlier run. */
async function ensureAccount(
  api: APIRequestContext,
  user: { name: string; email: string; password: string },
) {
  const response = await api.post('/api/v1/auth/register', { data: user });
  if (!response.ok() && response.status() !== 409) {
    throw new Error(
      `Failed to seed ${user.email}: HTTP ${response.status()} — ${await response.text()}`,
    );
  }
}

async function seed(user: { name: string; email: string; password: string }) {
  const api = await request.newContext({ baseURL: API_URL });
  try {
    await ensureAccount(api, user);
  } finally {
    await api.dispose();
  }
}

/**
 * Full sign-out for test purposes. The refresh cookie is single-use, and the
 * persisted auth store survives a reload, so both have to go — otherwise the
 * next sign-in races a rotation still in flight and trips reuse detection.
 */
async function resetSession(page: Page) {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
}

/**
 * Waits for the authenticated app shell to render, which means the initial
 * token refresh has completed. `networkidle` is unusable on signed-in pages:
 * the realtime socket holds a connection open, so the network never idles.
 */
async function waitForAppShell(page: Page) {
  await expect(page.locator('aside').first()).toBeVisible({ timeout: 15000 });
}

/** Signs in and lands on the admin console with its first page loaded. */
async function openConsole(page: Page) {
  await signIn(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/(today|inbox|app)/);
  await waitForAppShell(page);

  await page.goto('/settings/admin');
  await expect(page.getByRole('heading', { name: 'Users', level: 2 })).toBeVisible();
}

/** Locates one user's row by searching, so paging can never hide it. */
function rowFor(page: Page, email: string) {
  return page.locator('[data-testid="admin-user-row"]', { hasText: email });
}

async function findUser(page: Page, email: string) {
  await page.getByLabel('Search users').fill(email);
  const row = rowFor(page, email);
  await expect(row).toBeVisible({ timeout: 10000 });
  return row;
}

test.beforeAll(async () => {
  await seed(ADMIN);
});

test.describe('Admin console', () => {
  test('an ADMIN_EMAILS address becomes an administrator and sees the console', async ({
    page,
  }) => {
    await resetSession(page);
    await openConsole(page);

    // Its own row, found through the real list endpoint. Exact match: the
    // display name and the email both contain "admin" too.
    const row = await findUser(page, ADMIN.email);
    await expect(row.getByText('Admin', { exact: true })).toBeVisible();
  });

  test('admin creates a user, who can then sign in with the generated password', async ({
    page,
  }) => {
    const email = `e2e-created-${Date.now()}@taskflow.test`;

    await resetSession(page);
    await openConsole(page);

    await page.getByRole('button', { name: 'Add user' }).click();
    await page.getByLabel('Name').fill('Created By Admin');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Create user' }).click();

    // The generated password is shown exactly once.
    const reveal = page.getByTestId('temporary-password');
    await expect(reveal).toBeVisible({ timeout: 10000 });
    const temporaryPassword = (await reveal.textContent())?.trim();
    expect(temporaryPassword).toBeTruthy();

    // The point of the whole flow: those credentials actually work.
    await resetSession(page);
    await signIn(page, email, temporaryPassword as string);
    await expect(page).toHaveURL(/\/(today|inbox|app)/);
  });

  test('suspending a user blocks sign-in until they are reactivated', async ({
    page,
  }) => {
    const email = `e2e-suspend-${Date.now()}@taskflow.test`;
    const password = 'SuspendMe123!';
    await seed({ name: 'Suspend Target', email, password });

    await resetSession(page);
    await openConsole(page);

    const row = await findUser(page, email);
    await row.getByRole('button', { name: /Actions for/ }).click();
    await page.getByRole('button', { name: 'Suspend account' }).click();
    await expect(rowFor(page, email).getByText('Suspended')).toBeVisible({
      timeout: 10000,
    });

    // The account is genuinely closed, not just badged in the UI.
    await resetSession(page);
    await signIn(page, email, password);
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);

    // Reactivate, and the same credentials work again.
    await resetSession(page);
    await openConsole(page);
    const again = await findUser(page, email);
    await again.getByRole('button', { name: /Actions for/ }).click();
    await page.getByRole('button', { name: 'Reactivate account' }).click();
    await expect(rowFor(page, email).getByText('Suspended')).toHaveCount(0, {
      timeout: 10000,
    });

    await resetSession(page);
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/(today|inbox|app)/);
  });

  test('an admin reset password replaces the old one', async ({ page }) => {
    const email = `e2e-reset-${Date.now()}@taskflow.test`;
    const oldPassword = 'OriginalPass123!';
    await seed({ name: 'Reset Target', email, password: oldPassword });

    await resetSession(page);
    await openConsole(page);

    const row = await findUser(page, email);
    await row.getByRole('button', { name: /Actions for/ }).click();
    await page.getByRole('button', { name: 'Reset password' }).click();

    const reveal = page.getByTestId('temporary-password');
    await expect(reveal).toBeVisible({ timeout: 10000 });
    const newPassword = (await reveal.textContent())?.trim();

    // Old credentials are dead.
    await resetSession(page);
    await signIn(page, email, oldPassword);
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10000 });

    // New ones work.
    await resetSession(page);
    await signIn(page, email, newPassword as string);
    await expect(page).toHaveURL(/\/(today|inbox|app)/);
  });

  test('a non-admin gets no console link and is redirected away from it', async ({
    page,
  }) => {
    const email = `e2e-plain-${Date.now()}@taskflow.test`;
    const password = 'PlainUser123!';
    await seed({ name: 'Plain User', email, password });

    await resetSession(page);
    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/(today|inbox|app)/);
    await waitForAppShell(page);

    await page.goto('/settings/profile');
    await expect(page.getByRole('link', { name: 'Profile' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);

    // Deep-linking straight to the console does not get them in either.
    await page.getByRole('link', { name: 'Account' }).click();
    await expect(page).toHaveURL(/\/settings\/account/);
    await page.goto('/settings/admin');
    await expect(page).toHaveURL(/\/settings\/profile/, { timeout: 10000 });
  });

  test('the admin API refuses a non-admin directly, not just in the UI', async () => {
    const email = `e2e-api-${Date.now()}@taskflow.test`;
    const password = 'ApiUser123!';
    await seed({ name: 'Api User', email, password });

    const api = await request.newContext({ baseURL: API_URL });
    let accessToken: string;
    try {
      const login = await api.post('/api/v1/auth/login', {
        data: { email, password },
      });
      accessToken = (await login.json()).data.accessToken;
    } finally {
      await api.dispose();
    }

    const asUser = await request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { authorization: `Bearer ${accessToken}` },
    });
    try {
      // Hiding the nav is cosmetic; the server is the actual boundary.
      expect((await asUser.get('/api/v1/admin/users')).status()).toBe(403);
      expect((await asUser.get('/api/v1/admin/stats')).status()).toBe(403);
      expect((await asUser.post('/api/v1/admin/users', {
        data: { email: 'sneaky@taskflow.test', name: 'Sneaky' },
      })).status()).toBe(403);
      expect(
        (await asUser.delete('/api/v1/admin/users/someone-else')).status(),
      ).toBe(403);
    } finally {
      await asUser.dispose();
    }
  });
});
