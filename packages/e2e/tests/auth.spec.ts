import { test, expect, type Page } from '@playwright/test';
import { TEST_USER } from '../global-setup';

async function clearAuthState(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
  });

  test('user can register with a new email', async ({ page }) => {
    const uniqueEmail = `e2e-${Date.now()}@taskflow.test`;

    await page.goto('/register');
    await page.getByLabel(/name/i).fill('New E2E User');
    await page.getByLabel(/email/i).fill(uniqueEmail);
    await page.getByLabel(/password/i).fill('SecurePass123!');
    await page.getByRole('button', { name: /sign up|register/i }).click();

    // Should redirect to app after successful registration
    await expect(page).toHaveURL(/\/(today|inbox|app)/);
  });

  test('user can log in with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    await expect(page).toHaveURL(/\/(today|inbox|app)/);
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill('wrong-password');
    await page.getByRole('button', { name: /sign in|log in/i }).click();

    await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('user can log out', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/(today|inbox|app)/);

    // Logout
    await page.getByRole('button', { name: /logout|sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('unauthenticated users are redirected to login', async ({ page }) => {
    await page.goto('/today');
    await expect(page).toHaveURL(/\/login/);
  });

  test('registration shows error for duplicate email', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel(/name/i).fill(TEST_USER.name);
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign up|register/i }).click();

    await expect(page.getByText(/already exists|already registered/i)).toBeVisible();
  });
});
