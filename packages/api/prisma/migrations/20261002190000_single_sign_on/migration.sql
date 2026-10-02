-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordSet" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "external_identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_identities_userId_idx" ON "external_identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "external_identities_provider_subject_key" ON "external_identities"("provider", "subject");

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
