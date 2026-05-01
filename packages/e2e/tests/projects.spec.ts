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

    // Find "Add project" button in sidebar
    await page.getByRole('button', { name: /add project|new project/i }).click();

    // Fill in project name
    const nameInput = page.getByLabel(/name/i).or(page.getByPlaceholder(/project name/i));
    await nameInput.fill(projectName);
    await page.getByRole('button', { name: /create|save|add/i }).click();

    // Project should appear in the sidebar
    await expect(page.getByText(projectName)).toBeVisible();
  });

  test('can navigate to a project', async ({ page }) => {
    // Click on Inbox (default project)
    await page.getByRole('link', { name: /inbox/i }).or(page.getByText('Inbox')).first().click();

    await expect(page).toHaveURL(/\/inbox|\/projects/);
    await expect(page.getByText(/inbox/i)).toBeVisible();
  });

  test('can add a task to a project', async ({ page }) => {
    const taskName = `Project Task ${Date.now()}`;

    // Go to Inbox
    await page.getByText('Inbox').first().click();

    // Add task
    await page.getByRole('button', { name: /add task/i }).first().click();
    await page.getByPlaceholder(/add task/i).fill(taskName);
    await page.getByPlaceholder(/add task/i).press('Enter');

    await expect(page.getByText(taskName)).toBeVisible();
  });

  test('can edit a project name', async ({ page }) => {
    const projectName = `Rename Me ${Date.now()}`;
    const newName = `Renamed ${Date.now()}`;

    // Create project first
    await page.getByRole('button', { name: /add project|new project/i }).click();
    const nameInput = page.getByLabel(/name/i).or(page.getByPlaceholder(/project name/i));
    await nameInput.fill(projectName);
    await page.getByRole('button', { name: /create|save|add/i }).click();
    await expect(page.getByText(projectName)).toBeVisible();

    // Edit the project
    await page.getByText(projectName).hover();
    await page.getByRole('button', { name: /edit|more|options/i }).last().click();
    await page.getByRole('menuitem', { name: /edit/i }).click();

    const editInput = page.getByDisplayValue(projectName);
    await editInput.fill(newName);
    await page.getByRole('button', { name: /save|update/i }).click();

    await expect(page.getByText(newName)).toBeVisible();
    await expect(page.getByText(projectName)).not.toBeVisible();
  });
});
