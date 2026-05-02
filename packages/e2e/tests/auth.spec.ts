import { test, expect, type Page } from '@playwright/test';
import { TEST_USER } from '../global-setup';

async function clearAuthState(page: Page) {
  // Use clearCookies — safe to call before any navigation.
  // page.evaluate(() => localStorage.clear()) throws SecurityError on about:blank.
  await page.context().clearCookies();
}

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
  });

  test('user can register with a new email', async ({ page }) => {
    const uniqueEmail = `e2e-${Date.now()}@taskflow.test`;

    await page.goto('/register');
    await page.getByLabel('Name').fill('New E2E User');
    await page.getByLabel('Email').fill(uniqueEmail);
    // Use exact match to avoid hitting both "Password" and "Confirm password"
    await page.getByLabel('Password', { exact: true }).fill('SecurePass123!');
    await page.getByLabel('Confirm password').fill('SecurePass123!');
    await page.getByLabel(/terms/i).check();
    await page.getByRole('button', { name: /create account|sign up|register/i }).click();

    await expect(page).toHaveURL(/\/(today|inbox|app)/);
  });

  test('user can log in with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    await expect(page).toHaveURL(/\/(today|inbox|app)/);
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    // Wait for the API request to complete before asserting
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test('user can log out', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/(today|inbox|app)/);

    // The logout button is inside the user menu popup — open it first
    await page.getByRole('button').filter({ hasText: TEST_USER.name }).click();
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated users are redirected to login', async ({ page }) => {
    await page.goto('/today');
    await expect(page).toHaveURL(/\/login/);
  });

  test('registration shows error for duplicate email', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Name').fill(TEST_USER.name);
    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password', { exact: true }).fill(TEST_USER.password);
    await page.getByLabel('Confirm password').fill(TEST_USER.password);
    await page.getByLabel(/terms/i).check();
    await page.getByRole('button', { name: /create account|sign up|register/i }).click();

    await expect(page.getByText(/already exists|already registered/i)).toBeVisible();
  });
});
