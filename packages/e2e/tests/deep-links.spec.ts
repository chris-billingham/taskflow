import { test, expect, request as pwRequest } from '@playwright/test';
import { TEST_USER } from '../global-setup';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

// Notification, push and search links all point at /projects/:id?task=:taskId.
// Nothing used to read the param, so they opened the project but not the task.
test.describe('Task deep links', () => {
  let api: Awaited<ReturnType<typeof pwRequest.newContext>>;
  let inboxId: string;
  let parentId: string;
  let subtaskId: string;
  const subtaskContent = `Deep-linked subtask ${Date.now()}`;

  test.beforeAll(async () => {
    api = await pwRequest.newContext({ baseURL: API_URL });
    const login = await api.post('/api/v1/auth/login', {
      data: { email: TEST_USER.email, password: TEST_USER.password },
    });
    const headers = { Authorization: `Bearer ${(await login.json()).data.accessToken}` };

    const projects = await api.get('/api/v1/projects', { headers });
    inboxId = (await projects.json()).data.find((p: { isInbox: boolean }) => p.isInbox).id;

    const parent = await api.post('/api/v1/tasks', {
      data: { content: `Deep-link parent ${Date.now()}`, projectId: inboxId },
      headers,
    });
    parentId = (await parent.json()).data.id;

    // A subtask is never in the project list, so the page has to fetch it.
    const sub = await api.post('/api/v1/tasks', {
      data: { content: subtaskContent, projectId: inboxId, parentId },
      headers,
    });
    subtaskId = (await sub.json()).data.id;
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test('?task= opens that task, and closing clears the param', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/today/);

    await page.goto(`/projects/${inboxId}?task=${subtaskId}`);

    const detail = page.getByRole('dialog', { name: 'Task detail' });
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('heading', { name: subtaskContent })).toBeVisible();

    await detail.getByRole('button', { name: 'Close task detail' }).click();
    await expect(detail).not.toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/projects/${inboxId}$`));
  });
});
