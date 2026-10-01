-- Due dates and deadlines become calendar days. They were stored as the UTC
-- midnight of the day, which converts exactly. Rounding to the nearest day
-- also recovers the intended date from values an older release stored as
-- the user's local midnight (e.g. 23:00Z for midnight in London in summer,
-- 05:00Z for midnight in New York).
ALTER TABLE "tasks"
  ALTER COLUMN "dueDate" SET DATA TYPE DATE USING (("dueDate" + INTERVAL '12 hours')::date),
  ALTER COLUMN "deadline" SET DATA TYPE DATE USING (("deadline" + INTERVAL '12 hours')::date);
