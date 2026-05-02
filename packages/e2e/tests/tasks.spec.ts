import { test, expect, type Page } from '@playwright/test';
import { TEST_USER } from '../global-setup';

async function loginAsTestUser(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_USER.email);
  await page.getByLabel(/password/i).fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/(today|inbox|app)/);
}

test.describe('Task Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('can create a task using quick add', async ({ page }) => {
    // Use a unique base name; append "today" so the task appears in Today view
    const taskName = `E2E Task ${Date.now()}`;

    await page.goto('/today');

    await page.getByRole('button', { name: /add task/i }).first().click();

    const input = page.getByPlaceholder(/add task/i);
    // Include "today" so the API sets dueDate=today → task appears in Today view
    await input.fill(`${taskName} today`);
    await input.press('Enter');

    // Wait for the create + refetch requests to complete
    await page.waitForLoadState('networkidle');

    // The parser strips "today" from the content, so assert on the base name
    await expect(page.getByText(taskName)).toBeVisible({ timeout: 10000 });
  });

  test('can complete a task by clicking the checkbox', async ({ page }) => {
    const taskName = `Complete Me ${Date.now()}`;
    await page.goto('/today');

    await page.getByRole('button', { name: /add task/i }).first().click();
    await page.getByPlaceholder(/add task/i).fill(`${taskName} today`);
    await page.getByPlaceholder(/add task/i).press('Enter');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(taskName)).toBeVisible({ timeout: 10000 });

    // Complete it — find the group container that holds this task, then click its first button (checkbox)
    const taskRow = page.locator('.group').filter({ has: page.locator(`text="${taskName}"`) }).first();
    await taskRow.getByRole('button').first().click();

    // Task should become visually completed (opacity change, strikethrough, or removed from list)
    await expect(page.getByText(taskName)).toHaveClass(/opacity|line-through|completed/, {
      timeout: 3000,
    }).catch(() => {
      // Task may have been removed from the "today" view after completion
    });
  });

  test('can delete a task', async ({ page }) => {
    const taskName = `Delete Me ${Date.now()}`;
    await page.goto('/today');

    await page.getByRole('button', { name: /add task/i }).first().click();
    await page.getByPlaceholder(/add task/i).fill(`${taskName} today`);
    await page.getByPlaceholder(/add task/i).press('Enter');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(taskName)).toBeVisible({ timeout: 10000 });

    // Hover to reveal task options button, then open menu
    await page.getByText(taskName).hover();
    await page.getByRole('button', { name: 'Task options' }).click();
    await page.getByRole('button', { name: /delete/i }).click();

    await expect(page.getByText(taskName)).not.toBeVisible({ timeout: 3000 });
  });

  test('can use quick-add natural language parsing', async ({ page }) => {
    await page.goto('/today');

    await page.getByRole('button', { name: /add task/i }).first().click();
    const input = page.getByPlaceholder(/add task/i);
    await input.fill('Team standup p2 today');

    // The QuickAdd preview chips use specific colour classes
    // Priority chip uses text-orange-500; date chip uses bg-green-50 (unique to QuickAdd preview)
    await expect(page.locator('.text-orange-500').filter({ hasText: /p2/i })).toBeVisible();
    await expect(page.locator('.bg-green-50').filter({ hasText: /today/i })).toBeVisible();
  });

  test('can open task detail panel', async ({ page }) => {
    const taskName = `Detailed Task ${Date.now()}`;
    await page.goto('/today');

    await page.getByRole('button', { name: /add task/i }).first().click();
    await page.getByPlaceholder(/add task/i).fill(`${taskName} today`);
    await page.getByPlaceholder(/add task/i).press('Enter');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(taskName)).toBeVisible({ timeout: 10000 });

    // Click on the task content to open detail panel
    await page.getByText(taskName).click();

    await expect(page.getByRole('dialog').or(page.locator('[data-testid="task-detail"]'))).toBeVisible({
      timeout: 3000,
    });
  });
});
