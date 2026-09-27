import { PrismaClient } from '@prisma/client';

// Reads that hide trashed tasks unless the query asks about deletedAt itself.
const TASK_READS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);

function createClient() {
  return new PrismaClient({
    // Query logging includes BOUND PARAMETER VALUES (password hashes, token
    // hashes) in container logs — opt in explicitly when debugging.
    log:
      process.env.NODE_ENV === 'development' && process.env.PRISMA_QUERY_LOG === 'true'
        ? ['query', 'error', 'warn']
        : ['warn', 'error'],
  }).$extends({
    name: 'task-trash',
    query: {
      task: {
        // Trashed tasks (deletedAt set) stay out of every direct task read, so
        // no list, view, search or access check can surface one by accident.
        // A query that mentions deletedAt (the trash itself, restore) is left
        // alone. Nested relation reads (include: { subtasks }) and relation
        // counts aren't intercepted here and filter deletedAt explicitly.
        async $allOperations({ operation, args, query }) {
          if (TASK_READS.has(operation)) {
            const withWhere = args as { where?: Record<string, unknown> };
            if (withWhere.where?.deletedAt === undefined) {
              withWhere.where = { ...withWhere.where, deletedAt: null };
            }
          }
          return query(args);
        },
      },
    },
  });
}

export type Database = ReturnType<typeof createClient>;

/** The client inside `prisma.$transaction(async (tx) => …)`. */
export type DbTransaction = Omit<Database, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;

const globalForPrisma = globalThis as unknown as { prisma: Database | undefined };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
