-- Task order becomes fractional: a move takes the midpoint between neighbours.

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "sortOrder" SET DEFAULT 0,
ALTER COLUMN "sortOrder" SET DATA TYPE DOUBLE PRECISION;

