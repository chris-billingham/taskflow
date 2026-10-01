import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { TEST_USER } from '../global-setup';
import { newApiContext } from '../api-context';

// Two people with the same task open see each other, and see each other type.
test.describe('Who is here', () => {
  let api: APIRequestContext;
  let ownerHeaders: Record<string, string>;
  let friendHeaders: Record<string, string>;
  let projectId: string;
  let taskId: string;
  const stamp = Date.now();
  const friend = { name: 'Pat Peer', email: `peer-${stamp}@taskflow.test`, password: 'TestPassword123!' };

  const login = async (email: string, password: string) => {
    const res = await api.post('/api/v1/auth/login', { data: { email, password } });
    return { Authorization: `Bearer ${(await res.json()).data.accessToken}` };
  };

  test.beforeAll(async () => {
    api = await newApiContext();
    await api.post('/api/v1/auth/register', { data: friend });
    ownerHeaders = await login(TEST_USER.email, TEST_USER.password);
    friendHeaders = await login(friend.email, friend.password);
    projectId = (await (await api.post('/api/v1/projects', { data: { name: `Presence ${stamp}` }, headers: ownerHeaders })).json()).data.id;
    await api.post(`/api/v1/projects/${projectId}/collaborators`, { data: { email: friend.email, role: 'MEMBER' }, headers: ownerHeaders });
    taskId = (await (await api.post('/api/v1/tasks', { data: { content: 'Plan the offsite', projectId }, headers: ownerHeaders })).json()).data.id;
  });

  test.afterAll(async () => {
    await api.delete(`/api/v1/projects/${projectId}`, { headers: ownerHeaders });
    await api.delete('/api/v1/users/me', { headers: friendHeaders });
    await api.dispose();
  });

  async function openTask(browser: Browser, email: string, password: string): Promise<Page> {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/today/);
    await page.goto(`/projects/${projectId}?task=${taskId}`);
    await expect(page.getByRole('dialog', { name: 'Task detail' })).toBeVisible();
    return page;
  }

  test('each sees the other in the task, and sees them typing', async ({ browser }) => {
    const owner = await openTask(browser, TEST_USER.email, TEST_USER.password);
    const peer = await openTask(browser, friend.email, friend.password);

    await expect(owner.getByText(`${friend.name} is here too`)).toBeVisible();
    await expect(peer.getByText(`${TEST_USER.name} is here too`)).toBeVisible();

    await peer.getByPlaceholder('Write a comment...').pressSequentially('Shall we');
    await expect(owner.getByText(`${friend.name} is typing`)).toBeVisible();

    // Closing the task takes them off the list.
    await peer.getByRole('button', { name: 'Close task detail' }).click();
    await expect(owner.getByText(`${friend.name} is here too`)).toHaveCount(0);

    await owner.context().close();
    await peer.context().close();
  });
});
