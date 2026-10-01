-- Delta sync: every synced row records the transaction that last wrote it
-- ("syncTxid"), versioned rows count their changes ("version"), and deletes
-- leave tombstones. All maintained by triggers, so no code path can forget.
BEGIN;


-- AlterTable
ALTER TABLE "label_user_settings" ADD COLUMN     "syncTxid" BIGINT NOT NULL DEFAULT txid_current();

-- AlterTable
ALTER TABLE "labels" ADD COLUMN     "syncTxid" BIGINT NOT NULL DEFAULT txid_current(),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "project_members" ADD COLUMN     "syncTxid" BIGINT NOT NULL DEFAULT txid_current();

-- AlterTable
ALTER TABLE "project_user_settings" ADD COLUMN     "syncTxid" BIGINT NOT NULL DEFAULT txid_current();

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "syncTxid" BIGINT NOT NULL DEFAULT txid_current(),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "section_user_settings" ADD COLUMN     "syncTxid" BIGINT NOT NULL DEFAULT txid_current();

-- AlterTable
ALTER TABLE "sections" ADD COLUMN     "syncTxid" BIGINT NOT NULL DEFAULT txid_current(),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "syncTxid" BIGINT NOT NULL DEFAULT txid_current(),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "workspace_members" ADD COLUMN     "syncTxid" BIGINT NOT NULL DEFAULT txid_current();

-- CreateTable
CREATE TABLE "sync_tombstones" (
    "id" BIGSERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "syncTxid" BIGINT NOT NULL DEFAULT txid_current(),
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_tombstones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_tombstones_syncTxid_idx" ON "sync_tombstones"("syncTxid");

-- CreateIndex
CREATE INDEX "label_user_settings_syncTxid_idx" ON "label_user_settings"("syncTxid");

-- CreateIndex
CREATE INDEX "labels_syncTxid_idx" ON "labels"("syncTxid");

-- CreateIndex
CREATE INDEX "project_members_syncTxid_idx" ON "project_members"("syncTxid");

-- CreateIndex
CREATE INDEX "project_user_settings_syncTxid_idx" ON "project_user_settings"("syncTxid");

-- CreateIndex
CREATE INDEX "projects_syncTxid_idx" ON "projects"("syncTxid");

-- CreateIndex
CREATE INDEX "section_user_settings_syncTxid_idx" ON "section_user_settings"("syncTxid");

-- CreateIndex
CREATE INDEX "sections_syncTxid_idx" ON "sections"("syncTxid");

-- CreateIndex
CREATE INDEX "tasks_syncTxid_idx" ON "tasks"("syncTxid");

-- CreateIndex
CREATE INDEX "workspace_members_syncTxid_idx" ON "workspace_members"("syncTxid");


-- ── Triggers ───────────────────────────────────────────────────────────────

-- Rows with a version: count the change and stamp the transaction.
CREATE FUNCTION taskflow_sync_versioned() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW."version" := OLD."version" + 1;
  END IF;
  NEW."syncTxid" := txid_current();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Rows without one (settings, memberships): stamp the transaction.
CREATE FUNCTION taskflow_sync_stamp() RETURNS trigger AS $$
BEGIN
  NEW."syncTxid" := txid_current();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A deleted row leaves a tombstone. TG_ARGV[0] names the entity type.
CREATE FUNCTION taskflow_sync_tombstone() RETURNS trigger AS $$
BEGIN
  INSERT INTO "sync_tombstones" ("entityType", "entityId") VALUES (TG_ARGV[0], OLD."id");
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Adding or removing a label changes the task: bump it so it syncs.
CREATE FUNCTION taskflow_sync_task_labels() RETURNS trigger AS $$
BEGIN
  UPDATE "tasks" SET "syncTxid" = txid_current()
  WHERE "id" = COALESCE(NEW."taskId", OLD."taskId");
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_versioned BEFORE INSERT OR UPDATE ON "tasks" FOR EACH ROW EXECUTE FUNCTION taskflow_sync_versioned();
CREATE TRIGGER sync_versioned BEFORE INSERT OR UPDATE ON "projects" FOR EACH ROW EXECUTE FUNCTION taskflow_sync_versioned();
CREATE TRIGGER sync_versioned BEFORE INSERT OR UPDATE ON "sections" FOR EACH ROW EXECUTE FUNCTION taskflow_sync_versioned();
CREATE TRIGGER sync_versioned BEFORE INSERT OR UPDATE ON "labels" FOR EACH ROW EXECUTE FUNCTION taskflow_sync_versioned();

CREATE TRIGGER sync_stamp BEFORE INSERT OR UPDATE ON "project_user_settings" FOR EACH ROW EXECUTE FUNCTION taskflow_sync_stamp();
CREATE TRIGGER sync_stamp BEFORE INSERT OR UPDATE ON "section_user_settings" FOR EACH ROW EXECUTE FUNCTION taskflow_sync_stamp();
CREATE TRIGGER sync_stamp BEFORE INSERT OR UPDATE ON "label_user_settings" FOR EACH ROW EXECUTE FUNCTION taskflow_sync_stamp();
CREATE TRIGGER sync_stamp BEFORE INSERT OR UPDATE ON "project_members" FOR EACH ROW EXECUTE FUNCTION taskflow_sync_stamp();
CREATE TRIGGER sync_stamp BEFORE INSERT OR UPDATE ON "workspace_members" FOR EACH ROW EXECUTE FUNCTION taskflow_sync_stamp();

CREATE TRIGGER sync_tombstone AFTER DELETE ON "tasks" FOR EACH ROW EXECUTE FUNCTION taskflow_sync_tombstone('task');
CREATE TRIGGER sync_tombstone AFTER DELETE ON "projects" FOR EACH ROW EXECUTE FUNCTION taskflow_sync_tombstone('project');
CREATE TRIGGER sync_tombstone AFTER DELETE ON "sections" FOR EACH ROW EXECUTE FUNCTION taskflow_sync_tombstone('section');
CREATE TRIGGER sync_tombstone AFTER DELETE ON "labels" FOR EACH ROW EXECUTE FUNCTION taskflow_sync_tombstone('label');

CREATE TRIGGER sync_task_labels AFTER INSERT OR DELETE ON "task_labels" FOR EACH ROW EXECUTE FUNCTION taskflow_sync_task_labels();

COMMIT;
