import { test, expect, type APIRequestContext } from '@playwright/test';
import { TEST_USER } from '../global-setup';
import { newApiContext } from '../api-context';

// Sharing one project with another account from the Share dialog.
test.describe('Sharing a project', () => {
  let api: APIRequestContext;
  let ownerHeaders: Record<string, string>;
  let friendHeaders: Record<string, string>;
  let projectId: string;
  const stamp = Date.now();
  const projectName = `Shared garden ${stamp}`;
  const friend = { name: 'Friend Fern', email: `friend-${stamp}@taskflow.test`, password: 'TestPassword123!' };

  const login = async (email: string, password: string) => {
    const res = await api.post('/api/v1/auth/login', { data: { email, password } });
    return { Authorization: `Bearer ${(await res.json()).data.accessToken}` };
  };

  test.beforeAll(async () => {
    api = await newApiContext();
    await api.post('/api/v1/auth/register', { data: friend });
    ownerHeaders = await login(TEST_USER.email, TEST_USER.password);
    friendHeaders = await login(friend.email, friend.password);
    const project = await api.post('/api/v1/projects', { data: { name: projectName }, headers: ownerHeaders });
    projectId = (await project.json()).data.id;
  });

  test.afterAll(async () => {
    await api.delete(`/api/v1/projects/${projectId}`, { headers: ownerHeaders });
    await api.delete('/api/v1/users/me', { headers: friendHeaders });
    await api.dispose();
  });

  test('the owner shares it, and it appears for the other person', async ({ page, browser }) => {
    // The friend is already signed in elsewhere: the project should arrive live.
    const friendContext = await browser.newContext();
    const friendPage = await friendContext.newPage();
    await friendPage.goto('/login');
    await friendPage.getByLabel(/email/i).fill(friend.email);
    await friendPage.getByLabel(/password/i).fill(friend.password);
    await friendPage.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(friendPage).toHaveURL(/\/today/);
    await expect(friendPage.getByText(projectName)).toHaveCount(0);

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_USER.email);
    await page.getByLabel(/password/i).fill(TEST_USER.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).toHaveURL(/\/today/);
    await page.goto(`/projects/${projectId}`);

    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Share “${projectName}”` });
    await dialog.getByLabel('Share with').fill(friend.email);
    await dialog.getByRole('combobox', { name: 'Role' }).selectOption('COMMENTER');
    await dialog.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(dialog.getByText(friend.name)).toBeVisible();

    await expect(friendPage.locator('aside').getByText('Shared with me').first()).toBeVisible();
    await expect(friendPage.locator('aside').getByText(projectName).first()).toBeVisible();
    await friendContext.close();
  });
});
