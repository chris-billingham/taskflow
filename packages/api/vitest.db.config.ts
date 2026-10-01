import { defineConfig } from 'vitest/config';

// DB-backed tests: real Postgres, no mocks. Run with `pnpm test:db` against
// the dev-compose database (or point TEST_DATABASE_URL elsewhere, e.g. CI's
// service container). Kept out of the default `vitest run` so the mocked
// suites stay runnable without infrastructure.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/test/db/**/*.test.ts'],
    setupFiles: ['./src/test/db/setup.ts'],
    env: {
      // Send notification email/push in the request: no worker in tests.
      NOTIFICATION_DELIVERY: 'inline',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://taskflow:taskflow@localhost:5432/taskflow',
      JWT_SECRET: 'db-test-jwt-secret-0123456789abcdef00',
      JWT_REFRESH_SECRET: 'db-test-refresh-secret-0123456789abcd',
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      // Exercises the ADMIN_EMAILS bootstrap against a real database.
      ADMIN_EMAILS: 'bootstrap-admin@admin.test',
      // Suites that call register() need it open; registrationPolicy.test.ts
      // switches modes through the stored setting, which overrides this.
      REGISTRATION_MODE: 'open',
    },
    // Fixtures share one database — keep files sequential.
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 20000,
  },
});
