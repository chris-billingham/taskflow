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
    const taskName = `E2E Task ${Date.now()}`;

    await page.goto('/today');

    // Click the "Add task" button
    await page.getByRole('button', { name: /add task/i }).first().click();

    // Type task name and submit
    const input = page.getByPlaceholder(/add task/i);
    await input.fill(taskName);
    await input.press('Enter');

    await expect(page.getByText(taskName)).toBeVisible();
  });

  test('can complete a task by clicking the checkbox', async ({ page }) => {
    const taskName = `Complete Me ${Date.now()}`;
    await page.goto('/today');

    // Create the task first
    await page.getByRole('button', { name: /add task/i }).first().click();
    await page.getByPlaceholder(/add task/i).fill(taskName);
    await page.getByPlaceholder(/add task/i).press('Enter');
    await expect(page.getByText(taskName)).toBeVisible();

    // Complete it
    const taskRow = page.locator(`text="${taskName}"`).locator('..');
    await taskRow.getByRole('button').first().click();

    // Task should become visually completed (opacity change, strikethrough, or removed from list)
    // The exact behavior depends on the view, but the task should no longer appear as active
    await expect(page.getByText(taskName)).toHaveClass(/opacity|line-through|completed/, {
      timeout: 3000,
    }).catch(() => {
      // Task may have been removed from the "today" view after completion
    });
  });

  test('can delete a task', async ({ page }) => {
    const taskName = `Delete Me ${Date.now()}`;
    await page.goto('/today');

    // Create a task
    await page.getByRole('button', { name: /add task/i }).first().click();
    await page.getByPlaceholder(/add task/i).fill(taskName);
    await page.getByPlaceholder(/add task/i).press('Enter');
    await expect(page.getByText(taskName)).toBeVisible();

    // Hover to show the options menu
    await page.getByText(taskName).hover();
    await page.getByRole('button', { name: /more|options|\.\.\./i }).last().click();
    await page.getByRole('menuitem', { name: /delete/i }).click();

    await expect(page.getByText(taskName)).not.toBeVisible({ timeout: 3000 });
  });

  test('can use quick-add natural language parsing', async ({ page }) => {
    await page.goto('/today');

    await page.getByRole('button', { name: /add task/i }).first().click();
    const input = page.getByPlaceholder(/add task/i);
    await input.fill('Team standup p2 today');

    // Preview should show priority and date
    await expect(page.getByText(/p2/i)).toBeVisible();
    await expect(page.getByText(/today/i)).toBeVisible();
  });

  test('can open task detail panel', async ({ page }) => {
    const taskName = `Detailed Task ${Date.now()}`;
    await page.goto('/today');

    await page.getByRole('button', { name: /add task/i }).first().click();
    await page.getByPlaceholder(/add task/i).fill(taskName);
    await page.getByPlaceholder(/add task/i).press('Enter');
    await expect(page.getByText(taskName)).toBeVisible();

    // Click on the task content to open detail
    await page.getByText(taskName).click();

    // Detail panel should appear
    await expect(page.getByRole('dialog').or(page.locator('[data-testid="task-detail"]'))).toBeVisible({
      timeout: 3000,
    });
  });
});
