import { test, expect, type APIRequestContext } from '@playwright/test';
import { TEST_USER } from '../global-setup';
import { newApiContext } from '../api-context';

// A project's calendar feed and webhooks, from its menu.
test.describe('Calendar feed and webhooks', () => {
  let api: APIRequestContext;
  let headers: Record<string, string>;
  let projectId: string;
  const projectName = `Integrations ${Date.now()}`;

  test.beforeAll(async () => {
    api = await newApiContext();
    const login = await api.post('/api/v1/auth/login', { data: { email: TEST_USER.email, password: TEST_USER.password } });
    headers = { Authorization: `Bearer ${(await login.json()).data.accessToken}` };
    const project = await api.post('/api/v1/projects', { data: { name: projectName }, headers });
    projectId = (await project.json()).data.id;
    const due = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await api.post('/api/v1/tasks', { data: { content: 'Water the ferns', projectId, dueDate: due }, headers });
  });

  test.afterAll(async () => {
    await api.delete(`/api/v1/projects/${projectId}`, { headers });
    await api.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(TEST_USER.email);
    await page.getByLabel('Password').fill(TEST_USER.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/today/);
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole('heading', { name: projectName })).toBeVisible();
  });

  test('the calendar feed link serves the project’s dated tasks', async ({ page }) => {
    await page.getByRole('button', { name: 'Project options' }).click();
    await page.getByRole('menuitem', { name: 'Calendar feed' }).click();
    const link = page.getByLabel('Calendar feed link');
    await expect(link).toHaveValue(/\/api\/v1\/calendar\/[\w-]+\.ics$/);

    const path = new URL(await link.inputValue()).pathname;
    const ics = await (await api.get(path)).text();
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Water the ferns');
  });

  test('a project admin adds a webhook and sees its secret once', async ({ page }) => {
    await page.getByRole('button', { name: 'Project options' }).click();
    await page.getByRole('menuitem', { name: 'Webhooks' }).click();
    await page.getByLabel('Address').fill('https://hooks.example.com/taskflow');
    await page.getByRole('button', { name: 'Add webhook' }).click();
    await expect(page.getByText(/^whsec_/)).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('https://hooks.example.com/taskflow')).toBeVisible();
    await expect(page.getByText('Nothing sent yet')).toBeVisible();
  });
});
