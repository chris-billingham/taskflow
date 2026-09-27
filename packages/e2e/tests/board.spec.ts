import { test, expect, type APIRequestContext } from '@playwright/test';
import { TEST_USER } from '../global-setup';
import { newApiContext } from '../api-context';

// Board grouping: a project board grouped by priority; dragging a card to
// another column changes its priority.
test.describe('Board grouping', () => {
  let api: APIRequestContext;
  let headers: Record<string, string>;
  let projectId: string;
  let taskId: string;
  const taskName = `Board card ${Date.now()}`;

  test.beforeAll(async () => {
    api = await newApiContext();
    const login = await api.post('/api/v1/auth/login', {
      data: { email: TEST_USER.email, password: TEST_USER.password },
    });
    headers = { Authorization: `Bearer ${(await login.json()).data.accessToken}` };
    const project = await api.post('/api/v1/projects', {
      data: { name: `Board test ${Date.now()}`, viewStyle: 'BOARD' },
      headers,
    });
    projectId = (await project.json()).data.id;
    const task = await api.post('/api/v1/tasks', { data: { content: taskName, projectId, priority: 1 }, headers });
    taskId = (await task.json()).data.id;
  });

  test.afterAll(async () => {
    await api.delete(`/api/v1/projects/${projectId}`, { headers });
    await api.dispose();
  });

  test('dragging a card to another priority column changes its priority', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/today/);
    await page.goto(`/projects/${projectId}`);

    await page.getByRole('button', { name: 'Group by: Section' }).click();
    await page.getByRole('menuitemradio', { name: 'Priority' }).click();

    const card = page.getByRole('region', { name: 'Priority 1 column' }).getByText(taskName);
    const target = page.getByRole('region', { name: 'Priority 2 column' }).getByText('No tasks');
    const from = (await card.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + 20, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();

    await expect(page.getByRole('region', { name: 'Priority 2 column' }).getByText(taskName)).toBeVisible();
    await expect
      .poll(async () => (await (await api.get(`/api/v1/tasks/${taskId}`, { headers })).json()).data.priority)
      .toBe(2);
  });
});
