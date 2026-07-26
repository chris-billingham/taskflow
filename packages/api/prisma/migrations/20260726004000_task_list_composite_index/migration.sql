-- Every task list reads WHERE "projectId" = ? ORDER BY "sortOrder": give the
-- planner an index that serves both (the projectId prefix replaces the old
-- single-column index).
DROP INDEX IF EXISTS "tasks_projectId_idx";
CREATE INDEX "tasks_projectId_sortOrder_idx" ON "tasks"("projectId", "sortOrder");
