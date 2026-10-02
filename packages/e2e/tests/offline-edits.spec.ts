import { test, expect, type APIRequestContext } from '@playwright/test';
import { TEST_USER } from '../global-setup';
import { newApiContext } from '../api-context';

// Changes made with no connection are kept and saved once it's back.
test.describe('Editing offline', () => {
  let api: APIRequestContext;
  let headers: Record<string, string>;
  let projectId: string;
  let taskId: string;
  const projectName = `Offline edits ${Date.now()}`;

  test.beforeAll(async () => {
    api = await newApiContext();
    const login = await api.post('/api/v1/auth/login', { data: { email: TEST_USER.email, password: TEST_USER.password } });
    headers = { Authorization: `Bearer ${(await login.json()).data.accessToken}` };
    projectId = (await (await api.post('/api/v1/projects', { data: { name: projectName }, headers })).json()).data.id;
    taskId = (await (await api.post('/api/v1/tasks', { data: { content: 'Fix the gate', projectId }, headers })).json()).data.id;
  });

  test.afterAll(async () => {
    await api.delete(`/api/v1/projects/${projectId}`, { headers });
    await api.dispose();
  });

  test('a completion and a new task made offline are saved on reconnect', async ({ page, context }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/today/);
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole('heading', { name: projectName })).toBeVisible();
    // The app fetches the parts it may need offline once it's idle.
    await page.waitForFunction(() =>
      performance.getEntriesByType('resource').some((e) => /TaskPanel/.test(e.name)),
    );

    await context.setOffline(true);
    await page.getByRole('checkbox', { name: 'Complete task' }).first().click();
    const main = page.locator('main');
    await main.getByRole('button', { name: /add task/i }).first().click();
    await main.getByPlaceholder(/add task/i).fill('Oil the hinges');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/You're offline\. 2 changes will be saved when you reconnect/)).toBeVisible();
    await expect(page.getByText('Adding “Oil the hinges”, waiting to be added')).toBeVisible();

    await context.setOffline(false);
    await expect(page.getByText(/will be saved when you reconnect|made while offline/)).toHaveCount(0, { timeout: 15_000 });
    const task = (await (await api.get(`/api/v1/tasks/${taskId}`, { headers })).json()).data;
    expect(task.isCompleted).toBe(true);
    const tasks = (await (await api.get(`/api/v1/tasks?projectId=${projectId}`, { headers })).json()).data;
    expect(tasks.map((t: { content: string }) => t.content)).toContain('Oil the hinges');
  });
});
