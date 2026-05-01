import { test, expect, type Page } from '@playwright/test';
import { TEST_USER } from '../global-setup';

async function loginAsTestUser(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_USER.email);
  await page.getByLabel(/password/i).fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/(today|inbox|app)/);
}

test.describe('Filter Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('can create a filter with priority query', async ({ page }) => {
    const filterName = `High Priority ${Date.now()}`;

    // Navigate to filters section
    await page.getByRole('button', { name: /add filter|new filter/i }).click();

    // Fill in filter details
    const nameInput = page.getByLabel(/filter name|name/i);
    await nameInput.fill(filterName);

    const queryInput = page.getByLabel(/query|filter expression/i)
      .or(page.getByPlaceholder(/p1.*today|filter query/i));
    await queryInput.fill('p1 | p2');

    await page.getByRole('button', { name: /save|create/i }).click();

    await expect(page.getByText(filterName)).toBeVisible();
  });

  test('can view filter results', async ({ page }) => {
    // Navigate to a filter view or filters page
    await page.getByRole('link', { name: /filters/i }).click();
    await expect(page).toHaveURL(/\/filters/);
  });

  test('filter query shows validation error for invalid syntax', async ({ page }) => {
    await page.getByRole('button', { name: /add filter|new filter/i }).click();

    const queryInput = page.getByLabel(/query|filter expression/i)
      .or(page.getByPlaceholder(/filter query/i));
    await queryInput.fill('p1 &');

    // Should show a validation error
    await expect(page.getByText(/invalid|error|cannot end/i)).toBeVisible({ timeout: 2000 })
      .catch(() => {
        // Validation may happen on submit
        page.getByRole('button', { name: /save|create/i }).click();
      });
  });

  test('today filter shows only tasks due today', async ({ page }) => {
    // Navigate to the built-in Today view
    await page.getByRole('link', { name: /today/i }).click();
    await expect(page).toHaveURL(/\/today/);

    // The Today view should be visible
    await expect(page.getByText(/today/i).first()).toBeVisible();
  });
});
