-- Account deletion must not destroy shared/team data.
--
-- 1. tasks.creatorId: was ON DELETE CASCADE — deleting a user erased every
--    task they had ever created inside shared projects, including tasks now
--    assigned to and relied on by other people. Tasks outlive their creator.
ALTER TABLE "tasks" ALTER COLUMN "creatorId" DROP NOT NULL;
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_creatorId_fkey";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. workspaces.ownerId: was ON DELETE CASCADE — deleting a workspace owner
--    cascaded through every project, task, section and comment of every other
--    member. The database now refuses; the application deletes sole-member
--    workspaces explicitly and requires ownership transfer for shared ones.
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_ownerId_fkey";
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
