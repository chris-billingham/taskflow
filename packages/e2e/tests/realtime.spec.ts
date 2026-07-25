import { test, expect, request as pwRequest, type Page } from '@playwright/test';
import { TEST_USER } from '../global-setup';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

async function apiLogin() {
  const api = await pwRequest.newContext({ baseURL: API_URL });
  const res = await api.post('/api/v1/auth/login', {
    data: { email: TEST_USER.email, password: TEST_USER.password },
  });
  if (!res.ok()) throw new Error(`API login failed: ${res.status()}`);
  const body = await res.json();
  return { api, headers: { Authorization: `Bearer ${body.data.accessToken}` } };
}

async function loginAsTestUser(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(TEST_USER.email);
  await page.getByLabel(/password/i).fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/(today|inbox|app)/);
}

test.describe('Realtime sync', () => {
  test('a task created in one session appears live in another', async ({ browser }) => {
    const { api, headers } = await apiLogin();

    const projRes = await api.post('/api/v1/projects', {
      data: { name: `Realtime ${Date.now()}` },
      headers,
    });
    expect(projRes.status()).toBe(201);
    const project = (await projRes.json()).data;

    // Two fully isolated browser sessions viewing the same project.
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    try {
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();
      await loginAsTestUser(pageA);
      await loginAsTestUser(pageB);

      await pageA.goto(`/projects/${project.id}`);
      await pageB.goto(`/projects/${project.id}`);
      await expect(pageA.locator('main').getByText(project.name).first()).toBeVisible();
      await expect(pageB.locator('main').getByText(project.name).first()).toBeVisible();

      // Create the task via the API: the websocket broadcast is the ONLY path
      // by which either page can learn about it without a reload.
      const taskName = `Live task ${Date.now()}`;
      const taskRes = await api.post('/api/v1/tasks', {
        data: { content: taskName, projectId: project.id },
        headers,
      });
      expect(taskRes.status()).toBe(201);

      await expect(pageA.getByText(taskName)).toBeVisible({ timeout: 10000 });
      await expect(pageB.getByText(taskName)).toBeVisible({ timeout: 10000 });
    } finally {
      await ctxA.close();
      await ctxB.close();
      await api.dispose();
    }
  });

  test('a task completed elsewhere updates the Today view without reload', async ({
    browser,
  }) => {
    const { api, headers } = await apiLogin();

    // A task due today, created via API into the user's inbox.
    const projectsRes = await api.get('/api/v1/projects', { headers });
    const inbox = (await projectsRes.json()).data.find(
      (p: { isInbox: boolean }) => p.isInbox,
    );
    expect(inbox).toBeTruthy();

    const taskName = `Today live ${Date.now()}`;
    const today = new Date();
    const dueDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const taskRes = await api.post('/api/v1/tasks', {
      data: { content: taskName, projectId: inbox.id, dueDate },
      headers,
    });
    expect(taskRes.status()).toBe(201);
    const task = (await taskRes.json()).data;

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await loginAsTestUser(page);
      await page.goto('/today');
      await expect(page.getByText(taskName)).toBeVisible({ timeout: 10000 });

      // Complete it from "another device" (the API); the view must react.
      const completeRes = await api.post(`/api/v1/tasks/${task.id}/complete`, {
        headers,
      });
      expect(completeRes.ok()).toBeTruthy();

      await expect(page.getByText(taskName)).toBeHidden({ timeout: 10000 });
    } finally {
      await ctx.close();
      await api.dispose();
    }
  });
});
