-- Refresh tokens are stored as sha256 hashes from now on (reset and email
-- verification tokens already were). Existing rows hold raw JWTs and cannot
-- be hashed retroactively to match client cookies deterministically across
-- environments — delete them: every session re-authenticates once.
DELETE FROM "refresh_tokens";

-- token is @unique; the extra single-column index duplicated it on every write.
DROP INDEX IF EXISTS "refresh_tokens_token_idx";
