import { test, expect, type Page } from '@playwright/test';
import { request } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

const USER = {
  name: 'Date Format User',
  email: 'e2e-dateformat@taskflow.test',
  password: 'DateFormat123!',
};

// 9 March 2027: day and month differ, and the year is not the current one, so
// a day-first format, a month-first format and a missing year are all
// distinguishable from one another.
const DUE_DATE = '2027-03-09';

// The Settings → Preferences buttons are labelled with a sample date rather
// than the format string, so these are what gets clicked.
const OPTION_LABEL = {
  'MMM d, yyyy': 'Jan 5, 2025',
  'MM/dd/yyyy': '01/05/2025',
  'dd/MM/yyyy': '05/01/2025',
  'yyyy-MM-dd': '2025-01-05',
} as const;

let projectId = '';

test.beforeAll(async () => {
  const api = await request.newContext({ baseURL: API_URL });
  try {
    const registered = await api.post('/api/v1/auth/register', { data: USER });
    if (!registered.ok() && registered.status() !== 409) {
      throw new Error(`seed failed: ${registered.status()} ${await registered.text()}`);
    }

    const login = await api.post('/api/v1/auth/login', {
      data: { email: USER.email, password: USER.password },
    });
    const token = (await login.json()).data.accessToken;
    const authed = { authorization: `Bearer ${token}` };

    const project = await api.post('/api/v1/projects', {
      headers: authed,
      data: { name: `Date Format ${Date.now()}` },
    });
    projectId = (await project.json()).data.id;

    await api.post('/api/v1/tasks', {
      headers: authed,
      data: { content: 'Dated task', projectId, dueDate: DUE_DATE },
    });
  } finally {
    await api.dispose();
  }
});

async function resetSession(page: Page) {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(USER.email);
  await page.getByLabel('Password').fill(USER.password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/\/(today|inbox|app)/);
  await expect(page.locator('aside').first()).toBeVisible({ timeout: 15000 });
}

/** Picks a date format in Settings → Preferences and saves it. */
async function chooseDateFormat(page: Page, format: keyof typeof OPTION_LABEL) {
  await page.goto('/settings/preferences');
  await expect(page.getByText('Date format')).toBeVisible();
  // Exact: "01/05/2025" and "05/01/2025" are both on screen.
  await page.getByRole('button', { name: OPTION_LABEL[format], exact: true }).click();
  await page.getByRole('button', { name: /Save preferences/ }).click();
  await expect(page.getByRole('button', { name: 'Saved!' })).toBeVisible({
    timeout: 10000,
  });
}

/** The due-date badge rendered on the task row in the project view. */
function dueDateBadge(page: Page) {
  return page
    .locator('[data-testid="task-item"], li, div')
    .filter({ hasText: 'Dated task' })
    .last();
}

test.describe('Date format preference', () => {
  test('every format renders the user’s choice, with the year', async ({ page }) => {
    await resetSession(page);
    await signIn(page);

    // Day-first numeric — this used to render as "5 Mar", a month-name format
    // the user never selected, with no year at all.
    await chooseDateFormat(page, 'dd/MM/yyyy');
    await page.goto(`/projects/${projectId}`);
    await expect(dueDateBadge(page)).toContainText('09/03/2027');
    // Negative checks, so a stale render or an over-broad locator cannot make
    // the assertion above pass by accident.
    await expect(page.getByText('03/09/2027')).toHaveCount(0);
    await expect(page.getByText('Mar 9', { exact: false })).toHaveCount(0);

    // Month-first numeric must be visibly different from day-first.
    await chooseDateFormat(page, 'MM/dd/yyyy');
    await page.goto(`/projects/${projectId}`);
    await expect(dueDateBadge(page)).toContainText('03/09/2027');
    await expect(page.getByText('09/03/2027')).toHaveCount(0);

    // ISO.
    await chooseDateFormat(page, 'yyyy-MM-dd');
    await page.goto(`/projects/${projectId}`);
    await expect(dueDateBadge(page)).toContainText('2027-03-09');

    // Month name — the default, which previously showed "Mar 9" with no year.
    await chooseDateFormat(page, 'MMM d, yyyy');
    await page.goto(`/projects/${projectId}`);
    await expect(dueDateBadge(page)).toContainText('Mar 9, 2027');
  });
});
