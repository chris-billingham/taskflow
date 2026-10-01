-- The contract half of expand-then-contract: drop columns nothing reads any
-- more. Favourites and collapsed sections moved to the per-user settings
-- tables (20260927222545_per_user_settings, 20261001223000_shared_labels);
-- public share links, a default project and project-level comments were
-- never used.

-- DropForeignKey
ALTER TABLE "comments" DROP CONSTRAINT "comments_projectId_fkey";

-- DropIndex
DROP INDEX "comments_projectId_idx";

-- DropIndex
DROP INDEX "projects_shareLink_key";

-- AlterTable
ALTER TABLE "comments" DROP COLUMN "projectId";

-- AlterTable
ALTER TABLE "labels" DROP COLUMN "isFavorite";

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "isFavorite",
DROP COLUMN "isShared",
DROP COLUMN "shareLink";

-- AlterTable
ALTER TABLE "sections" DROP COLUMN "isCollapsed";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "defaultProjectId";

