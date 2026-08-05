-- A real per-row change date for skill pages, so the sitemap can emit lastmod.
--
-- The sitemap omitted lastmod for every skill URL because no column recorded
-- when the rendered content changed. `doc_fetched_at` records when
-- scripts/refresh-skill-docs.mjs last ran: it stamped now() on every successful
-- fetch even when the re-fetched markdown was byte-identical, so it moves
-- constantly without the page changing. Before that, the sitemap served one
-- shared build date across all 150 URLs, which is what taught Google to ignore
-- lastmod on this site. Omission was the honest stopgap; these two columns are
-- the fix.
--
--   doc_content_hash   : sha256 of the *rendered* markdown — post-stripFrontmatter,
--                        post-truncateMarkdown, i.e. exactly the string stored in
--                        doc_markdown. Hashing the raw upstream file instead would
--                        make a frontmatter-only edit look like a content change.
--                        Null means "never hashed" (pre-migration rows, and rows
--                        with no doc).
--   content_updated_at : when the rendered content last actually changed.
--                        SEEDED from the row's creation instant (derived from the
--                        epoch-bearing id, the same value /api/feed already uses as
--                        publishedAt — see epochFromId in src/lib/epochId.ts) by
--                        scripts/seed-content-updated-at.mjs, then advanced ONLY by
--                        a genuine content change detected via doc_content_hash.
--                        Legacy `seed_*` ids carry no epoch and stay null.
--
-- Do NOT backfill this from doc_fetched_at. That column is refresher-run time, not
-- content-change time, and copying it here reintroduces the exact noise this
-- replaces.
--
-- Related hazard: changing DOC_MAX_CHARS or stripFrontmatter in
-- src/lib/githubDocSource.ts flips every row's hash at once, which would stamp all
-- ~100 rows with the same content_updated_at — the shared-date signal being fixed
-- here. Treat a change to either as requiring a deliberate re-seed decision.
--
-- Both columns are nullable with no default and are additive: nothing reads them
-- until the sitemap change ships, and every existing write path is untouched.

alter table public.skills add column if not exists doc_content_hash text;
alter table public.skills add column if not exists content_updated_at timestamptz;

comment on column public.skills.doc_content_hash is
  'sha256 of the rendered doc markdown (post-frontmatter-strip, post-truncate) — the same string stored in doc_markdown. Written by scripts/refresh-skill-docs.mjs; null means never hashed.';

comment on column public.skills.content_updated_at is
  'When the rendered content last actually changed. Seeded from the row creation instant derived from the epoch id, then advanced only when doc_content_hash changes. Never backfill this from doc_fetched_at — that is refresher-run time, not change time.';

-- Rollback (nothing else references these columns; dropping them restores the
-- previous behaviour exactly — the sitemap falls back to omitting skill lastmod):
--
--   alter table public.skills drop column if exists doc_content_hash;
--   alter table public.skills drop column if exists content_updated_at;

-- Verification:
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'skills'
--      and column_name in ('doc_content_hash', 'content_updated_at');
--   -- expect two rows, both is_nullable = YES
--
-- After running scripts/seed-content-updated-at.mjs:
--
--   select count(*) filter (where content_updated_at is not null) as seeded,
--          count(distinct content_updated_at)                     as distinct_dates,
--          count(*) filter (where id like 'seed\_%')               as legacy_ids
--     from public.skills;
--   -- expect seeded = distinct_dates (no two rows share a date), and every
--   -- unseeded row to be a legacy seed_* id.
