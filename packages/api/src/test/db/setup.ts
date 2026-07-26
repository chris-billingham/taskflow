// Environment for DB-backed tests. These run against a real Postgres (the
// dev-compose one locally, the service container in CI) — no mocks, so the
// suite exercises actual Prisma queries, constraints, and transactions.
process.env.DATABASE_URL ||=
  'postgresql://taskflow:taskflow@localhost:5432/taskflow';
process.env.JWT_SECRET ||= 'db-test-jwt-secret-0123456789abcdef00';
process.env.JWT_REFRESH_SECRET ||= 'db-test-refresh-secret-0123456789abcd';
process.env.NODE_ENV = 'test';
