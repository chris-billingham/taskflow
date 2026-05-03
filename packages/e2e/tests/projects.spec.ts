import { test, expect, type Page } from '@playwright/test';
import { TEST_USER } from '../global-setup';

async function loginAsTestUser(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_USER.email);
  await page.getByLabel(/password/i).fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/(today|inbox|app)/);
}

/**
 * Creates a project and waits for the dialog to fully close before returning.
 * Necessary because the modal's "Parent project" <select> adds an <option> for
 * every project in the store — if we assert on sidebar text while the modal is
 * still in the DOM, getByText finds both the sidebar span and the option element,
 * causing a strict-mode violation.
 */
async function createProject(page: Page, projectName: string) {
  await page.getByRole('button', { name: 'Add project', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(projectName);
  await dialog.getByRole('button', { name: 'Add' }).click();
  // Wait for dialog to close before the select option disappears
  await expect(dialog).not.toBeVisible({ timeout: 5000 });
  // Now only the sidebar span remains
  await expect(page.locator('aside').getByText(projectName)).toBeVisible({ timeout: 5000 });
}

test.describe('Project Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsTestUser(page);
  });

  test('can create a new project', async ({ page }) => {
    const projectName = `E2E Project ${Date.now()}`;
    await createProject(page, projectName);
  });

  test('can navigate to a project', async ({ page }) => {
    const projectName = `Nav Test ${Date.now()}`;

    // Create a project (Inbox has workspaceId so lives in teamTree, not personalTree)
    await createProject(page, projectName);

    // Click the project name in the sidebar to navigate
    await page.locator('aside').getByText(projectName).click();

    await expect(page).toHaveURL(/\/projects/);
    await expect(page.getByText(projectName).first()).toBeVisible();
  });

  test('can add a task to a project', async ({ page }) => {
    const projectName = `Task Project ${Date.now()}`;
    const taskName = `Project Task ${Date.now()}`;

    await createProject(page, projectName);

    // Set up the listener BEFORE navigation so we don't miss the mount GET.
    // In CI (production build, no StrictMode) the GET fires immediately on
    // load. We must wait for it to settle before adding a task — otherwise
    // its empty response arrives after the optimistic update and wipes the
    // new task from the store. We cannot use networkidle because the app
    // holds a persistent real-time sync connection.
    const initialTasksFetch = page.waitForResponse(
      (resp) => resp.url().includes('/tasks') && resp.request().method() === 'GET',
      { timeout: 10000 },
    );
    await page.locator('aside').getByText(projectName).click();
    await expect(page).toHaveURL(/\/projects/);
    await initialTasksFetch;

    // Scope to main to avoid matching the floating "Quick add task (Q)" button,
    // whose title also matches /add task/i and appears earlier in the DOM.
    const main = page.locator('main');
    await main.getByRole('button', { name: /add task/i }).first().click();
    await main.getByPlaceholder(/add task/i).fill(taskName);

    const createDone = page.waitForResponse(
      (resp) => resp.url().includes('/tasks') && resp.request().method() === 'POST',
      { timeout: 15000 },
    );
    await main.getByPlaceholder(/add task/i).press('Enter');
    await createDone;

    await expect(page.getByText(taskName)).toBeVisible({ timeout: 10000 });
  });

  test('can edit a project name', async ({ page }) => {
    const projectName = `Rename Me ${Date.now()}`;
    const newName = `Renamed ${Date.now()}`;

    await createProject(page, projectName);

    // Hover to reveal the options button, then open the project menu
    const projectItem = page.locator('aside').getByText(projectName);
    await projectItem.hover();
    await page.getByRole('button', { name: 'Project options' }).click();

    // Click "Edit project" in the dropdown
    await page.getByRole('button', { name: 'Edit project', exact: true }).click();

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
