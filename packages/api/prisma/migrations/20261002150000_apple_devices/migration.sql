-- Devices registered for Apple push notifications.

-- CreateEnum
CREATE TYPE "ApnsEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateTable
CREATE TABLE "apple_devices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "environment" "ApnsEnvironment" NOT NULL,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apple_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "apple_devices_token_key" ON "apple_devices"("token");

-- CreateIndex
CREATE INDEX "apple_devices_userId_idx" ON "apple_devices"("userId");

-- CreateIndex
CREATE INDEX "apple_devices_sessionId_idx" ON "apple_devices"("sessionId");

-- AddForeignKey
ALTER TABLE "apple_devices" ADD CONSTRAINT "apple_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

