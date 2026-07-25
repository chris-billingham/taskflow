-- Email verification hardening: tokens get an expiry and a unique index
-- (lookups were previously unindexed full-table scans), and are stored as
-- sha256 hashes from now on. Existing plaintext tokens are cleared — affected
-- unverified users can use "resend verification" to get a fresh link.
ALTER TABLE "users" ADD COLUMN "emailVerifyTokenExpiresAt" TIMESTAMP(3);

UPDATE "users" SET "emailVerifyToken" = NULL WHERE "emailVerifyToken" IS NOT NULL;

CREATE UNIQUE INDEX "users_emailVerifyToken_key" ON "users"("emailVerifyToken");
