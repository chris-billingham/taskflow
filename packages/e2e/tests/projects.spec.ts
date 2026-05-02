import { test, expect, type Page } from '@playwright/test';
import { TEST_USER } from '../global-setup';

async function loginAsTestUser(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_USER.email);
  await page.getByLabel(/password/i).fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/(today|inbox|app)/);
}

test.describe('Project Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('can create a new project', async ({ page }) => {
    const projectName = `E2E Project ${Date.now()}`;

    // Use exact: true — without it, substring match also hits "Add team project"
    await page.getByRole('button', { name: 'Add project', exact: true }).click();

    // Fill in project name inside the dialog
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(projectName);

    // Click the submit button scoped within the dialog
    await dialog.getByRole('button', { name: 'Add' }).click();

    // Project should appear in the sidebar
    await expect(page.locator('aside').getByText(projectName)).toBeVisible();
  });

  test('can navigate to a project', async ({ page }) => {
    const projectName = `Nav Test ${Date.now()}`;

    // Create a project so we have something to navigate to without relying on
    // Inbox (which has workspaceId and only appears under Team Projects)
    await page.getByRole('button', { name: 'Add project', exact: true }).click();
    const createDialog = page.getByRole('dialog');
    await createDialog.getByLabel('Name').fill(projectName);
    await createDialog.getByRole('button', { name: 'Add' }).click();
    await expect(page.locator('aside').getByText(projectName)).toBeVisible();

    // Click the project name in the sidebar to navigate
    await page.locator('aside').getByText(projectName).click();

    await expect(page).toHaveURL(/\/projects/);
    await expect(page.getByText(projectName).first()).toBeVisible();
  });

  test('can add a task to a project', async ({ page }) => {
    const projectName = `Task Project ${Date.now()}`;
    const taskName = `Project Task ${Date.now()}`;

    // Create a project to add the task to
    await page.getByRole('button', { name: 'Add project', exact: true }).click();
    const createDialog = page.getByRole('dialog');
    await createDialog.getByLabel('Name').fill(projectName);
    await createDialog.getByRole('button', { name: 'Add' }).click();
    await expect(page.locator('aside').getByText(projectName)).toBeVisible();

    // Navigate to the project
    await page.locator('aside').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects/);

    // Add task via QuickAdd — set up response watch before pressing Enter
    await page.getByRole('button', { name: /add task/i }).first().click();
    await page.getByPlaceholder(/add task/i).fill(taskName);

    const createDone = page.waitForResponse(
      (resp) => resp.url().includes('/tasks') && resp.request().method() === 'POST',
      { timeout: 15000 },
    );
    await page.getByPlaceholder(/add task/i).press('Enter');
    await createDone;

    await expect(page.getByText(taskName)).toBeVisible({ timeout: 10000 });
  });

  test('can edit a project name', async ({ page }) => {
    const projectName = `Rename Me ${Date.now()}`;
    const newName = `Renamed ${Date.now()}`;

    // Create project first
    await page.getByRole('button', { name: 'Add project', exact: true }).click();
    const createDialog = page.getByRole('dialog');
    await createDialog.getByLabel('Name').fill(projectName);
    await createDialog.getByRole('button', { name: 'Add' }).click();
    await expect(page.locator('aside').getByText(projectName)).toBeVisible();

    // Hover to reveal the options button, then open the project menu
    const projectItem = page.locator('aside').getByText(projectName);
    await projectItem.hover();
    await page.getByRole('button', { name: 'Project options' }).click();

    // Click "Edit project" in the dropdown
    await page.getByRole('button', { name: 'Edit project' }).click();

    // Edit name in the dialog
    const editDialog = page.getByRole('dialog');
    const editInput = editDialog.getByLabel('Name');
    await editInput.clear();
    await editInput.fill(newName);
    await editDialog.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('aside').getByText(newName)).toBeVisible();
    await expect(page.locator('aside').getByText(projectName)).not.toBeVisible();
  });
});
