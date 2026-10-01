import { test, expect, type APIRequestContext } from '@playwright/test';
import { TEST_USER } from '../global-setup';
import { newApiContext } from '../api-context';

// The installable app: once visited, it opens with no connection and shows
// what was last loaded. Needs a production build (the service worker isn't
// registered by the dev server), so it skips itself there.
test.describe('Offline', () => {
  let api: APIRequestContext;
  let headers: Record<string, string>;
  let projectId: string;
  const taskName = `Pack the tent ${Date.now()}`;

  test.beforeAll(async () => {
    api = await newApiContext();
    const login = await api.post('/api/v1/auth/login', { data: { email: TEST_USER.email, password: TEST_USER.password } });
    headers = { Authorization: `Bearer ${(await login.json()).data.accessToken}` };
    projectId = (await (await api.post('/api/v1/projects', { data: { name: `Offline ${Date.now()}` }, headers })).json()).data.id;
    await api.post('/api/v1/tasks', { data: { content: taskName, projectId }, headers });
  });

  test.afterAll(async () => {
    await api.delete(`/api/v1/projects/${projectId}`, { headers });
    await api.dispose();
  });

  test('opens without a connection and shows what was last loaded', async ({ page, context }) => {
    await page.goto('/login');
    const hasWorker = await page.evaluate(async () => {
      for (let i = 0; i < 20; i++) {
        if (await navigator.serviceWorker?.getRegistration()) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    });
    test.skip(!hasWorker, 'Production builds only: the dev server registers no service worker');

    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/today/);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText(taskName)).toBeVisible();
    // Let the saved copy catch up (it's written at most every 2 seconds).
    await page.waitForTimeout(2500);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText(/You're offline/)).toBeVisible();
    await expect(page.getByText(taskName)).toBeVisible();
    await context.setOffline(false);
  });
});
