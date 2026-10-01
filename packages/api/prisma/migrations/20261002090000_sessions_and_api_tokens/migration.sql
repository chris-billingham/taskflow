BEGIN;

-- Sessions (one per signed-in device, stable across refresh-token rotation)
-- and personal access tokens.

-- CreateEnum
CREATE TYPE "SessionClient" AS ENUM ('WEB', 'APP');

-- CreateEnum
CREATE TYPE "ApiTokenScope" AS ENUM ('READ', 'WRITE');

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "client" "SessionClient" NOT NULL DEFAULT 'WEB',
ADD COLUMN     "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "sessionStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing tokens each become their own session (they keep their own
-- start time; nobody's signed out).
UPDATE "refresh_tokens" SET "sessionId" = "id", "sessionStartedAt" = "createdAt", "lastUsedAt" = "createdAt";
ALTER TABLE "refresh_tokens" ALTER COLUMN "sessionId" SET NOT NULL;

-- CreateTable
CREATE TABLE "api_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scope" "ApiTokenScope" NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_tokenHash_key" ON "api_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "api_tokens_userId_idx" ON "api_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_sessionId_idx" ON "refresh_tokens"("sessionId");

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
