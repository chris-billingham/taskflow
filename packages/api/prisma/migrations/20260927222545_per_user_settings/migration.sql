-- CreateTable
CREATE TABLE "project_user_settings" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_user_settings_pkey" PRIMARY KEY ("userId","projectId")
);

-- CreateTable
CREATE TABLE "section_user_settings" (
    "userId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "isCollapsed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "section_user_settings_pkey" PRIMARY KEY ("userId","sectionId")
);

-- CreateIndex
CREATE INDEX "project_user_settings_projectId_idx" ON "project_user_settings"("projectId");

-- CreateIndex
CREATE INDEX "section_user_settings_sectionId_idx" ON "section_user_settings"("sectionId");

-- AddForeignKey
ALTER TABLE "project_user_settings" ADD CONSTRAINT "project_user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_user_settings" ADD CONSTRAINT "project_user_settings_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_user_settings" ADD CONSTRAINT "section_user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "section_user_settings" ADD CONSTRAINT "section_user_settings_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill. Favourites and collapsed sections were shared flags; they now
-- belong to the project's owner. Nobody gets a sort order yet: until a person
-- reorders, the project's own order applies. The old columns stay until a
-- later migration, so the previous release keeps working during an upgrade.
INSERT INTO "project_user_settings" ("userId", "projectId", "isFavorite", "updatedAt")
SELECT "ownerId", "id", true, CURRENT_TIMESTAMP
FROM "projects"
WHERE "isFavorite" AND "ownerId" IS NOT NULL;

INSERT INTO "section_user_settings" ("userId", "sectionId", "isCollapsed", "updatedAt")
SELECT p."ownerId", s."id", true, CURRENT_TIMESTAMP
FROM "sections" s
JOIN "projects" p ON p."id" = s."projectId"
WHERE s."isCollapsed" AND p."ownerId" IS NOT NULL;
