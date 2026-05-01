import { request } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'http://localhost:3001';

export const TEST_USER = {
  name: 'E2E Test User',
  email: 'e2e-test@taskflow.test',
  password: 'TestPassword123!',
};

async function globalSetup() {
  const api = await request.newContext({ baseURL: API_URL });

  // Try to register the test user (ignore conflict if already exists)
  await api.post('/api/v1/auth/register', {
    data: TEST_USER,
  });

  await api.dispose();
}

export default globalSetup;
