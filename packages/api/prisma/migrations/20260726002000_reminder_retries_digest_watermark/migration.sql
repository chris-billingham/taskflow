-- Reminder delivery: bounded retries instead of an infinite 60s resend loop,
-- and a composite index matching the poll (isSent = false AND triggerAt <= now).
ALTER TABLE "reminders" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "reminders_triggerAt_idx";
DROP INDEX IF EXISTS "reminders_isSent_idx";
CREATE INDEX "reminders_isSent_triggerAt_idx" ON "reminders"("isSent", "triggerAt");

-- Digest watermark: a notification is emailed by at most one digest.
ALTER TABLE "notifications" ADD COLUMN "digestedAt" TIMESTAMP(3);
