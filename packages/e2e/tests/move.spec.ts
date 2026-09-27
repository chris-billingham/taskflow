import { test, expect, type APIRequestContext } from '@playwright/test';
import { TEST_USER } from '../global-setup';
import { newApiContext } from '../api-context';

// Moving tasks: drag between sections in a project's list view.
test.describe('Moving tasks', () => {
  let api: APIRequestContext;
  let headers: Record<string, string>;
  let projectId: string;
  let sectionId: string;
  let taskId: string;
  const taskName = `Drag me ${Date.now()}`;

  test.beforeAll(async () => {
    api = await newApiContext();
    const login = await api.post('/api/v1/auth/login', {
      data: { email: TEST_USER.email, password: TEST_USER.password },
    });
    headers = { Authorization: `Bearer ${(await login.json()).data.accessToken}` };
    const project = await api.post('/api/v1/projects', { data: { name: `Move test ${Date.now()}` }, headers });
    projectId = (await project.json()).data.id;
    const section = await api.post(`/api/v1/projects/${projectId}/sections`, { data: { name: 'Doing' }, headers });
    sectionId = (await section.json()).data.id;
    const task = await api.post('/api/v1/tasks', { data: { content: taskName, projectId }, headers });
    taskId = (await task.json()).data.id;
  });

  test.afterAll(async () => {
    await api.delete(`/api/v1/projects/${projectId}`, { headers });
    await api.dispose();
  });

  test('a task dragged into a section moves there', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/today/);
    await page.goto(`/projects/${projectId}`);

    const row = page.getByRole('button', { name: `Open task: ${taskName}`, exact: true });
    await row.hover();
    // The grip sits at the row's left edge; drag it into the empty section.
    const grip = page.locator('[aria-roledescription="sortable"]', { has: row }).locator('.cursor-grab').first();
    const target = page.getByText('No tasks in this section');
    const from = (await grip.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + 20, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();

    await expect(page.getByText('Moved to', { exact: false })).toBeVisible();
    await expect
      .poll(async () => (await (await api.get(`/api/v1/tasks/${taskId}`, { headers })).json()).data.sectionId)
      .toBe(sectionId);
  });
});
