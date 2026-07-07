---
title: "feat: add-vibe pipeline — URL to /vibes in one command"
date: 2026-06-24
type: feat
status: ready
---

# feat: add-vibe pipeline — URL to /vibes in one command

**Problem:** Adding projects to /vibes requires manual DB inserts. There is no fast path from "here's a URL" to a live entry with a real thumbnail.

**Scope:** Three deliverables — a one-time storage setup script, a combined upload+insert script, and a Claude Code skill that orchestrates the full pipeline per URL.

---

## Requirements

- R1: Given one or more URLs, Claude fetches each page and produces a concise 1-sentence description.
- R2: A Playwright screenshot is taken at a fixed viewport and saved as the thumbnail.
- R3: The thumbnail is uploaded to Supabase Storage and the resulting public URL is stored on the row.
- R4: The project row is inserted into the `vibes` table with title, description, demo URL, image URL, and author.
- R5: The pipeline runs entirely inside a Claude Code session — no web-facing endpoints, no manual DB access.
- R6: A reusable skill file (`/add-vibe`) encapsulates the workflow so it works identically in any future session.

---

## Key Technical Decisions

**Direct pg insert over the API route**
`POST /api/vibes` requires a live Supabase session cookie. Scripts running in a Claude Code session have no browser session. Direct pg + `DATABASE_URL` (same pattern as the migration scripts) is the correct path.

**Service role key for Storage uploads**
The Supabase anon key cannot write to Storage without an open public-upload policy (a security risk). The service role key bypasses RLS and is the standard pattern for admin scripts. It is added to `.env.local` only — never committed.

**Single combined script (`add-vibe.mjs`)**
Splitting upload and insert into two scripts means the skill needs to pass state between them. One script that does upload → insert → confirm is simpler for Claude to invoke and easier to debug.

**Playwright CLI screenshot, not a custom script**
`npx playwright screenshot` is available today (devDep), takes a URL and an output path, and supports `--viewport-size` and `--wait-for-timeout`. No wrapper needed.

**Skill lives in `.claude/skills/`**
Project-level skills live in `<project>/.claude/skills/<name>/SKILL.md`. This keeps the skill co-located with the scripts it invokes and out of the global `~/.claude/skills/`.

---

## High-Level Technical Design

```
User gives URL(s) in session
        │
        ▼
[Claude: WebFetch URL]
  → reads page title + content
  → produces 1-sentence description
        │
        ▼
[Bash: npx playwright screenshot]
  --viewport-size 1280,720
  --wait-for-timeout 2000
  <url> /tmp/vibe-<timestamp>.png
        │
        ▼
[Bash: node add-vibe.mjs]
  --url     <demo url>
  --title   <inferred from page>
  --desc    <1-sentence description>
  --image   /tmp/vibe-<timestamp>.png
  --author  <inferred or "Anonym">
        │
        ├─→ upload image → Supabase Storage vibes-thumbnails/
        │     └─→ returns public URL
        │
        └─→ INSERT INTO vibes (pg + DATABASE_URL)
              └─→ outputs inserted row id
```

---

## Scope Boundaries

**In scope:** storage setup, upload+insert script, skill file, one-time env var addition.

**Out of scope:** bilingual descriptions (single description stored in both `_da` and `_en` columns), batch CSV import, a web UI for adding projects.

### Deferred to Follow-Up Work
- Prompt the user to review/edit title and description before inserting (currently auto-insert)
- Support for `githubUrl` field (can be passed as optional flag later)

---

## Implementation Units

### U1. Supabase Storage bucket setup script

**Goal:** Create the `vibes-thumbnails` bucket and configure it as public so inserted image URLs are accessible without auth.

**Requirements:** R3

**Dependencies:** none

**Files:**
- `src/scripts/setup-vibes-storage.mjs`

**Approach:**
Uses `@supabase/supabase-js` with the `SUPABASE_SERVICE_ROLE_KEY` to call `storage.createBucket('vibes-thumbnails', { public: true })`. Wraps the call in an idempotent check (`getPublicUrl` on a dummy path to detect if the bucket already exists, or catch the "already exists" error code). Outputs the bucket's public base URL on success.

The user must first add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (available in the Supabase dashboard under Settings → API → service_role). This is a one-time prerequisite documented as a comment at the top of the script.

Run once: `node --env-file=.env.local src/scripts/setup-vibes-storage.mjs`

**Patterns to follow:** `src/scripts/migrate-direct.mjs` for the env-loading pattern and error handling style.

**Test scenarios:**
- Happy path: bucket does not exist → created, public URL logged.
- Idempotent: bucket already exists → no error, logs "already exists, skipping".
- Missing `SUPABASE_SERVICE_ROLE_KEY` → exits with a clear error before any API call.

**Verification:** Running the script twice produces no error on the second run. The Supabase dashboard shows a public `vibes-thumbnails` bucket.

---

### U2. Combined upload + insert script (`add-vibe.mjs`)

**Goal:** Given a local image path and project metadata, upload the image to Supabase Storage and insert a row into the `vibes` table.

**Requirements:** R3, R4

**Dependencies:** U1 (bucket must exist)

**Files:**
- `src/scripts/add-vibe.mjs`

**Approach:**
CLI flags parsed with `process.argv` (no extra dependency): `--url`, `--title`, `--desc`, `--image`, `--author` (optional, defaults to `"Anonym"`).

Step 1 — Image upload:
- Read the local file with `fs.readFileSync`
- Upload to `vibes-thumbnails/<timestamp>-<slug>.png` using `supabase.storage.from('vibes-thumbnails').upload(path, buffer, { contentType: 'image/png', upsert: false })`
- Derive public URL via `supabase.storage.from('vibes-thumbnails').getPublicUrl(path)`

Step 2 — DB insert:
- Uses `pg` + `DATABASE_URL` (same pattern as migration scripts)
- Inserts into `public.vibes`: `id` = `'p_' + Date.now()`, `title_da` = `title_en` = title, `description_da` = `description_en` = desc, `demo_url` = url, `image_url` = public URL from step 1, `author` = author, `upvotes` = 1, `tools` = `'{}'`, `prompts` = `'{}'`
- Logs the inserted `id` on success

**Patterns to follow:** `src/scripts/migrate-direct.mjs` for env-loading and pg client setup. `src/scripts/setup-vibes-storage.mjs` (U1) for the Supabase storage client init pattern.

**Test scenarios:**
- Happy path: valid image path + all required flags → image appears in Storage, row appears in `vibes` table.
- Missing required flag (`--url`, `--title`, `--desc`, `--image`) → exits with usage hint before any API call.
- Image file not found → exits with clear error before uploading.
- Storage upload fails (e.g., wrong bucket name) → script exits with error, no DB insert attempted.
- Missing `DATABASE_URL` → exits with clear error.

**Verification:** After running the script, `SELECT id, title_da, image_url FROM vibes ORDER BY id DESC LIMIT 1` shows the new row with a valid `https://` image URL.

---

### U3. Skill file (`/add-vibe`)

**Goal:** A Claude Code skill that Claude reads and follows to run the full pipeline — from URL(s) to live /vibes entries — in any session.

**Requirements:** R1, R2, R5, R6

**Dependencies:** U1 (bucket setup done), U2 (script exists)

**Files:**
- `.claude/skills/add-vibe/SKILL.md`

**Approach:**
The skill is a markdown file with YAML frontmatter (name, description, trigger guidance) and a step-by-step workflow section.

Workflow the skill encodes:

1. **Accept URLs** — collect all URLs given in the prompt (one or many).
2. **For each URL:**
   a. `WebFetch` the URL — read the page title (OG title > `<title>` tag), the meta description if present, and enough body text to form a description.
   b. Generate: a short page title (≤ 60 chars), a single concise sentence describing what the project does (no tech stack, no filler — just what it is). Try to infer the author name from the page footer/about; default to `"Anonym"`.
   c. Run: `npx playwright screenshot --viewport-size 1280,720 --wait-for-timeout 2000 --browser chromium <url> /tmp/vibe-<timestamp>.png`
   d. Run: `node --env-file=.env.local src/scripts/add-vibe.mjs --url <url> --title "<title>" --desc "<desc>" --image /tmp/vibe-<timestamp>.png --author "<author>"`
   e. Confirm with the inserted project ID.
3. After all URLs are processed, print a short summary (N projects added, links to `/vibes/<id>`).

The skill also documents the one-time setup prerequisite: `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` and having run `setup-vibes-storage.mjs` once.

**Patterns to follow:** `~/.claude/skills/debug/SKILL.md` for YAML frontmatter format and tone.

**Test scenarios:**
- Single URL: skill runs all 4 steps, outputs project ID.
- Multiple URLs: skill loops correctly, produces one summary at the end.
- Playwright fails (site blocks headless browsers): skill logs the screenshot error and asks whether to proceed without a thumbnail or skip the URL.
- `add-vibe.mjs` exits non-zero: skill surfaces the error and stops rather than silently inserting a broken row.

**Verification:** After invoking `/add-vibe` with a URL in a fresh session, the project appears at `/vibes` with a real screenshot thumbnail and the generated description.

---

## Open Questions

- **Playwright browser install**: `npx playwright install chromium` may be needed if the Chromium binary is missing. The skill should check for this and output the install command if the screenshot step fails with a "browser not found" error. Defer to implementation to detect and handle gracefully.

---

## Dependencies / Prerequisites

1. `SUPABASE_SERVICE_ROLE_KEY` added to `.env.local` (one-time, from Supabase dashboard → Settings → API).
2. `npx playwright install chromium` run once if the binary is not already present.
3. `setup-vibes-storage.mjs` run once to create the bucket.
