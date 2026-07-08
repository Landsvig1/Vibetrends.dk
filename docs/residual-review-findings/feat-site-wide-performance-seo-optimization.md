# Residual Review Findings

Source: multi-persona code review (11 reviewers) on `feat/site-wide-performance-seo-optimization` against base `1b92c15`, run 2026-07-08. Four corroborated/high-confidence findings were fixed in follow-up commits (`c73a2a2`, `555baa4`, `2805d70`, `5da5365`). The items below were deliberately left unfixed — recorded here so they aren't silently lost.

## P1 — `src/lib/db.ts` crossed 1000 lines without decomposition

**Reviewer:** maintainability (confidence 100)

The file grew from 964 to ~1450 lines across three sequential passes (SQL search, Cache Components caching, upvote RPC). A natural split exists along seams the file's own comments already point at: extract the five row→domain mappers into `db/mappers.ts`, and/or collapse the five near-identical `upvoteX` functions behind one parameterized `toggleUpvote(kind, id, tags)` helper (mirroring the migration's own per-kind dispatch). Not applied — this is a structural refactor of already-tested, working code, and the risk/effort didn't fit this PR's scope. Worth doing as a standalone follow-up before the next pass through this file.

## P2 — SQL search now matches across both languages regardless of requested `lang`

**Reviewer:** api-contract (confidence 45)

Before this PR, the JS-side search filter ran on the already-language-mapped field, so `lang=en` only matched English title/description. The new SQL `.or()` filter (and its JS safety-net mirror) matches `title_da` OR `title_en` OR `description_da` OR `description_en` regardless of requested `lang`. This is a silent behavior widening, not a regression that breaks anything, but no test asserts search is scoped to the requested language. Low priority; flagging so it's a conscious choice if a user reports "why does my Danish search show English results."

## Residual risks (not confirmed as live bugs, flagged for awareness)

- **RLS insert/select mismatch on create*/delete* paths** (adversarial, confidence 50) — if an insert succeeds but a subsequent select fails under RLS, `revalidateTag` could be skipped for a mutation that did commit. No test covers this; worth a targeted check if create/delete flows ever show stale-list symptoms.
- **Cache-miss read racing a concurrent `revalidateTag` call** (adversarial, confidence 50) — a stale in-flight read could theoretically repopulate the cache after invalidation already fired. This is the exact class of risk the plan's Risks & Dependencies section already calls out as needing verification against a live Vercel preview (not reproducible locally) — not fixed here, tracked as a deploy-time verification item, not a code defect.
- **`cacheLife('max')` caches transient Supabase errors indistinguishably from legitimate empty results** (reliability, confidence 55) — inherent to the tag-only-invalidation design (KTD2's deliberate tradeoff, not a regression). A transient DB hiccup during a cache-population request could memoize an empty list for up to the cache's max lifetime until a mutation on that tag fires.
- **Single-arg `revalidateTag(tag)` is documented as deprecated in Next.js** (project-standards, confidence 40) — current runtime behavior (immediate expiry) is exactly what correctness requires here and is well-documented in code, but watch for this being removed in a future Next.js version.
- **Trigram/GIN index verification for SQL `ilike` search wasn't explicitly documented as checked** (learnings-researcher) — KTD3 made this conditional on a baseline-performance check; table sizes are small enough that `ilike` is almost certainly fine without an index, but no commit or test records that the check was done.
- **`getProjects`/`getAgents` injection tests check result correctness but not filter-clause structure** (testing, confidence unspecified) — only `getSkills`'s injection test inspects the actual `.or()` clause content to prove dangerous characters were stripped; the other two only check the result array, which would pass even if sanitization silently did nothing.

## Production verification still required before this is fully proven safe

Per the plan's own Risks & Dependencies section: the upvote-then-reload correctness guarantee (Cache Components tagged invalidation) must be verified against a deployed Vercel preview, not just local tests — both prior stale-count incidents (`0db6f62`, `e224ec4`) were invisible locally. This PR has not been deployed yet.
