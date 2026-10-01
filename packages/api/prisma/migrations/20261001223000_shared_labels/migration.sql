-- Labels belong to a space: a person's own, or a workspace's (team labels).
-- A task carries only labels from its project's space. Labels used to be
-- per person, so a team task could hold several people's labels and editing
-- them wiped everyone else's.
BEGIN;

-- ── Schema ─────────────────────────────────────────────────────────────────
ALTER TABLE "workspace_labels" DROP CONSTRAINT "workspace_labels_workspaceId_fkey";
DROP TABLE "workspace_labels"; -- never used

ALTER TABLE "labels" ADD COLUMN "workspaceId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

CREATE TABLE "label_user_settings" (
    "userId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "label_user_settings_pkey" PRIMARY KEY ("userId","labelId")
);
CREATE INDEX "label_user_settings_labelId_idx" ON "label_user_settings"("labelId");
CREATE INDEX "labels_workspaceId_idx" ON "labels"("workspaceId");
CREATE UNIQUE INDEX "labels_workspaceId_name_key" ON "labels"("workspaceId", "name");
ALTER TABLE "labels" ADD CONSTRAINT "labels_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "label_user_settings" ADD CONSTRAINT "label_user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "label_user_settings" ADD CONSTRAINT "label_user_settings_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Each person keeps their own favourites and order.
INSERT INTO "label_user_settings" ("userId", "labelId", "isFavorite", "sortOrder", "updatedAt")
SELECT "userId", "id", "isFavorite", "sortOrder", CURRENT_TIMESTAMP
FROM "labels" WHERE "userId" IS NOT NULL;

-- ── Move labels into their task's space ────────────────────────────────────
-- Labels on tasks in team projects become that workspace's labels; labels
-- someone else put on a task in a personal project become the owner's.
CREATE TEMP TABLE label_moves AS
SELECT tl."taskId", tl."labelId", l."name", l."color", l."createdAt",
       p."workspaceId" AS ws, NULL::text AS owner
FROM "task_labels" tl
JOIN "labels" l ON l."id" = tl."labelId"
JOIN "tasks" t ON t."id" = tl."taskId"
JOIN "projects" p ON p."id" = t."projectId"
WHERE p."workspaceId" IS NOT NULL;

INSERT INTO label_moves
SELECT tl."taskId", tl."labelId", l."name", l."color", l."createdAt", NULL, p."ownerId"
FROM "task_labels" tl
JOIN "labels" l ON l."id" = tl."labelId"
JOIN "tasks" t ON t."id" = tl."taskId"
JOIN "projects" p ON p."id" = t."projectId"
WHERE p."workspaceId" IS NULL AND p."ownerId" IS NOT NULL AND l."userId" <> p."ownerId";

-- One team label per workspace and name (any case); the oldest label's
-- spelling and colour win.
INSERT INTO "labels" ("id", "name", "color", "workspaceId", "createdAt", "updatedAt")
SELECT 'lbl' || replace(gen_random_uuid()::text, '-', ''),
       (array_agg("name" ORDER BY "createdAt"))[1],
       (array_agg("color" ORDER BY "createdAt"))[1],
       ws, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM label_moves WHERE ws IS NOT NULL
GROUP BY ws, lower("name");

-- Owners get a label of that name if they don't have one.
INSERT INTO "labels" ("id", "name", "color", "userId", "createdAt", "updatedAt")
SELECT 'lbl' || replace(gen_random_uuid()::text, '-', ''),
       (array_agg(m."name" ORDER BY m."createdAt"))[1],
       (array_agg(m."color" ORDER BY m."createdAt"))[1],
       m.owner, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM label_moves m
WHERE m.owner IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "labels" x WHERE x."userId" = m.owner AND lower(x."name") = lower(m."name"))
GROUP BY m.owner, lower(m."name");

-- Point each task at the label of that name in its own space, then drop the
-- old links.
INSERT INTO "task_labels" ("taskId", "labelId")
SELECT DISTINCT m."taskId", target."id"
FROM label_moves m
JOIN LATERAL (
  SELECT x."id" FROM "labels" x
  WHERE lower(x."name") = lower(m."name")
    AND ((m.ws IS NOT NULL AND x."workspaceId" = m.ws) OR (m.owner IS NOT NULL AND x."userId" = m.owner))
  ORDER BY x."createdAt", x."id"
  LIMIT 1
) target ON true
ON CONFLICT DO NOTHING;

DELETE FROM "task_labels" tl
USING label_moves m
WHERE tl."taskId" = m."taskId" AND tl."labelId" = m."labelId"
  AND NOT EXISTS (
    SELECT 1 FROM "labels" x
    WHERE x."id" = m."labelId"
      AND ((m.ws IS NOT NULL AND x."workspaceId" = m.ws) OR (m.owner IS NOT NULL AND x."userId" = m.owner))
  );

DROP TABLE label_moves;

ALTER TABLE "labels" ADD CONSTRAINT "labels_one_owner" CHECK (num_nonnulls("userId", "workspaceId") = 1);

COMMIT;
