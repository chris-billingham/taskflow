import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/taskflow_test',
      JWT_SECRET: 'test-jwt-secret-value-that-is-at-least-32-chars!',
      JWT_REFRESH_SECRET: 'test-refresh-secret-must-be-at-least-32-chars!',
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/services/**/*.ts',
        'src/utils/**/*.ts',
        'src/routes/**/*.ts',
      ],
      exclude: ['src/test/**', 'src/**/*.d.ts'],
      // Ratchet thresholds: set just under MEASURED coverage so CI blocks
      // regressions; raise them as the mocked suites grow. (The previous 70%
      // was aspirational fiction — coverage was never run in CI at all.)
      thresholds: {
        statements: 25,
        branches: 78,
        functions: 55,
        lines: 25,
      },
    },
  },
});
