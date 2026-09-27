import { newApiContext } from './api-context';

export const TEST_USER = {
  name: 'E2E Test User',
  email: 'e2e-test@taskflow.test',
  password: 'TestPassword123!',
};

async function globalSetup() {
  const api = await newApiContext();
  try {
    const response = await api.post('/api/v1/auth/register', {
      data: TEST_USER,
    });
    // 201 = created, 409 = already exists from an interrupted previous run — both are fine
    if (!response.ok() && response.status() !== 409) {
      const body = await response.text();
      throw new Error(`Failed to seed test user: HTTP ${response.status()} — ${body}`);
    }
  } finally {
    await api.dispose();
  }
}

export default globalSetup;
