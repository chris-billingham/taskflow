-- Each person's Inbox and personal projects now live in their own private
-- space (projects."workspaceId" IS NULL) instead of an automatic workspace
-- called "Personal", and workspaces are for teams only.

BEGIN;

-- The automatic workspaces: created at sign-up with this slug.
CREATE TEMP TABLE auto_personal ON COMMIT DROP AS
SELECT w."id", w."ownerId",
       NOT EXISTS (SELECT 1 FROM "workspace_members" m WHERE m."workspaceId" = w."id" AND m."userId" <> w."ownerId")
   AND NOT EXISTS (SELECT 1 FROM "workspace_invites" i WHERE i."workspaceId" = w."id") AS solo
FROM "workspaces" w
WHERE w."slug" = 'personal-' || w."ownerId";

-- The Inbox always moves to its owner's own space.
UPDATE "projects" p SET "workspaceId" = NULL
FROM auto_personal a
WHERE p."workspaceId" = a."id" AND p."isInbox";

-- Nobody else ever joined or was invited: everything in it moves to the
-- owner's own space, and the workspace goes.
UPDATE "projects" p SET "workspaceId" = NULL
FROM auto_personal a
WHERE p."workspaceId" = a."id" AND a.solo;

UPDATE "templates" t SET "workspaceId" = NULL, "userId" = COALESCE(t."userId", a."ownerId")
FROM auto_personal a
WHERE t."workspaceId" = a."id" AND a.solo;

DELETE FROM "workspaces" w
USING auto_personal a
WHERE w."id" = a."id" AND a.solo;

-- It was shared, so it is a team workspace now: its other projects stay put
-- for the people using them, under a name that no longer says "Personal".
UPDATE "workspaces" w
SET "name" = u."name" || '''s workspace', "slug" = 'workspace-' || w."id"
FROM auto_personal a
JOIN "users" u ON u."id" = a."ownerId"
WHERE w."id" = a."id" AND NOT a.solo;

COMMIT;
