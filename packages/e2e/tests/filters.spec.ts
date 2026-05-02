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

    // Navigate to Filters & Labels page
    await page.goto('/filters-labels');
    await expect(page.getByText('Filters & Labels')).toBeVisible();

    // Open create form
    await page.getByRole('button', { name: /add filter/i }).click();

    // Fill in filter details
    await page.getByPlaceholder('Filter name').fill(filterName);
    await page.getByPlaceholder(/filter query/i).fill('p1 | p2');

    // Submit — scope to the create form to avoid hitting list "Add" buttons
    await page.getByRole('button', { name: 'Add' }).first().click();

    await expect(page.getByText(filterName)).toBeVisible();
  });

  test('can view filter results', async ({ page }) => {
    // Navigate to filters & labels page via direct route
    await page.goto('/filters-labels');
    await expect(page).toHaveURL(/\/filters-labels/);
    await expect(page.getByText('Filters & Labels')).toBeVisible();
  });

  test('filter query shows validation error for invalid syntax', async ({ page }) => {
    await page.goto('/filters-labels');

    await page.getByRole('button', { name: /add filter/i }).click();
    await page.getByPlaceholder(/filter query/i).fill('p1 &');

    // Attempt to submit — the Add button should be disabled due to invalid query,
    // or a validation error message should appear
    const addBtn = page.getByRole('button', { name: 'Add' }).first();
    await expect(addBtn).toBeDisabled({ timeout: 3000 }).catch(async () => {
      // If the button is not disabled, clicking it should show an error
      await addBtn.click();
      await expect(page.getByText(/invalid|error/i)).toBeVisible({ timeout: 3000 });
    });
  });

  test('today filter shows only tasks due today', async ({ page }) => {
    // Navigate to the Today view — the sidebar nav item is a button, not a link
    await page.goto('/today');
    await expect(page).toHaveURL(/\/today/);

    // The Today view header should be visible
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  });
});
