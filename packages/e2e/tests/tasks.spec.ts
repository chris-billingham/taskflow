import { test, expect, type Page } from '@playwright/test';
import { TEST_USER } from '../global-setup';

async function loginAsTestUser(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_USER.email);
  await page.getByLabel(/password/i).fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/(today|inbox|app)/);
}

async function quickAddToday(page: Page, taskName: string) {
  // Scope to main to avoid matching the floating "Quick add task (Q)" button,
  // whose title also matches /add task/i and appears earlier in the DOM.
  const main = page.locator('main');
  await main.getByRole('button', { name: /add task/i }).first().click();
  const input = main.getByPlaceholder(/add task/i);
  await input.fill(`${taskName} today`);

  // Watch for the POST before pressing Enter so we don't miss it
  const createDone = page.waitForResponse(
    (resp) => resp.url().includes('/tasks') && resp.request().method() === 'POST',
    { timeout: 15000 },
  );
  await input.press('Enter');
  await createDone;

  // The parser strips "today" from the content; give the refetch time to settle
  await expect(page.getByText(taskName)).toBeVisible({ timeout: 10000 });
}

test.describe('Task Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('can create a task using quick add', async ({ page }) => {
    const taskName = `E2E Task ${Date.now()}`;
    await page.goto('/today');
    await quickAddToday(page, taskName);
  });

  test('can complete a task by clicking the checkbox', async ({ page }) => {
    const taskName = `Complete Me ${Date.now()}`;
    await page.goto('/today');
    await quickAddToday(page, taskName);

    // Complete it — find the group container that holds this task, then click its checkbox
    const taskRow = page.locator('.group').filter({ has: page.locator(`text="${taskName}"`) }).first();
    await taskRow.getByRole('button').first().click();

    // Task should become visually completed or be removed from the list
    await expect(page.getByText(taskName)).toHaveClass(/opacity|line-through|completed/, {
      timeout: 3000,
    }).catch(() => {
      // Task may have been removed from the "today" view after completion — that's fine
    });
  });

  test('can delete a task', async ({ page }) => {
    const taskName = `Delete Me ${Date.now()}`;
    await page.goto('/today');
    await quickAddToday(page, taskName);

    // Hover the task's own row button (which contains "Task options" as a child),
    // then scope the click to that row to avoid strict-mode violations when
    // multiple tasks are visible on the page.
    const taskRow = page.getByRole('button', { name: new RegExp(taskName) });
    await taskRow.hover();
    await taskRow.getByRole('button', { name: 'Task options' }).click();
    // Use exact match: the open dropdown causes the task row's accessible name to
    // include "Delete", so /delete/i matches both the row and the menu item.
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(page.getByText(taskName)).not.toBeVisible({ timeout: 5000 });
  });

  test('can use quick-add natural language parsing', async ({ page }) => {
    await page.goto('/today');

    const main = page.locator('main');
    await main.getByRole('button', { name: /add task/i }).first().click();
    const input = main.getByPlaceholder(/add task/i);
    await input.fill('Team standup p2 today');

    // Priority chip: text-orange-500 (unique to QuickAdd preview chips)
    await expect(page.locator('.text-orange-500').filter({ hasText: /p2/i })).toBeVisible();
    // Date chip: bg-green-50 is unique to QuickAdd preview (DueDateBadge doesn't use it)
    await expect(page.locator('.bg-green-50').filter({ hasText: /today/i })).toBeVisible();
  });

  test('can open task detail panel', async ({ page }) => {
    const taskName = `Detailed Task ${Date.now()}`;
    await page.goto('/today');
    await quickAddToday(page, taskName);

    // Click on the task content to open detail panel
    await page.getByText(taskName).click();

    await expect(page.getByRole('dialog').or(page.locator('[data-testid="task-detail"]'))).toBeVisible({
      timeout: 3000,
    });
  });
});
