import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Query logging includes BOUND PARAMETER VALUES (password hashes, token
    // hashes) in container logs — opt in explicitly when debugging.
    log:
      process.env.NODE_ENV === 'development' && process.env.PRISMA_QUERY_LOG === 'true'
        ? ['query', 'error', 'warn']
        : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
