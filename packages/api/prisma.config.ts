import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// The Prisma CLI no longer reads .env itself. Local development keeps its
// settings there; containers pass real environment variables instead.
if (!process.env.DATABASE_URL && existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Empty while generating the client during an image build: `generate`
  // doesn't connect, and migrate/studio fail clearly without a URL.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
