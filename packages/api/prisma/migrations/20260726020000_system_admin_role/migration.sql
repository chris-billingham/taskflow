-- Instance-level admin role and account suspension.
--
-- SystemRole is deliberately distinct from WorkspaceRole: workspace roles
-- govern access inside one workspace, this governs the deployment (who may
-- create, suspend, reset and delete accounts).
CREATE TYPE "SystemRole" AS ENUM ('USER', 'ADMIN');

ALTER TABLE "users" ADD COLUMN "role" "SystemRole" NOT NULL DEFAULT 'USER';

-- Existing accounts are active; suspension is opt-in and reversible.
ALTER TABLE "users" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "users_role_idx" ON "users"("role");
CREATE INDEX "users_isActive_idx" ON "users"("isActive");
