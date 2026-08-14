import { supabasePublic, createSupabaseServerClient } from "./supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cacheTag, cacheLife, revalidateTag as _revalidateTag } from 'next/cache';

/**
 * Calls revalidateTag WITHOUT a profile argument — KTD2 hard constraint.
 *
 * The two-arg form `revalidateTag(tag, 'max')` defaults to stale-while-revalidate,
 * which would silently reintroduce the stale-upvote-count bug this codebase already
 * fixed twice (commits 0db6f62, e224ec4). The no-arg form gives IMMEDIATE expiry
 * (documented as "deprecated legacy behavior, equivalent to updateTag") so the next
 * request after a vote always blocks on a fresh DB read rather than getting a cached
 * pre-vote count.
 *
 * TypeScript's `revalidateTag` signature requires a second argument; we suppress that
 * error here rather than at every call site. The deprecation is a type-level concern —
 * the runtime behavior (immediate expiry) is exactly what correctness requires.
 *
 * @see node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md
 */
// @ts-expect-error — deliberate single-arg form: immediate expiry, not stale-while-revalidate
const revalidateTag = (tag: string): void => _revalidateTag(tag);

/** Identity + client resolved by `resolveBotRequestAuth()` for bearer-authenticated
 * (non-browser) callers. When passed to `createProject`/`createSkill`, the write
 * runs on this client instead of a freshly-built cookie client, so RLS sees the
 * bearer token's `authenticated` role rather than falling back to `anon`. */
export interface ActingAs {
  user: { id: string; username: string };
  supabase: SupabaseClient;
}

/** Shared by createProject/createSkill: use the bearer-authenticated client
 * and identity when present (bot writes), otherwise resolve the cookie
 * session the way every pre-existing write path already does. */
async function resolveActor(actingAs?: ActingAs): Promise<{ supabase: SupabaseClient; userId: string | null }> {
  if (actingAs) return { supabase: actingAs.supabase, userId: actingAs.user.id };

  const supabase = await createSupabaseServerClient();
  const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  return { supabase, userId };
}

import { visibleOnly, reviewStateForWrite } from "./reviewGate";
import { skillCategoryLabel, type SkillCategorySlug } from "./skillCategories";
import { type ForumCategoryKey } from "./forumCategories";
import { slugify, RESERVED_SLUGS } from "./slug";
// Shared with scripts/seed-content-updated-at.mjs so the feed's publishedAt and
// the seeded skills.content_updated_at can never drift apart — they are the same
// derivation from the same id.
import { epochFromId } from "./epochId";

/**
 * How many slugs an insert tries before giving up: `x`, `x-2` … `x-5`.
 *
 * Bounded rather than open-ended because the retry loop can also spin on a
 * unique violation that has nothing to do with the slug (`id` is `s_` +
 * Date.now(), so two submissions inside one millisecond collide on it), and an
 * unbounded loop would turn that into a hang instead of an error.
 */
const SLUG_MAX_ATTEMPTS = 5;

/**
 * The slugs an insert should try, in order.
 *
 * A base slug that is reserved (see RESERVED_SLUGS — a skill slugged "topic"
 * would be shadowed by src/app/skills/topic) skips straight to the suffixed
 * form; it is never offered bare.
 */
function slugCandidates(base: string): string[] {
  const start = RESERVED_SLUGS.has(base) ? 2 : 1;
  return Array.from({ length: SLUG_MAX_ATTEMPTS }, (_, i) => {
    const n = start + i;
    return n === 1 ? base : `${base}-${n}`;
  });
}

/** PostgREST surfaces a unique-index violation with the Postgres SQLSTATE. */
const UNIQUE_VIOLATION = '23505';

/**
 * Run an insert once per slug candidate, stopping at the first success.
 *
 * Without this, submitting a title someone already used surfaces the unique
 * violation as the generic "Kunne ikke oprette …" throw, which reads to the
 * submitter as an outage rather than a name clash. Any error that is not a
 * unique violation returns immediately — retrying a malformed insert five
 * times helps nobody.
 */
async function insertWithUniqueSlug<T>(
  baseSlug: string,
  attempt: (slug: string) => PromiseLike<{ data: T | null; error: { code?: string } | null }>
): Promise<{ data: T | null; error: { code?: string } | null }> {
  let last: { data: T | null; error: { code?: string } | null } = { data: null, error: null };
  for (const slug of slugCandidates(baseSlug)) {
    last = await attempt(slug);
    if (!last.error) return last;
    if (last.error.code !== UNIQUE_VIOLATION) return last;
  }
  return last;
}

export interface Skill {
  id: string;
  /** URL slug — the canonical path is /skills/{slug}. Stable across title edits. */
  slug: string;
  /** Canonical skill category slug (see src/lib/skillCategories.ts). */
  category: SkillCategorySlug;
  /** Localized category label resolved from `category` for display. */
  categoryLabel: string;
  title: string;
  vibeCoder: string;
  vibeCoderTitle: string;
  rating: number;
  reviewsCount: number;
  upvotes: number;
  description: string;
  tags: string[];
  githubUrl?: string;
  /** Attribution for seeded/imported entries (e.g. the upstream repo URL). */
  source?: string;
  /**
   * When the rendered doc content last actually changed — the sitemap's lastmod
   * for this page. Null for legacy `seed_*` rows, whose ids carry no creation
   * epoch to seed from; the sitemap omits lastmod rather than inventing one.
   * NOT doc_fetched_at, which is refresher-run time (see
   * scripts/refresh-skill-docs.mjs).
   *
   * Optional because a Skill built outside mapSkill (test fixtures, any future
   * narrowed select) has no date to offer; mapSkill always populates it, and
   * both absent and null mean the same thing to the sitemap — omit lastmod.
   */
  contentUpdatedAt?: string | null;
}

export type SkillView = "danish" | "hot" | "trending";

/** Coerce an untrusted value to a valid SkillView, or undefined. Shared by the
 * REST route, the MCP tool, and the topic landing page so the whitelist lives
 * in one place. */
export function parseSkillView(v: unknown): SkillView | undefined {
  return v === "danish" || v === "hot" || v === "trending" ? v : undefined;
}

export interface ShowcaseProject {
  id: string;
  /** URL slug — the canonical path is /vibes/{slug}. Stable across title edits. */
  slug: string;
  title: string;
  author: string;
  description: string;
  tools: string[];
  prompts: string[];
  upvotes: number;
  demoUrl: string;
  githubUrl?: string;
  imageUrl: string;
  createdAt: string;
  /** Project comes from a Danish contributor (drives the Dansk tab on /vibes). */
  isDanish: boolean;
  /** Project is specifically about Denmark (sorted first in the Dansk tab). */
  denmarkSpecific: boolean;
}

export interface ForumReply {
  id: string;
  author: string;
  content: string;
  upvotes: number;
  createdAt: string;
}

export interface ForumThread {
  id: string;
  title: string;
  author: string;
  category: ForumCategoryKey;
  content: string;
  upvotes: number;
  replies: ForumReply[];
  createdAt: string;
  /** Thread comes from a Danish contributor (drives the Dansk tab on /forum). */
  isDanish: boolean;
  /** Thread is specifically about Denmark (sorted first in the Dansk tab). */
  denmarkSpecific: boolean;
}

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  readTime: string;
  publishedAt: string;
  imageUrl: string;
  category: "Guides" | "Agents" | "Workflow";
}

/**
 * scripts/seed-e2e-fixtures.mjs writes fixture rows into the *live* tables
 * (forum_threads, agents, vibes) for the duration of a CI run. Anything that
 * decides what the outside world sees — sitemap membership, robots indexability
 * — has to discount them, or a build landing inside a seed window publishes a
 * hub on the strength of a row that is about to be deleted.
 *
 * Shared rather than re-derived per call site: sitemap.ts and the hub layouts
 * must agree on emptiness, and they silently disagreed when only one filtered.
 */
export const isE2eFixtureId = (id: string) => id.startsWith("e2e-fixture-");

/** SQL-side form of isE2eFixtureId, for count queries that never load rows. */
const E2E_FIXTURE_ID_PATTERN = "e2e-fixture-%";

/**
 * Number of real (non-fixture) rows in a hub table.
 *
 * Exists because every other reader here swallows query errors into `[]`, which
 * is indistinguishable from "the table is empty". That is fine for a list —
 * rendering zero cards during an outage is a cosmetic failure that fixes itself
 * on the next read. It is NOT fine for the decisions built on emptiness:
 * robots noindex, sitemap membership, and whether the nav links a hub at all.
 * Those run at build time, get memoized by `'use cache'` + cacheLife('max'),
 * and a single failed read during a deploy would otherwise bake "this hub is
 * empty" into every page until something happens to revalidate the tag.
 *
 * So this throws instead. A rejected promise is not written to the cache, so
 * the failure stays transient, and callers get to decide how to degrade —
 * see hasForumContent/hasBlogContent in lib/hubContent.ts, which fail open.
 *
 * `head: true` means PostgREST returns the count without any row payload.
 */
async function countRealRows(table: "forum_threads" | "blog_posts"): Promise<number> {
  // Pending rows are discounted for the same reason fixture rows are: this
  // count decides whether a hub *exists* (nav link, sitemap entry, robots
  // index), and a submission nobody has approved yet must not make an empty
  // hub look populated. Without this, one queued blog post would un-hide
  // /blog, put it in the sitemap and drop its noindex while the hub still
  // renders zero posts — a thin page published on the strength of a row the
  // public cannot see.
  const { count, error } = await visibleOnly(
    supabasePublic.from(table).select("id", { count: "exact", head: true }),
    table,
  ).not("id", "like", E2E_FIXTURE_ID_PATTERN);

  if (error) {
    throw new Error(`Failed to count rows in ${table}: ${error.message}`);
  }

  // A null count with no error shouldn't happen, but treating it as 0 would be
  // the exact silent-empty failure this function exists to prevent.
  if (count === null) {
    throw new Error(`Count for ${table} came back null`);
  }

  return count;
}

/**
 * Deliberately NOT 'threads-list' / 'blog-posts'.
 *
 * Reusing those would have been free plumbing, but they are revalidated by
 * upvoteThread, upvoteReply, addReply and deleteReply as well as by create and
 * delete. Since these counts are read from the root layout, every upvote on a
 * single thread would drop the nav's cache entry for the entire site and make
 * the next request anywhere re-run two count queries.
 *
 * Only create and delete can change whether a hub is empty, so only those
 * revalidate this tag. Upvotes and replies leave it alone.
 */
const HUB_EMPTINESS_TAG = 'hub-emptiness';

/** @throws if the read fails — see countRealRows. */
export async function countRealThreads(): Promise<number> {
  'use cache'
  cacheLife('max')
  cacheTag(HUB_EMPTINESS_TAG)

  return countRealRows("forum_threads");
}

/** @throws if the read fails — see countRealRows. */
export async function countRealBlogPosts(): Promise<number> {
  'use cache'
  cacheLife('max')
  cacheTag(HUB_EMPTINESS_TAG)

  return countRealRows("blog_posts");
}

export interface Agent {
  id: string;
  /** URL slug — the canonical path is /cli/{slug} or /mcp/{slug}. Stable across renames. */
  slug: string;
  name: string;
  developer: string;
  // Feed-vs-host taxonomy (src/lib/feedTypes.ts). "Host" rows are retained but
  // excluded from every catalog surface — they are connection targets, not
  // catalog items.
  category: "CLI" | "MCP Server" | "Host";
  description: string;
  installCommand: string;
  systemPrompt: string;
  upvotes: number;
  tags: string[];
  /** Tool comes from a Danish contributor (drives the Dansk tab on /cli and /mcp). */
  isDanish: boolean;
  /** Tool is specifically about Denmark (sorted first in the Dansk tab). */
  denmarkSpecific: boolean;
  /** Canonical repo/site for the tool (like skills' githubUrl), when known. */
  sourceUrl?: string;
}

// Database row shapes (snake_case, bilingual columns)
interface SkillRow {
  id: string;
  /**
   * Null only in the window between the column being added and
   * scripts/backfill-slugs.mjs running — the unique index and NOT NULL land
   * after that. Mappers fall back to the id so a null can never render as
   * "/skills/undefined".
   */
  slug?: string | null;
  title_da: string;
  title_en: string;
  category: string;
  vibe_coder: string;
  vibe_coder_title_da: string;
  vibe_coder_title_en: string;
  rating: number | string;
  reviews_count: number;
  upvotes?: number;
  /** Null until translated — read it through withEnglishFallback, never raw. */
  description_da: string | null;
  description_en: string;
  tags: string[] | null;
  github_url: string | null;
  source?: string | null;
  hot_rank?: number | null;
  trending_rank?: number | null;
  /** Skill comes from a Danish contributor (drives the Dansk view). */
  is_danish?: boolean;
  /** Skill is specifically about Denmark (sorted first in the Dansk view). */
  denmark_specific?: boolean;
  /** See Skill.contentUpdatedAt. Absent on rows selected with a narrowed column list. */
  content_updated_at?: string | null;
}

interface ShowcaseRow {
  id: string;
  /** See SkillRow.slug. */
  slug?: string | null;
  title_da: string;
  title_en: string;
  author: string;
  /** Null until translated — read it through withEnglishFallback, never raw. */
  description_da: string | null;
  description_en: string;
  tools: string[] | null;
  prompts: string[] | null;
  upvotes: number | null;
  demo_url: string | null;
  github_url: string | null;
  image_url: string | null;
  created_at: string;
  /** Project comes from a Danish contributor (drives the Dansk view). */
  is_danish?: boolean;
  /** Project is specifically about Denmark (sorted first in the Dansk view). */
  denmark_specific?: boolean;
}

interface ThreadRow {
  id: string;
  title_da: string;
  title_en: string;
  author: string;
  category: ForumThread["category"];
  content_da: string;
  content_en: string;
  upvotes: number | null;
  created_at: string;
  /** Thread comes from a Danish contributor (drives the Dansk view). */
  is_danish?: boolean;
  /** Thread is specifically about Denmark (sorted first in the Dansk view). */
  denmark_specific?: boolean;
}

interface ReplyRow {
  id: string;
  thread_id: string;
  author: string;
  content_da: string;
  content_en: string;
  upvotes?: number;
  created_at: string;
}

interface BlogPostRow {
  id: string;
  title_da: string;
  title_en: string;
  excerpt_da: string;
  excerpt_en: string;
  content_da: string;
  content_en: string;
  author: string;
  read_time: string;
  published_at: string;
  image_url: string;
  category: BlogPost["category"];
}

interface AgentRow {
  id: string;
  /** See SkillRow.slug. */
  slug?: string | null;
  name: string;
  developer: string;
  // Widened to string so a legacy pre-migration category never trips the
  // mapper before the recategorization migration has run in every environment.
  category: string;
  /** Null until translated — read it through withEnglishFallback, never raw. */
  description_da: string | null;
  description_en: string;
  install_command: string;
  system_prompt_da: string;
  system_prompt_en: string;
  upvotes: number | null;
  tags: string[] | null;
  is_danish?: boolean;
  denmark_specific?: boolean;
  source_url?: string | null;
}

/**
 * Danish text with an English fallback.
 *
 * `description_da` is null when nothing has been translated yet — see
 * supabase/migrations/20260804000000_description_da_nullable.sql, which cleared
 * the rows where the "Danish" was a verbatim copy of the English. A Danish
 * reader gets the English original rather than an empty card, and the English
 * path is never affected by the fallback.
 */
function withEnglishFallback(da: string | null | undefined, en: string, lang: 'da' | 'en'): string {
  return lang === 'en' ? en : da ?? en;
}

// Map database entities to frontend camelCase objects
function mapSkill(s: SkillRow, lang: 'da' | 'en'): Skill {
  return {
    id: s.id,
    // The id fallback only fires in the pre-backfill window; it stops a URL
    // producer emitting "/skills/undefined" if a row is ever missing one.
    slug: s.slug || s.id,
    title: lang === 'en' ? s.title_en : s.title_da,
    // DB rows are migrated to slugs; skillCategoryLabel still falls back
    // safely for any legacy value, so the cast documents intent without
    // losing that guard.
    category: s.category as SkillCategorySlug,
    categoryLabel: skillCategoryLabel(s.category, lang),
    vibeCoder: s.vibe_coder,
    vibeCoderTitle: lang === 'en' ? s.vibe_coder_title_en : s.vibe_coder_title_da,
    rating: Number(s.rating),
    reviewsCount: s.reviews_count,
    upvotes: s.upvotes ?? 0,
    description: withEnglishFallback(s.description_da, s.description_en, lang),
    tags: s.tags || [],
    githubUrl: s.github_url || undefined,
    source: s.source || undefined,
    contentUpdatedAt: s.content_updated_at ?? null,
  };
}

function mapProject(p: ShowcaseRow, lang: 'da' | 'en'): ShowcaseProject {
  return {
    id: p.id,
    // See mapSkill.
    slug: p.slug || p.id,
    title: lang === 'en' ? p.title_en : p.title_da,
    author: p.author,
    description: withEnglishFallback(p.description_da, p.description_en, lang),
    tools: p.tools || [],
    prompts: p.prompts || [],
    upvotes: p.upvotes || 0,
    demoUrl: p.demo_url || '',
    githubUrl: p.github_url || undefined,
    imageUrl: p.image_url || '/images/autonewsletter.jpg',
    createdAt: p.created_at,
    isDanish: p.is_danish ?? false,
    denmarkSpecific: p.denmark_specific ?? false,
  };
}

function mapThread(t: ThreadRow, replies: ReplyRow[], lang: 'da' | 'en'): ForumThread {
  return {
    id: t.id,
    title: lang === 'en' ? t.title_en : t.title_da,
    author: t.author,
    category: t.category,
    content: lang === 'en' ? t.content_en : t.content_da,
    upvotes: t.upvotes || 0,
    replies: (replies || []).map(r => ({
      id: r.id,
      author: r.author,
      content: lang === 'en' ? r.content_en : r.content_da,
      upvotes: r.upvotes ?? 0,
      createdAt: r.created_at,
    })),
    createdAt: t.created_at,
    isDanish: t.is_danish ?? false,
    denmarkSpecific: t.denmark_specific ?? false,
  };
}

function mapBlogPost(b: BlogPostRow, lang: 'da' | 'en'): BlogPost {
  return {
    id: b.id,
    title: lang === 'en' ? b.title_en : b.title_da,
    excerpt: lang === 'en' ? b.excerpt_en : b.excerpt_da,
    content: lang === 'en' ? b.content_en : b.content_da,
    author: b.author,
    readTime: b.read_time,
    publishedAt: b.published_at,
    imageUrl: b.image_url,
    category: b.category,
  };
}

const AGENT_CATEGORIES = ['CLI', 'MCP Server', 'Host'] as const;

// Narrow the widened DB string to the union, defaulting any legacy value
// ('DevTools'/'Writing'/'Browsing') that survives the recategorization-window
// to 'CLI' rather than leaking a non-union string through a bare cast.
// This guard can be removed once the migration is confirmed in every env.
function toAgentCategory(value: string): Agent["category"] {
  return (AGENT_CATEGORIES as readonly string[]).includes(value)
    ? (value as Agent["category"])
    : 'CLI';
}

function mapAgent(a: AgentRow, lang: 'da' | 'en'): Agent {
  return {
    id: a.id,
    // See mapSkill.
    slug: a.slug || a.id,
    name: a.name,
    developer: a.developer,
    category: toAgentCategory(a.category),
    description: withEnglishFallback(a.description_da, a.description_en, lang),
    installCommand: a.install_command,
    systemPrompt: lang === 'en' ? a.system_prompt_en : a.system_prompt_da,
    upvotes: a.upvotes || 0,
    tags: a.tags || [],
    isDanish: a.is_danish ?? false,
    denmarkSpecific: a.denmark_specific ?? false,
    sourceUrl: a.source_url ?? undefined,
  };
}

// DB API functions utilizing Supabase

/**
 * Sanitize a user-supplied search term before embedding it in a PostgREST
 * `.or()` filter string (KTD3 injection resistance).
 *
 * Strips characters with syntactic meaning in PostgREST's filter grammar
 * (`,` `.` `(` `)` `*`) and SQL LIKE wildcards (`%` `_`) so the term can
 * only ever populate the `ilike` pattern position — it cannot redefine the
 * filter structure or introduce extra wildcard behaviour.
 *
 * The sanitized term is used in `.or()` filter strings of the form:
 *   `title_da.ilike.%term%,tags::text.ilike.%term%,...`
 * where the outer `%` wildcards are added by the calling code (not the user).
 * Casting array columns to text (`tags::text`) produces the PostgreSQL text
 * representation `{elem1,elem2}`, which ilike can match against for
 * element-substring searches without a custom RPC or exact-element operators.
 */
export function sanitizeSearchTerm(raw: string): string {
  // Security concern: Stripping backslashes ('\\') alongside other delimiters is
  // critical because backslash is the default escape character in PostgreSQL LIKE/ILIKE.
  // Allowing unescaped backslashes can lead to escape bypass, query manipulation,
  // or database execution errors if malformed sequences are passed.
  // We also limit raw search term length to 100 characters to prevent DoS/memory exhaustion.
  const truncated = raw.slice(0, 100);
  return truncated.replace(/[,.()*%_\\\\]/g, '');
}

export async function getSkills(search?: string, category?: string, lang: 'da' | 'en' = 'da', view?: SkillView) {
  'use cache'
  cacheLife('max')
  // Both the broad entity-wide tag AND the variant-specific tag are set so that
  // a single revalidateTag('skills-list') call on any mutation invalidates every
  // cached variant (searched, filtered, sorted), not just the default one.
  // Next's tag matching is exact-string — prefix matching is not supported.
  cacheTag('skills-list', `skills-list:${category ?? 'all'}:${search ?? ''}:${lang}:${view ?? ''}`)

  let query = visibleOnly(supabasePublic.from('skills').select('*'), 'skills');

  if (category && category !== "All") {
    query = query.eq('category', category);
  }

  // Danish board: skills from Danish contributors (is_danish flag), ranked
  // by upvotes.
  if (view === 'danish') {
    query = query
      .eq('is_danish', true)
      .order('upvotes', { ascending: false });
  }

  // Snapshot Hot/Trending boards: restrict to ranked rows and order by the rank.
  // This is the seam the own-signal engine replaces later (plan Phase 4) — the
  // signature and callers stay identical when the body swaps to computed ranks.
  if (view === 'hot') {
    query = query.not('hot_rank', 'is', null).order('hot_rank', { ascending: true });
  } else if (view === 'trending') {
    query = query.not('trending_rank', 'is', null).order('trending_rank', { ascending: true });
  }

  // Full catalog (no view): most upvoted first, same as the agents feeds.
  if (!view) {
    query = query.order('upvotes', { ascending: false });
  }

  // Search filters in JS, not SQL. A `tags::text.ilike` term inside .or() is
  // invalid PostgREST filter grammar (`::` casts aren't allowed there) — the
  // whole query 400s with PGRST100, the error branch below swallows it, and
  // every search returns []. Array-element substring matching has no valid
  // or= expression (.cs/.ov test exact equality), so the term can't just be
  // dropped from the clause either — a tags-only match would never be
  // fetched. The tables are small (~100 rows), so fetching the (category/
  // view-narrowed) set and filtering here is correct and cheap.
  let searchTerm: string | undefined;
  if (search) {
    const term = sanitizeSearchTerm(search).toLowerCase();
    if (term) searchTerm = term;
  }

  const { data, error } = await query;
  if (error || !data) return [];
  if (searchTerm) {
    const q = searchTerm;
    return data
      .filter(s =>
        s.title_da.toLowerCase().includes(q) ||
        s.title_en.toLowerCase().includes(q) ||
        (s.description_da ?? '').toLowerCase().includes(q) ||
        s.description_en.toLowerCase().includes(q) ||
        (s.tags || []).some((t: string) => t.toLowerCase().includes(q))
      )
      .map(s => mapSkill(s, lang));
  }

  return data.map(s => mapSkill(s, lang));
}

export async function getSkillById(id: string, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag(`skill-${id}`, `skill-${id}:${lang}`)

  const { data, error } = await visibleOnly(supabasePublic.from('skills').select('*'), 'skills').eq('id', id).single();
  if (error || !data) return null;
  return mapSkill(data, lang);
}

/**
 * Slug-keyed twin of getSkillById — the resolver behind /skills/{slug}.
 *
 * Tagged on BOTH the slug and the row id. The id tag is the load-bearing half:
 * every mutation path in this file calls revalidateTag(`skill-${id}`), and
 * without it an edited skill would serve stale content on its slug URL until
 * the cache profile expired. Tagging from fetched data after the await is the
 * documented pattern — see "Creating tags from external data" in
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cacheTag.md.
 *
 * A separate .eq() query rather than folding slug and id into one .or():
 * PostgREST's filter grammar has silently broken reads here before (the
 * `tags::text` cast, fixed in PR #85) and mocks cannot catch that class of bug.
 */
export async function getSkillBySlug(slug: string, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag(`skill-slug-${slug}`, `skill-slug-${slug}:${lang}`)

  const { data, error } = await visibleOnly(supabasePublic.from('skills').select('*'), 'skills').eq('slug', slug).single();
  if (error || !data) return null;
  cacheTag(`skill-${data.id}`, `skill-${data.id}:${lang}`)
  return mapSkill(data, lang);
}

/** The stored SKILL.md/README.md snapshot rendered on /skills/{id}. */
export interface SkillDoc {
  /** Raw markdown from the source repo — untrusted, sanitize before rendering. */
  markdown: string;
  /** Path within the repo, e.g. "SKILL.md" or "skill-creator/README.md". */
  path: string;
  /** Canonical github.com/blob URL, for attribution. */
  sourceUrl: string;
  /** Upstream file was longer than the cap and was cut short. */
  truncated: boolean;
  fetchedAt: string | null;
}

/**
 * Fetched separately from `getSkillById` on purpose: the doc is up to 14 KB per
 * row, and `getSkills` selects `*` for the listing pages. Keeping it out of the
 * Skill shape means the list payloads don't grow by ~1.4 MB.
 *
 * Refreshed out-of-band by scripts/refresh-skill-docs.mjs; returns null when the
 * skill has no github_url, its repo has no SKILL.md/README.md, or it has never
 * been refreshed. Callers must render fine in all of those cases.
 */
export async function getSkillDoc(id: string): Promise<SkillDoc | null> {
  'use cache'
  // NOT 'max' (revalidate: 30 days) like the rest of this file. The refresh
  // script writes straight to Postgres from a GitHub Action — it runs outside
  // the Next runtime and cannot call revalidateTag, and there is no revalidation
  // route. So the only thing that expires this entry is the profile itself.
  // Under 'max' the weekly cron would update the database while production kept
  // serving the old doc for up to a month. 'days' (revalidate: 24h) makes new
  // content visible within a day of the cron; the source files change on the
  // order of weeks, so nothing shorter buys anything.
  cacheLife('days')
  cacheTag(`skill-${id}`, `skill-doc-${id}`)

  // Gated too, though it is only ever reached from an already-resolved skill
  // page: a pending skill 404s before this runs. Defensive rather than
  // load-bearing — an id-keyed read that skipped the filter is exactly the
  // hole a future caller would fall into.
  const { data, error } = await visibleOnly(
    supabasePublic
      .from('skills')
      .select('doc_markdown, doc_path, doc_source_url, doc_truncated, doc_fetched_at'),
    'skills',
  )
    .eq('id', id)
    .single();

  if (error || !data?.doc_markdown || !data.doc_source_url) return null;

  return {
    markdown: data.doc_markdown,
    path: data.doc_path ?? '',
    sourceUrl: data.doc_source_url,
    truncated: Boolean(data.doc_truncated),
    fetchedAt: data.doc_fetched_at ?? null,
  };
}

export async function upvoteSkill(id: string, actingAs?: ActingAs) {
  const { supabase, userId } = await resolveActor(actingAs);

  if (!userId) {
    console.warn('Cannot upvote skill: User is not authenticated');
    return 0;
  }

  const adminCount = await adminBumpUpvotes(supabase, 'skill', id);
  if (adminCount !== null) {
    // Admin path also changes the count — invalidate both tags immediately.
    revalidateTag('skills-list')
    revalidateTag(`skill-${id}`)
    return adminCount;
  }

  // U8: toggle_upvote RPC replaces the old insert/delete/select pattern for
  // the count itself (the adminBumpUpvotes check above is a separate,
  // pre-existing round-trip on the non-admin path — not eliminated by U8).
  const { data: rpcData, error: rpcError } = await supabase.rpc('toggle_upvote', {
    kind: 'skill',
    target_id: id,
  });

  if (rpcError) {
    console.error('toggle_upvote RPC transport error for skill', id, rpcError);
    return 'rpc_error' as const;
  }
  if (rpcData === null || rpcData === undefined) {
    console.error('toggle_upvote RPC returned null for skill', id, '— entity not found');
    return null;
  }

  // Invalidate immediately after the mutation so the next read reflects the
  // new count. Called without a profile argument for immediate expiry (not
  // stale-while-revalidate) — KTD2 hard constraint.
  revalidateTag('skills-list')
  revalidateTag(`skill-${id}`)

  return rpcData as number;
}

export async function getProjects(search?: string, lang: 'da' | 'en' = 'da', sort: 'top' | 'new' | 'az' = 'new') {
  'use cache'
  cacheLife('max')
  // Both broad and variant-specific tags — see getSkills for rationale.
  cacheTag('projects-list', `projects-list:${search ?? ''}:${lang}:${sort}`)

  // 'new' = most recent (default), 'top' = most upvoted, 'az' = alphabetical. Mirrors getThreads.
  let query = visibleOnly(supabasePublic.from('vibes').select('*'), 'vibes');
  if (sort === 'top') {
    query = query.order('upvotes', { ascending: false });
  } else if (sort === 'az') {
    query = query.order(lang === 'en' ? 'title_en' : 'title_da', { ascending: true });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  // Search filters in JS, not SQL — a `tools::text` cast inside .or() is
  // invalid PostgREST grammar and made every search 400 → [] (see getSkills).
  let searchTerm: string | undefined;
  if (search) {
    const term = sanitizeSearchTerm(search).toLowerCase();
    if (term) searchTerm = term;
  }

  const { data, error } = await query;
  if (error || !data) return [];

  if (searchTerm) {
    const q = searchTerm;
    return data
      .filter(p =>
        p.title_da.toLowerCase().includes(q) ||
        p.title_en.toLowerCase().includes(q) ||
        (p.description_da ?? '').toLowerCase().includes(q) ||
        p.description_en.toLowerCase().includes(q) ||
        // The /vibes search field names "forfattere" as a searchable dimension
        // and this filter is what backs ?q= (and the agent JSON path). Keep in
        // sync with filterProjects() in vibes/VibesExplorer.tsx.
        (p.author ?? '').toLowerCase().includes(q) ||
        (p.tools || []).some((t: string) => t.toLowerCase().includes(q))
      )
      .map(p => mapProject(p, lang));
  }

  return data.map(p => mapProject(p, lang));
}

export async function getProjectById(id: string, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag(`project-${id}`, `project-${id}:${lang}`)

  const { data, error } = await visibleOnly(supabasePublic.from('vibes').select('*'), 'vibes').eq('id', id).single();
  if (error || !data) return null;
  return mapProject(data, lang);
}

/** Slug-keyed twin of getProjectById — see getSkillBySlug for the dual-tag rationale. */
export async function getProjectBySlug(slug: string, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag(`project-slug-${slug}`, `project-slug-${slug}:${lang}`)

  const { data, error } = await visibleOnly(supabasePublic.from('vibes').select('*'), 'vibes').eq('slug', slug).single();
  if (error || !data) return null;
  cacheTag(`project-${data.id}`, `project-${data.id}:${lang}`)
  return mapProject(data, lang);
}

/** Admin multi-like: admins bypass the one-per-user toggle — every call bumps
 * the counter via the admin_bump_upvotes RPC (SECURITY DEFINER, verifies
 * admin identity server-side). Returns the new count, or null when the caller
 * is not an admin so the caller falls through to the normal toggle path. */
async function adminBumpUpvotes(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  kind: 'vibe' | 'thread' | 'reply' | 'agent' | 'skill',
  targetId: string
): Promise<number | null> {
  const { data } = await supabase.rpc('admin_bump_upvotes', { kind, target_id: targetId });
  return typeof data === 'number' ? data : null;
}

export async function upvoteProject(id: string, actingAs?: ActingAs) {
  const { supabase, userId } = await resolveActor(actingAs);

  if (!userId) {
    console.warn('Cannot upvote: User is not authenticated');
    return 0;
  }

  const adminCount = await adminBumpUpvotes(supabase, 'vibe', id);
  if (adminCount !== null) {
    revalidateTag('projects-list')
    revalidateTag(`project-${id}`)
    return adminCount;
  }

  // U8: toggle_upvote RPC replaces the old insert/delete/select pattern for
  // the count itself (the adminBumpUpvotes check above is a separate,
  // pre-existing round-trip on the non-admin path — not eliminated by U8).
  const { data: rpcData, error: rpcError } = await supabase.rpc('toggle_upvote', {
    kind: 'vibe',
    target_id: id,
  });

  if (rpcError) {
    console.error('toggle_upvote RPC transport error for project', id, rpcError);
    return 'rpc_error' as const;
  }
  if (rpcData === null || rpcData === undefined) {
    console.error('toggle_upvote RPC returned null for project', id, '— entity not found');
    return null;
  }

  // Invalidate immediately after the mutation — KTD2 hard constraint.
  revalidateTag('projects-list')
  revalidateTag(`project-${id}`)

  return rpcData as number;
}

export interface GetThreadsOptions {
  search?: string;
  category?: string;
  lang?: 'da' | 'en';
  limit?: number;
  sort?: 'top' | 'new';
}

export async function getThreads({
  search,
  category,
  lang = 'da',
  limit,
  sort = 'top',
}: GetThreadsOptions = {}) {
  'use cache'
  cacheLife('max')
  // Both broad and variant-specific tags — see getSkills for rationale.
  cacheTag('threads-list', `threads-list:${category ?? 'all'}:${search ?? ''}:${lang}:${limit ?? ''}:${sort}`)

  // 'top' = most upvoted (default), 'new' = most recent. Reddit-style sort tabs.
  const orderColumn = sort === 'new' ? 'created_at' : 'upvotes';
  let query = visibleOnly(supabasePublic.from('forum_threads').select('*'), 'forum_threads').order(orderColumn, { ascending: false });

  if (category && category !== "All") {
    query = query.eq('category', category);
  }

  if (limit !== undefined) {
    query = query.limit(limit);
  }

  // SQL-side narrowing (see getSkills for full rationale).
  let searchTerm: string | undefined;
  if (search) {
    const term = sanitizeSearchTerm(search).toLowerCase();
    if (term) {
      searchTerm = term;
      const p = `%${term}%`;
      query = query.or(`title_da.ilike.${p},title_en.ilike.${p},content_da.ilike.${p},content_en.ilike.${p}`);
    }
  }

  const { data: rawThreads, error: threadErr } = await query;
  if (threadErr || !rawThreads) return [];

  // JS safety net on the already-SQL-narrowed result (see getSkills for rationale).
  const threads = searchTerm
    ? rawThreads.filter(t =>
        t.title_da.toLowerCase().includes(searchTerm) ||
        t.title_en.toLowerCase().includes(searchTerm) ||
        t.content_da.toLowerCase().includes(searchTerm) ||
        t.content_en.toLowerCase().includes(searchTerm)
      )
    : rawThreads;

  // Scope the reply fetch to the threads we actually return. The previous
  // implementation read the entire forum_replies table on every call (including
  // category-filtered list views and the homepage snapshot) and grouped in JS.
  const threadIds = threads.map(t => t.id);
  if (threadIds.length === 0) return [];

  const { data: replies, error: replyErr } = await visibleOnly(
    supabasePublic.from('forum_replies').select('*'),
    'forum_replies',
  )
    .in('thread_id', threadIds)
    .order('created_at', { ascending: true });
  if (replyErr) return [];

  // Bolt Optimization ⚡: Group replies by thread_id into a Map.
  // This reduces the previous O(N * M) nested-loop lookup inside threads.map()
  // to a highly efficient O(N + M) linear-time execution.
  const repliesByThreadId = new Map<string, ReplyRow[]>();
  for (const r of (replies || [])) {
    let group = repliesByThreadId.get(r.thread_id);
    if (!group) {
      group = [];
      repliesByThreadId.set(r.thread_id, group);
    }
    group.push(r);
  }

  return threads.map(t => {
    const threadReplies = repliesByThreadId.get(t.id) || [];
    return mapThread(t, threadReplies, lang);
  });
}

export async function getThreadById(id: string, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag(`thread-${id}`, `thread-${id}:${lang}`)

  const { data: thread, error } = await visibleOnly(supabasePublic.from('forum_threads').select('*'), 'forum_threads').eq('id', id).single();
  if (error || !thread) return null;
  const { data: replies } = await visibleOnly(
    supabasePublic.from('forum_replies').select('*'),
    'forum_replies',
  )
    .eq('thread_id', id)
    .order('created_at', { ascending: true });
  return mapThread(thread, replies || [], lang);
}

export async function upvoteThread(id: string, actingAs?: ActingAs) {
  const { supabase, userId } = await resolveActor(actingAs);

  if (!userId) {
    console.warn('Cannot upvote thread: User is not authenticated');
    return 0;
  }

  const adminCount = await adminBumpUpvotes(supabase, 'thread', id);
  if (adminCount !== null) {
    revalidateTag('threads-list')
    revalidateTag(`thread-${id}`)
    return adminCount;
  }

  // U8: toggle_upvote RPC replaces the old insert/delete/select pattern for
  // the count itself (the adminBumpUpvotes check above is a separate,
  // pre-existing round-trip on the non-admin path — not eliminated by U8).
  const { data: rpcData, error: rpcError } = await supabase.rpc('toggle_upvote', {
    kind: 'thread',
    target_id: id,
  });

  if (rpcError) {
    console.error('toggle_upvote RPC transport error for thread', id, rpcError);
    return 'rpc_error' as const;
  }
  if (rpcData === null || rpcData === undefined) {
    console.error('toggle_upvote RPC returned null for thread', id, '— entity not found');
    return null;
  }

  // Invalidate immediately after the mutation — KTD2 hard constraint.
  revalidateTag('threads-list')
  revalidateTag(`thread-${id}`)

  return rpcData as number;
}

/** `threadId` is optional only for backward compatibility with older callers;
 * pass it whenever known (the route handler already has it from the URL) to
 * avoid a second round-trip just to look it up. */
export async function upvoteReply(id: string, threadId?: string, actingAs?: ActingAs) {
  const { supabase, userId } = await resolveActor(actingAs);

  if (!userId) {
    console.warn('Cannot upvote reply: User is not authenticated');
    return 0;
  }

  // Resolve the parent thread id once, before branching into admin vs. RPC,
  // so both paths use the same value. Previously the admin branch only
  // invalidated thread-{id} when threadId was explicitly passed by the caller
  // — meaning the specific thread cache could go stale indefinitely when
  // threadId was omitted on the admin path. The RPC branch already had a
  // fallback lookup; this hoist removes the divergence.
  const resolvedThreadId = threadId ?? (
    await supabasePublic.from('forum_replies').select('thread_id').eq('id', id).single()
  ).data?.thread_id;

  const adminCount = await adminBumpUpvotes(supabase, 'reply', id);
  if (adminCount !== null) {
    revalidateTag('threads-list')
    if (resolvedThreadId) revalidateTag(`thread-${resolvedThreadId}`)
    return adminCount;
  }

  // U8: single toggle_upvote RPC replaces the old insert/delete/select pattern
  // for the count itself.
  const { data: rpcData, error: rpcError } = await supabase.rpc('toggle_upvote', {
    kind: 'reply',
    target_id: id,
  });

  if (rpcError) {
    console.error('toggle_upvote RPC transport error for reply', id, rpcError);
    return 'rpc_error' as const;
  }
  if (rpcData === null || rpcData === undefined) {
    console.error('toggle_upvote RPC returned null for reply', id, '— entity not found');
    return null;
  }

  // Invalidate immediately — KTD2 hard constraint. Both admin and RPC paths
  // use the same resolvedThreadId resolved above.
  revalidateTag('threads-list')
  if (resolvedThreadId) {
    revalidateTag(`thread-${resolvedThreadId}`)
  }

  return rpcData as number;
}

export async function createThread(title: string, author: string, category: ForumThread["category"], content: string, actingAs?: ActingAs) {
  const { supabase, userId } = await resolveActor(actingAs);
  // Always 'approved' today: the forum's gate ships off (FORUM_GATE_ENABLED in
  // lib/reviewGate.ts explains why). The column and this call are here so that
  // turning the gate on is a one-line change with no schema work.
  const reviewState = reviewStateForWrite('forum_threads', Boolean(actingAs));

  const newId = 't_' + Date.now();
  const { data, error } = await supabase.from('forum_threads').insert({
    id: newId,
    title_da: title,
    title_en: title,
    author,
    category,
    content_da: content,
    content_en: content,
    upvotes: 1,
    user_id: userId,
    review_state: reviewState,
  }).select().single();

  if (error || !data) {
    console.error('Failed to create thread:', error);
    throw new Error('Kunne ikke oprette tråd');
  }

  if (reviewState === 'approved') {
    // Invalidate the threads list so the new thread appears on the next read.
    revalidateTag('threads-list')
    // First thread un-empties the hub: nav link, sitemap entry, robots index.
    revalidateTag(HUB_EMPTINESS_TAG)
  }

  return mapThread(data, [], 'da');
}

export async function addReply(threadId: string, author: string, content: string, actingAs?: ActingAs) {
  const { supabase, userId } = await resolveActor(actingAs);

  // Always 'approved' today — see createThread.
  const reviewState = reviewStateForWrite('forum_replies', Boolean(actingAs));

  const newId = 'r_' + Date.now();
  const { error } = await supabase.from('forum_replies').insert({
    id: newId,
    thread_id: threadId,
    author,
    content_da: content,
    content_en: content,
    user_id: userId,
    review_state: reviewState,
  });

  if (error) {
    console.error('Failed to create reply:', error);
    return null;
  }

  if (reviewState === 'approved') {
    // Invalidate the specific thread detail cache AND the broad threads-list tag
    // so reply counts (embedded in thread list rows) are also refreshed.
    revalidateTag('threads-list')
    revalidateTag(`thread-${threadId}`)
  }

  // Return the parent thread populated with all replies. Gated the same way the
  // public read is, so a pending reply is absent from the echoed thread rather
  // than handed straight back to the author as though it were live.
  const { data: thread } = await visibleOnly(supabasePublic.from('forum_threads').select('*'), 'forum_threads').eq('id', threadId).single();
  const { data: replies } = await visibleOnly(supabasePublic.from('forum_replies').select('*'), 'forum_replies').eq('thread_id', threadId).order('created_at', { ascending: true });

  if (!thread) return null;
  // Returns the reply's own id alongside the thread. Callers need it for the
  // pending receipt, whose contract defines `id` as the queued ROW's id — and
  // a pending reply is filtered out of `replies` above, so it cannot be
  // recovered from the thread. Handing back the thread id instead would give a
  // queued caller an id that review-queue.mjs does not key on.
  return { thread: mapThread(thread, replies || [], 'da'), replyId: newId };
}

export async function getBlogPosts(lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag('blog-posts', `blog-posts:${lang}`)

  const { data, error } = await visibleOnly(supabasePublic.from('blog_posts').select('*'), 'blog_posts');
  if (error || !data) return [];
  return data.map(b => mapBlogPost(b, lang));
}

export async function getBlogPostById(id: string, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag(`blog-post-${id}`, `blog-post-${id}:${lang}`)

  const { data, error } = await visibleOnly(supabasePublic.from('blog_posts').select('*'), 'blog_posts').eq('id', id).single();
  if (error || !data) return null;
  return mapBlogPost(data, lang);
}

export async function getAgents(search?: string, category?: string, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  // Both broad and variant-specific tags — see getSkills for rationale.
  cacheTag('agents-list', `agents-list:${category ?? 'all'}:${search ?? ''}:${lang}`)

  let query = visibleOnly(supabasePublic.from('agents').select('*'), 'agents').order('upvotes', { ascending: false });

  // Hosts are connection targets, never catalog items — excluded from every
  // list, even when a category is explicitly requested (a 'Host' request
  // therefore yields nothing).
  query = query.neq('category', 'Host');

  if (category && category !== "All") {
    query = query.eq('category', category);
  } else {
    // The default catalog list excludes MCP servers — they live at /mcp.
    query = query.neq('category', 'MCP Server');
  }

  // Search filters in JS, not SQL — a `tags::text` cast inside .or() is
  // invalid PostgREST grammar and made every search 400 → [] (see getSkills).
  // `name` is not bilingual.
  let searchTerm: string | undefined;
  if (search) {
    const term = sanitizeSearchTerm(search).toLowerCase();
    if (term) searchTerm = term;
  }

  const { data, error } = await query;
  if (error || !data) return [];

  if (searchTerm) {
    const q = searchTerm;
    return data
      .filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.description_da ?? '').toLowerCase().includes(q) ||
        a.description_en.toLowerCase().includes(q) ||
        (a.tags || []).some((t: string) => t.toLowerCase().includes(q))
      )
      .map(a => mapAgent(a, lang));
  }

  return data.map(a => mapAgent(a, lang));
}

// CLIs are stored in the agents table with category 'CLI'.
// Convenience accessor for the /cli feed surface and /api/cli.
export async function getCli(search?: string, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  // Shares the broad 'agents-list' tag with getAgents so revalidateTag('agents-list')
  // invalidates this cache entry too. The variant tag scopes it to CLI+search+lang.
  cacheTag('agents-list', `agents-list:CLI:${search ?? ''}:${lang}`)
  return getAgents(search, 'CLI', lang);
}

// MCP servers are stored in the agents table with category 'MCP Server';
// list views fetch them via /api/mcp-servers. Host rows are retained but
// excluded from every catalog query above.
export async function getAgentById(id: string, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag(`agent-${id}`, `agent-${id}:${lang}`)

  const { data, error } = await visibleOnly(supabasePublic.from('agents').select('*'), 'agents').eq('id', id).single();
  if (error || !data) return null;
  return mapAgent(data, lang);
}

/**
 * Slug-keyed twin of getAgentById — see getSkillBySlug for the dual-tag rationale.
 *
 * Slugs are unique table-wide rather than per category, so this resolves a row
 * from either surface. The callers (/cli and /mcp) check `category` themselves
 * and 404 on a mismatch, which is what stops an MCP server rendering under /cli
 * because someone guessed its slug there.
 */
export async function getAgentBySlug(slug: string, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag(`agent-slug-${slug}`, `agent-slug-${slug}:${lang}`)

  const { data, error } = await visibleOnly(supabasePublic.from('agents').select('*'), 'agents').eq('slug', slug).single();
  if (error || !data) return null;
  cacheTag(`agent-${data.id}`, `agent-${data.id}:${lang}`)
  return mapAgent(data, lang);
}

export async function upvoteAgent(id: string, actingAs?: ActingAs) {
  const { supabase, userId } = await resolveActor(actingAs);

  if (!userId) {
    console.warn('Cannot upvote agent: User is not authenticated');
    return 0;
  }

  const adminCount = await adminBumpUpvotes(supabase, 'agent', id);
  if (adminCount !== null) {
    revalidateTag('agents-list')
    revalidateTag(`agent-${id}`)
    return adminCount;
  }

  // U8: toggle_upvote RPC replaces the old insert/delete/select pattern for
  // the count itself (the adminBumpUpvotes check above is a separate,
  // pre-existing round-trip on the non-admin path — not eliminated by U8).
  const { data: rpcData, error: rpcError } = await supabase.rpc('toggle_upvote', {
    kind: 'agent',
    target_id: id,
  });

  if (rpcError) {
    console.error('toggle_upvote RPC transport error for agent', id, rpcError);
    return 'rpc_error' as const;
  }
  if (rpcData === null || rpcData === undefined) {
    console.error('toggle_upvote RPC returned null for agent', id, '— entity not found');
    return null;
  }

  // Invalidate immediately after the mutation — KTD2 hard constraint.
  revalidateTag('agents-list')
  revalidateTag(`agent-${id}`)

  return rpcData as number;
}

export async function createProject(title: string, author: string, description: string, tools: string[], prompts: string[], demoUrl: string, githubUrl?: string, imageUrl?: string, descriptionDa?: string, actingAs?: ActingAs) {
  const { supabase, userId } = await resolveActor(actingAs);
  const reviewState = reviewStateForWrite('vibes', Boolean(actingAs));

  const newId = 'p_' + Date.now();
  const { data, error } = await insertWithUniqueSlug<ShowcaseRow>(slugify(title), (slug) =>
    supabase.from('vibes').insert({
      id: newId,
      slug,
      title_da: title,
      title_en: title,
      author,
      // `||` not `??`: an empty string means "no translation supplied" and must
      // normalize to null, or the English-fallback state is unreachable via the API.
      description_da: descriptionDa || null,
      description_en: description,
      tools,
      prompts,
      upvotes: 1,
      demo_url: demoUrl,
      github_url: githubUrl,
      image_url: imageUrl || '/images/autonewsletter.jpg',
      user_id: userId,
      // See createSkill: bearer callers are held for review.
      review_state: reviewState,
    }).select().single()
  );

  if (error || !data) {
    console.error('Failed to create project:', error);
    throw new Error('Kunne ikke oprette projekt');
  }

  // Keyed on the written state, not on `actingAs` — see createSkill.
  if (reviewState === 'approved') revalidateTag('projects-list')

  return mapProject(data, 'da');
}

export async function createSkill(title: string, vibeCoder: string, description: string, category: Skill["category"], tags: string[], githubUrl?: string, source?: string, descriptionDa?: string, actingAs?: ActingAs) {
  const { supabase, userId } = await resolveActor(actingAs);
  const reviewState = reviewStateForWrite('skills', Boolean(actingAs));

  const newId = 's_' + Date.now();
  const { data, error } = await insertWithUniqueSlug<SkillRow>(slugify(title), (slug) =>
    supabase.from('skills').insert({
      id: newId,
      slug,
      title_da: title,
      title_en: title,
      vibe_coder: vibeCoder,
      vibe_coder_title_da: 'Community-bidragyder',
      vibe_coder_title_en: 'Community Contributor',
      rating: 5.0,
      reviews_count: 0,
      // See createProject: `||` normalizes "" to null.
      description_da: descriptionDa || null,
      description_en: description,
      category,
      tags,
      github_url: githubUrl,
      source,
      user_id: userId,
      // Bearer-token callers are held for review; cookie sessions publish
      // directly. `actingAs` is set only on the bearer path — see
      // reviewStateForWrite and resolveRequestIdentity.
      review_state: reviewState,
    }).select().single()
  );

  if (error || !data) {
    console.error('Failed to create skill:', error);
    throw new Error('Kunne ikke oprette skill');
  }

  // Keyed on the written state, NOT on `actingAs`. A pending row is invisible
  // to every gated read, so revalidating would dump the whole skills cache to
  // surface nothing. But the two conditions are not interchangeable: when a
  // table's gate is off (the forum today) a bearer write publishes immediately
  // and MUST revalidate, so testing `actingAs` here would break the forum the
  // day someone flips FORUM_GATE_ENABLED.
  //
  // Approval revalidates instead, via POST /api/revalidate — the approve job
  // runs in GitHub Actions, outside the Next runtime, and cannot call
  // revalidateTag itself (the constraint getSkillDoc documents for the doc
  // refresher).
  if (reviewState === 'approved') revalidateTag('skills-list')

  return mapSkill(data, 'da');
}

export async function deleteProject(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('vibes').delete().eq('id', id).select('id');
  if (error) {
    console.error('Failed to delete project:', error);
    return false;
  }
  // RLS restricts deletes to the owner; an empty result means not found or not owned.
  const succeeded = (data?.length ?? 0) > 0;
  if (succeeded) {
    revalidateTag('projects-list')
    revalidateTag(`project-${id}`)
  }
  return succeeded;
}

export async function deleteThread(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('forum_threads').delete().eq('id', id).select('id');
  if (error) {
    console.error('Failed to delete thread:', error);
    return false;
  }
  const succeeded = (data?.length ?? 0) > 0;
  if (succeeded) {
    revalidateTag('threads-list')
    revalidateTag(`thread-${id}`)
    // Deleting the last thread re-empties the hub.
    revalidateTag(HUB_EMPTINESS_TAG)
  }
  return succeeded;
}

export async function deleteReply(threadId: string, replyId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('forum_replies').delete().eq('id', replyId).select('id');
  if (error) {
    console.error('Failed to delete reply:', error);
    return false;
  }
  const succeeded = (data?.length ?? 0) > 0;
  if (succeeded) {
    revalidateTag('threads-list')
    revalidateTag(`thread-${threadId}`)
  }
  return succeeded;
}

export async function createAgent(name: string, developer: string, category: Agent["category"], description: string, installCommand: string, systemPrompt: string, tags: string[], sourceUrl?: string, descriptionDa?: string, actingAs?: ActingAs) {
  const { supabase, userId } = await resolveActor(actingAs);
  const reviewState = reviewStateForWrite('agents', Boolean(actingAs));

  const newId = 'a_' + Date.now();
  // Slugged from `name` — agents have no bilingual title column.
  const { data, error } = await insertWithUniqueSlug<AgentRow>(slugify(name), (slug) =>
    supabase.from('agents').insert({
      id: newId,
      slug,
      name,
      developer,
      category,
      // See createProject: `||` normalizes "" to null.
      description_da: descriptionDa || null,
      description_en: description,
      install_command: installCommand,
      system_prompt_da: systemPrompt,
      system_prompt_en: systemPrompt,
      upvotes: 1,
      tags,
      source_url: sourceUrl || null,
      user_id: userId,
      // See createSkill: bearer callers are held for review.
      review_state: reviewState,
    }).select().single()
  );

  if (error || !data) {
    console.error('Failed to create agent:', error);
    throw new Error('Kunne ikke oprette agent');
  }

  // Keyed on the written state, not on `actingAs` — see createSkill.
  if (reviewState === 'approved') revalidateTag('agents-list')

  return mapAgent(data, 'da');
}

export async function createBlogPost(
  title: string,
  excerpt: string,
  content: string,
  author: string,
  readTime: string,
  publishedAt: string,
  imageUrl: string,
  category: BlogPost["category"],
  actingAs?: ActingAs
) {
  const { supabase, userId } = await resolveActor(actingAs);
  const reviewState = reviewStateForWrite('blog_posts', Boolean(actingAs));

  const newId = 'b_' + Date.now();
  const { data, error } = await supabase.from('blog_posts').insert({
    id: newId,
    title_da: title,
    title_en: title,
    excerpt_da: excerpt,
    excerpt_en: excerpt,
    content_da: content,
    content_en: content,
    author,
    read_time: readTime,
    published_at: publishedAt,
    image_url: imageUrl,
    category,
    user_id: userId,
    // See createSkill: bearer callers are held for review.
    review_state: reviewState,
  }).select().single();

  if (error || !data) {
    console.error('Failed to create blog post:', error);
    throw new Error('Kunne ikke oprette blogindlæg');
  }

  // Both tags are skipped for a pending post, and HUB_EMPTINESS_TAG especially:
  // countRealBlogPosts now discounts pending rows, so revalidating it would
  // re-run the count and get the same answer, and a queued post must not
  // un-hide /blog before a human has approved it. Keyed on the written state
  // rather than on `actingAs` — see createSkill.
  if (reviewState === 'approved') {
    revalidateTag('blog-posts')
    // First post un-empties the hub: nav link, sitemap entry, robots index.
    revalidateTag(HUB_EMPTINESS_TAG)
  }

  return mapBlogPost(data, 'da');
}

export async function deleteAgent(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('agents').delete().eq('id', id).select('id');
  if (error) {
    console.error('Failed to delete agent:', error);
    return false;
  }
  const succeeded = (data?.length ?? 0) > 0;
  if (succeeded) {
    revalidateTag('agents-list')
    revalidateTag(`agent-${id}`)
  }
  return succeeded;
}

export async function deleteSkill(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('skills').delete().eq('id', id).select('id');
  if (error) {
    console.error('Failed to delete skill:', error);
    return false;
  }
  // RLS restricts deletes to admins (no owner-delete policy exists for skills).
  const succeeded = (data?.length ?? 0) > 0;
  if (succeeded) {
    revalidateTag('skills-list')
    revalidateTag(`skill-${id}`)
  }
  return succeeded;
}

export async function deleteBlogPost(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('blog_posts').delete().eq('id', id).select('id');
  if (error) {
    console.error('Failed to delete blog post:', error);
    return false;
  }
  // RLS restricts deletes to admins (no owner-delete policy exists for blog posts).
  const succeeded = (data?.length ?? 0) > 0;
  if (succeeded) {
    revalidateTag('blog-posts')
    revalidateTag(`blog-post-${id}`)
    // Deleting the last post re-empties the hub.
    revalidateTag(HUB_EMPTINESS_TAG)
  }
  return succeeded;
}

// Homepage-optimized reads — fetch only counts and the few featured rows the
// landing page renders, instead of materializing every full dataset just to
// read `.length` and `[0]`.

export interface EntityCounts {
  skills: number;
  vibes: number;
  threads: number;
  agents: number;
}

// NOTE: getCounts and getLatestPosts remain deliberately uncached — getCounts
// is a cheap head-only count query per table, and getLatestPosts already
// shares getBlogPosts' cache path indirectly via its own future unit. See
// docs/plans/2026-07-08-001-feat-site-wide-performance-seo-optimization-plan.md
// (U2) for that original deferral. getTopProjects/getTopSkills/getTopAgents
// below were verified safe to cache (fixed limit/lang call shape from the
// homepage, reuses the existing broad list tags so every mutation that
// already revalidates 'projects-list'/'skills-list'/'agents-list' also
// invalidates these) — see docs/plans/2026-07-09-001-fix-ahrefs-seo-issues-plan.md (U6).

export async function getCounts(): Promise<EntityCounts> {
  const head = { count: 'exact' as const, head: true };
  const [skills, vibes, threads, agents] = await Promise.all([
    visibleOnly(supabasePublic.from('skills').select('*', head), 'skills'),
    visibleOnly(supabasePublic.from('vibes').select('*', head), 'vibes'),
    visibleOnly(supabasePublic.from('forum_threads').select('*', head), 'forum_threads'),
    // The CLI feed count excludes MCP servers (own surface) and hosts
    // (connection targets, not catalog items).
    visibleOnly(supabasePublic.from('agents').select('*', head), 'agents').neq('category', 'MCP Server').neq('category', 'Host'),
  ]);

  return {
    skills: skills.count ?? 0,
    vibes: vibes.count ?? 0,
    threads: threads.count ?? 0,
    agents: agents.count ?? 0,
  };
}

export async function getTopProjects(limit = 1, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag('projects-list', `top-projects:${limit}:${lang}`)

  const { data, error } = await visibleOnly(supabasePublic.from('vibes').select('*'), 'vibes')
    .order('upvotes', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(p => mapProject(p, lang));
}

export async function getTopSkills(limit = 1, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag('skills-list', `top-skills:${limit}:${lang}`)

  // Homepage feature spot: showcase the Danish catalog, ranked by upvotes.
  // (Previously ordered by the legacy rating column, which is no longer
  // rendered and identical across real rows.)
  const { data, error } = await visibleOnly(supabasePublic.from('skills').select('*'), 'skills')
    .eq('is_danish', true)
    .order('upvotes', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(s => mapSkill(s, lang));
}

export async function getTopAgents(limit = 1, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag('agents-list', `top-agents:${limit}:${lang}`)

  const { data, error } = await visibleOnly(supabasePublic.from('agents').select('*'), 'agents')
    .neq('category', 'MCP Server')
    .neq('category', 'Host')
    .order('upvotes', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(a => mapAgent(a, lang));
}

export async function getLatestPosts(limit = 1, lang: 'da' | 'en' = 'da') {
  const { data, error } = await visibleOnly(supabasePublic.from('blog_posts').select('*'), 'blog_posts')
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(b => mapBlogPost(b, lang));
}

// ---------------------------------------------------------------------------
// Market feed (docs/marketing/market-feed-brief.md)
//
// One merged, reverse-chronological stream of new content across skills,
// agents (CLI / MCP Server feeds) and vibes, so agents can poll "what's new
// in the Danish AI market since <date>". MVP derives items from the existing
// content tables — no feed_items table yet (that arrives with editorial
// `news` items in Phase 2).
//
// Timestamps: `vibes` has a real created_at column; `skills` and `agents`
// don't, but their IDs embed epoch milliseconds (`s_<ms>` / `a_<ms>` — the
// same fact 20260701000000_vibes_created_at.sql used to backfill vibes).
// Rows whose ID doesn't parse fall back to epoch 0 and sort last rather
// than being dropped.
//
// Deliberately NOT 'use cache': `since` makes the variant space unbounded,
// and feed consumers are exactly the callers that must never see a stale
// window. The API route sets Cache-Control: no-store, matching the other
// interactive routes.
// ---------------------------------------------------------------------------

export type FeedItemType = 'skill' | 'mcp' | 'cli' | 'vibe';

export interface FeedItem {
  id: string;
  type: FeedItemType;
  title: string;
  summary: string;
  url: string;
  tags: string[];
  publishedAt: string; // ISO 8601
}

export async function getFeedItems(opts: {
  since?: string;
  types?: FeedItemType[];
  lang?: 'da' | 'en';
  limit?: number;
} = {}): Promise<FeedItem[]> {
  const lang = opts.lang ?? 'da';
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const types = opts.types?.length ? opts.types : (['skill', 'mcp', 'cli', 'vibe'] as FeedItemType[]);
  const sinceMs = opts.since ? Date.parse(opts.since) : NaN;

  const wantAgents = types.includes('mcp') || types.includes('cli');

  let skillsQuery = visibleOnly(supabasePublic.from('skills').select('id, slug, title_da, title_en, description_da, description_en, tags'), 'skills').order('id', { ascending: false }).limit(limit);
  if (!Number.isNaN(sinceMs)) {
    // Bolt Optimization ⚡: Filter at database-level using lexicographical comparison on prefixed ID (s_ + ms)
    skillsQuery = skillsQuery.gt('id', 's_' + sinceMs);
  }

  let agentsQuery = visibleOnly(supabasePublic.from('agents').select('id, slug, name, category, description_da, description_en, tags'), 'agents').in('category', ['CLI', 'MCP Server']).order('id', { ascending: false }).limit(limit);
  if (!Number.isNaN(sinceMs)) {
    // Bolt Optimization ⚡: Filter at database-level using lexicographical comparison on prefixed ID (a_ + ms)
    agentsQuery = agentsQuery.gt('id', 'a_' + sinceMs);
  }

  let vibesQuery = visibleOnly(supabasePublic.from('vibes').select('id, slug, title_da, title_en, description_da, description_en, tools, created_at'), 'vibes').order('created_at', { ascending: false }).limit(limit);
  if (!Number.isNaN(sinceMs)) {
    // Bolt Optimization ⚡: Filter at database-level using real created_at timestamp column
    vibesQuery = vibesQuery.gt('created_at', new Date(sinceMs).toISOString());
  }

  const [skillsRes, agentsRes, vibesRes] = await Promise.all([
    types.includes('skill') ? skillsQuery : Promise.resolve({ data: [], error: null }),
    wantAgents ? agentsQuery : Promise.resolve({ data: [], error: null }),
    types.includes('vibe') ? vibesQuery : Promise.resolve({ data: [], error: null }),
  ]);

  interface IntermediateFeedItem {
    id: string;
    type: FeedItemType;
    title: string;
    summary: string;
    url: string;
    tags: string[];
    publishedAtMs: number;
    createdAt?: string; // used to retain original timestamp for vibes
  }

  const items: IntermediateFeedItem[] = [];

  for (const s of skillsRes.data ?? []) {
    const publishedAtMs = epochFromId(s.id);
    items.push({
      id: s.id,
      type: 'skill',
      title: lang === 'da' ? s.title_da : s.title_en,
      summary: withEnglishFallback(s.description_da, s.description_en, lang),
      url: `https://vibetrends.dk/skills/${s.slug || s.id}`,
      tags: s.tags ?? [],
      publishedAtMs,
    });
  }

  for (const a of agentsRes.data ?? []) {
    const type: FeedItemType = a.category === 'MCP Server' ? 'mcp' : 'cli';
    if (!types.includes(type)) continue;
    const publishedAtMs = epochFromId(a.id);
    items.push({
      id: a.id,
      type,
      title: a.name,
      summary: withEnglishFallback(a.description_da, a.description_en, lang),
      url: `https://vibetrends.dk/${type}/${a.slug || a.id}`,
      tags: a.tags ?? [],
      publishedAtMs,
    });
  }

  for (const v of vibesRes.data ?? []) {
    const publishedAtMs = v.created_at ? Date.parse(v.created_at) : epochFromId(v.id);
    items.push({
      id: v.id,
      type: 'vibe',
      title: lang === 'da' ? v.title_da : v.title_en,
      summary: withEnglishFallback(v.description_da, v.description_en, lang),
      url: `https://vibetrends.dk/vibes/${v.slug || v.id}`,
      tags: v.tools ?? [],
      publishedAtMs,
      createdAt: v.created_at || undefined,
    });
  }

  const filtered = Number.isNaN(sinceMs)
    ? items
    : items.filter(i => i.publishedAtMs > sinceMs);

  const sorted = filtered
    .sort((x, y) => y.publishedAtMs - x.publishedAtMs)
    .slice(0, limit);

  // Bolt Optimization ⚡: Defer the CPU-heavy Date parsing/formatting & string allocations
  // to run exclusively on the final sorted & sliced feed list (at most `limit` items).
  return sorted.map(({ publishedAtMs, createdAt, ...rest }) => ({
    ...rest,
    publishedAt: createdAt ?? new Date(publishedAtMs).toISOString(),
  }));
}
