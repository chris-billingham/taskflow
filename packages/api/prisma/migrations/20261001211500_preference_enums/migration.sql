-- Display preferences become enums. Values outside the supported set were
-- never usable (the web app fell back to its defaults), so they are cleared
-- first; the rest convert in place.
CREATE TYPE "DateFormat" AS ENUM ('MMM d, yyyy', 'MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd');
CREATE TYPE "TimeFormat" AS ENUM ('12h', '24h');
CREATE TYPE "Theme" AS ENUM ('light', 'dark', 'system');
CREATE TYPE "EmailFrequency" AS ENUM ('immediate', 'daily', 'weekly');

UPDATE "users" SET "dateFormat" = NULL
WHERE "dateFormat" NOT IN ('MMM d, yyyy', 'MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd');
UPDATE "users" SET "timeFormat" = NULL WHERE "timeFormat" NOT IN ('12h', '24h');
UPDATE "users" SET "theme" = NULL WHERE "theme" NOT IN ('light', 'dark', 'system');
UPDATE "notification_preferences" SET "emailFrequency" = 'daily'
WHERE "emailFrequency" NOT IN ('immediate', 'daily', 'weekly');

ALTER TABLE "users"
  ALTER COLUMN "dateFormat" SET DATA TYPE "DateFormat" USING ("dateFormat"::"DateFormat"),
  ALTER COLUMN "timeFormat" SET DATA TYPE "TimeFormat" USING ("timeFormat"::"TimeFormat"),
  ALTER COLUMN "theme" SET DATA TYPE "Theme" USING ("theme"::"Theme");

ALTER TABLE "notification_preferences" ALTER COLUMN "emailFrequency" DROP DEFAULT;
ALTER TABLE "notification_preferences"
  ALTER COLUMN "emailFrequency" SET DATA TYPE "EmailFrequency" USING ("emailFrequency"::"EmailFrequency");
ALTER TABLE "notification_preferences" ALTER COLUMN "emailFrequency" SET DEFAULT 'daily';
