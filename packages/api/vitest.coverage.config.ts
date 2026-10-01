import { defineConfig } from 'vitest/config';
import unitConfig from './vitest.config';
import dbConfig from './vitest.db.config';

// Coverage across every API suite at once: the mocked unit and integration
// tests and the DB-backed ones. Much of the service layer (sharing, labels,
// per-person settings) is tested against a real database, so measuring the
// mocked suites alone understated it. Needs the migrated test database.
const { coverage, ...unitTest } = unitConfig.test!;

export default defineConfig({
  test: {
    coverage: {
      ...coverage,
      // Ratchet: just under the measured combined coverage (Oct 2026). Raise
      // as tests grow; never lower.
      thresholds: {
        statements: 80,
        branches: 76,
        functions: 73,
        lines: 80,
      },
    },
    projects: [
      { test: { ...unitTest, name: 'unit' } },
      { test: { ...dbConfig.test!, name: 'db' } },
    ],
  },
});
