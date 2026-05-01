-- Add GIN indexes for full-text search
CREATE INDEX IF NOT EXISTS "tasks_content_search_idx" ON "tasks" USING GIN (to_tsvector('english', "content" || ' ' || COALESCE("description", '')));
CREATE INDEX IF NOT EXISTS "projects_name_search_idx" ON "projects" USING GIN (to_tsvector('english', "name" || ' ' || COALESCE("description", '')));
CREATE INDEX IF NOT EXISTS "comments_content_search_idx" ON "comments" USING GIN (to_tsvector('english', "content"));
