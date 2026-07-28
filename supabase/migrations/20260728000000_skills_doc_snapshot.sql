-- Stored SKILL.md / README.md snapshot for each skill's detail page.
--
-- /skills/{id} pages had ~123 words of visible text, only ~21% of it unique to
-- the page — the rest was shared nav/footer chrome. There was no more data to
-- render: the row holds a title, a one-line description and some tags. This adds
-- the skill's own documentation, pulled from its source repo.
--
-- Fetched out-of-band by scripts/refresh-skill-docs.mjs, NOT at build or request
-- time: 101 GitHub calls per build is slow, rate-limit-fragile, and would make
-- builds fail whenever GitHub is down.
--
--   doc_markdown   : the fetched markdown, already truncated (see DOC_MAX_CHARS
--                    in src/lib/githubDocSource.ts). Raw markdown, not HTML —
--                    it is sanitized at render time so the sanitizer policy can
--                    change without a re-fetch.
--   doc_path       : path within the repo the doc came from (e.g. "SKILL.md",
--                    "skill-creator/README.md"). Null when nothing was found.
--   doc_source_url : canonical github.com/blob URL, for attribution.
--   doc_truncated  : true when the upstream file was longer than the cap, so the
--                    page can say so and link out for the rest.
--   doc_fetched_at : last successful refresh; null means never fetched.
--
-- All columns are nullable/defaulted and additive — existing rows and every
-- write path are untouched, and a row with no doc renders exactly as before.

alter table public.skills add column if not exists doc_markdown text;
alter table public.skills add column if not exists doc_path text;
alter table public.skills add column if not exists doc_source_url text;
alter table public.skills add column if not exists doc_truncated boolean not null default false;
alter table public.skills add column if not exists doc_fetched_at timestamptz;

-- Rollback (nothing else references these columns; dropping them restores the
-- previous behaviour exactly):
--
--   alter table public.skills drop column if exists doc_markdown;
--   alter table public.skills drop column if exists doc_path;
--   alter table public.skills drop column if exists doc_source_url;
--   alter table public.skills drop column if exists doc_truncated;
--   alter table public.skills drop column if exists doc_fetched_at;
