-- forum_replies.thread_id is a foreign key but Postgres does not auto-index
-- foreign keys. getThreads() now fetches replies with `WHERE thread_id IN (...)`
-- (scoped to the current thread set instead of a full-table scan), so this index
-- supports that lookup and the ON DELETE CASCADE from forum_threads.
CREATE INDEX IF NOT EXISTS idx_forum_replies_thread_id
  ON public.forum_replies (thread_id);
