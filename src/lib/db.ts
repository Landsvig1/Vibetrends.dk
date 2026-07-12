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

import { skillCategoryLabel, type SkillCategorySlug } from "./skillCategories";
import { type ForumCategoryKey } from "./forumCategories";

export interface Skill {
  id: string;
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
  category: "Guides" | "Industry" | "Workflow";
}

export interface Agent {
  id: string;
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
  title_da: string;
  title_en: string;
  category: string;
  vibe_coder: string;
  vibe_coder_title_da: string;
  vibe_coder_title_en: string;
  rating: number | string;
  reviews_count: number;
  upvotes?: number;
  description_da: string;
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
}

interface ShowcaseRow {
  id: string;
  title_da: string;
  title_en: string;
  author: string;
  description_da: string;
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
  name: string;
  developer: string;
  // Widened to string so a legacy pre-migration category never trips the
  // mapper before the recategorization migration has run in every environment.
  category: string;
  description_da: string;
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

// Map database entities to frontend camelCase objects
function mapSkill(s: SkillRow, lang: 'da' | 'en'): Skill {
  return {
    id: s.id,
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
    description: lang === 'en' ? s.description_en : s.description_da,
    tags: s.tags || [],
    githubUrl: s.github_url || undefined,
    source: s.source || undefined,
  };
}

function mapProject(p: ShowcaseRow, lang: 'da' | 'en'): ShowcaseProject {
  return {
    id: p.id,
    title: lang === 'en' ? p.title_en : p.title_da,
    author: p.author,
    description: lang === 'en' ? p.description_en : p.description_da,
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
    name: a.name,
    developer: a.developer,
    category: toAgentCategory(a.category),
    description: lang === 'en' ? a.description_en : a.description_da,
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
  return raw.replace(/[,.()*%_]/g, '');
}

export async function getSkills(search?: string, category?: string, lang: 'da' | 'en' = 'da', view?: SkillView) {
  'use cache'
  cacheLife('max')
  // Both the broad entity-wide tag AND the variant-specific tag are set so that
  // a single revalidateTag('skills-list') call on any mutation invalidates every
  // cached variant (searched, filtered, sorted), not just the default one.
  // Next's tag matching is exact-string — prefix matching is not supported.
  cacheTag('skills-list', `skills-list:${category ?? 'all'}:${search ?? ''}:${lang}:${view ?? ''}`)

  let query = supabasePublic.from('skills').select('*');

  if (category && category !== "All") {
    query = query.eq('category', category);
  }

  // Danish board: skills from Danish contributors (is_danish flag), with the
  // skills that are specifically about Denmark (job portals, property data,
  // transit …) surfaced first, ranked by upvotes within each group.
  if (view === 'danish') {
    query = query
      .eq('is_danish', true)
      .order('denmark_specific', { ascending: false })
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

  // SQL-side narrowing: push all search dimensions into a single .or() clause
  // before the fetch so only matching rows travel over the wire. The sanitized
  // term strips PostgREST grammar chars (KTD3) so it can't redefine the filter
  // structure. Casting the tags array to text (`tags::text`) produces the
  // PostgreSQL text representation `{elem1,elem2,...}` — ilike with `%term%`
  // then matches any element whose substring contains the term, replicating the
  // current JS `.includes()` behavior without a custom RPC or exact-element
  // operators (.contains()/.overlaps() test exact element equality and would
  // narrow matches compared to today).
  let searchTerm: string | undefined;
  if (search) {
    const term = sanitizeSearchTerm(search).toLowerCase();
    if (term) {
      searchTerm = term;
      const p = `%${term}%`;
      query = query.or(
        `title_da.ilike.${p},title_en.ilike.${p},description_da.ilike.${p},description_en.ilike.${p},tags::text.ilike.${p}`
      );
    }
  }

  const { data, error } = await query;
  if (error || !data) return [];

  // JS safety net on the already-SQL-narrowed result. In production this runs
  // on a small filtered set (not the full table). In mock-based tests the mock
  // ignores the SQL filter, so this layer provides output-correctness guarantees.
  if (searchTerm) {
    const q = searchTerm;
    return data
      .filter(s =>
        s.title_da.toLowerCase().includes(q) ||
        s.title_en.toLowerCase().includes(q) ||
        s.description_da.toLowerCase().includes(q) ||
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

  const { data, error } = await supabasePublic.from('skills').select('*').eq('id', id).single();
  if (error || !data) return null;
  return mapSkill(data, lang);
}

export async function upvoteSkill(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
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
  let query = supabasePublic.from('vibes').select('*');
  if (sort === 'top') {
    query = query.order('upvotes', { ascending: false });
  } else if (sort === 'az') {
    query = query.order(lang === 'en' ? 'title_en' : 'title_da', { ascending: true });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  // SQL-side narrowing (see getSkills for full rationale). tools::text cast
  // covers array element substring matching without a custom RPC.
  let searchTerm: string | undefined;
  if (search) {
    const term = sanitizeSearchTerm(search).toLowerCase();
    if (term) {
      searchTerm = term;
      const p = `%${term}%`;
      query = query.or(
        `title_da.ilike.${p},title_en.ilike.${p},description_da.ilike.${p},description_en.ilike.${p},tools::text.ilike.${p}`
      );
    }
  }

  const { data, error } = await query;
  if (error || !data) return [];

  // JS safety net on the SQL-narrowed result (see getSkills for rationale).
  if (searchTerm) {
    const q = searchTerm;
    return data
      .filter(p =>
        p.title_da.toLowerCase().includes(q) ||
        p.title_en.toLowerCase().includes(q) ||
        p.description_da.toLowerCase().includes(q) ||
        p.description_en.toLowerCase().includes(q) ||
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

  const { data, error } = await supabasePublic.from('vibes').select('*').eq('id', id).single();
  if (error || !data) return null;
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

export async function upvoteProject(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
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
  let query = supabasePublic.from('forum_threads').select('*').order(orderColumn, { ascending: false });

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

  const { data: replies, error: replyErr } = await supabasePublic
    .from('forum_replies')
    .select('*')
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

  const { data: thread, error } = await supabasePublic.from('forum_threads').select('*').eq('id', id).single();
  if (error || !thread) return null;
  const { data: replies } = await supabasePublic
    .from('forum_replies')
    .select('*')
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
  }).select().single();

  if (error || !data) {
    console.error('Failed to create thread:', error);
    throw new Error('Kunne ikke oprette tråd');
  }

  // Invalidate the threads list so the new thread appears on the next read.
  revalidateTag('threads-list')

  return mapThread(data, [], 'da');
}

export async function addReply(threadId: string, author: string, content: string, actingAs?: ActingAs) {
  const { supabase, userId } = await resolveActor(actingAs);

  const newId = 'r_' + Date.now();
  const { error } = await supabase.from('forum_replies').insert({
    id: newId,
    thread_id: threadId,
    author,
    content_da: content,
    content_en: content,
    user_id: userId,
  });

  if (error) {
    console.error('Failed to create reply:', error);
    return null;
  }

  // Invalidate the specific thread detail cache AND the broad threads-list tag
  // so reply counts (embedded in thread list rows) are also refreshed.
  revalidateTag('threads-list')
  revalidateTag(`thread-${threadId}`)

  // Return the parent thread populated with all replies
  const { data: thread } = await supabasePublic.from('forum_threads').select('*').eq('id', threadId).single();
  const { data: replies } = await supabasePublic.from('forum_replies').select('*').eq('thread_id', threadId).order('created_at', { ascending: true });

  if (!thread) return null;
  return mapThread(thread, replies || [], 'da');
}

export async function getBlogPosts(lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag('blog-posts', `blog-posts:${lang}`)

  const { data, error } = await supabasePublic.from('blog_posts').select('*');
  if (error || !data) return [];
  return data.map(b => mapBlogPost(b, lang));
}

export async function getBlogPostById(id: string, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag(`blog-post-${id}`, `blog-post-${id}:${lang}`)

  const { data, error } = await supabasePublic.from('blog_posts').select('*').eq('id', id).single();
  if (error || !data) return null;
  return mapBlogPost(data, lang);
}

export async function getAgents(search?: string, category?: string, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  // Both broad and variant-specific tags — see getSkills for rationale.
  cacheTag('agents-list', `agents-list:${category ?? 'all'}:${search ?? ''}:${lang}`)

  let query = supabasePublic.from('agents').select('*').order('upvotes', { ascending: false });

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

  // SQL-side narrowing (see getSkills for full rationale). `name` is not
  // bilingual. tags::text cast covers array element substring matching.
  let searchTerm: string | undefined;
  if (search) {
    const term = sanitizeSearchTerm(search).toLowerCase();
    if (term) {
      searchTerm = term;
      const p = `%${term}%`;
      query = query.or(
        `name.ilike.${p},description_da.ilike.${p},description_en.ilike.${p},tags::text.ilike.${p}`
      );
    }
  }

  const { data, error } = await query;
  if (error || !data) return [];

  // JS safety net on the SQL-narrowed result (see getSkills for rationale).
  if (searchTerm) {
    const q = searchTerm;
    return data
      .filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.description_da.toLowerCase().includes(q) ||
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

  const { data, error } = await supabasePublic.from('agents').select('*').eq('id', id).single();
  if (error || !data) return null;
  return mapAgent(data, lang);
}

export async function upvoteAgent(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
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

export async function createProject(title: string, author: string, description: string, tools: string[], prompts: string[], demoUrl: string, githubUrl?: string, imageUrl?: string, actingAs?: ActingAs) {
  const { supabase, userId } = await resolveActor(actingAs);

  const newId = 'p_' + Date.now();
  const { data, error } = await supabase.from('vibes').insert({
    id: newId,
    title_da: title,
    title_en: title,
    author,
    description_da: description,
    description_en: description,
    tools,
    prompts,
    upvotes: 1,
    demo_url: demoUrl,
    github_url: githubUrl,
    image_url: imageUrl || '/images/autonewsletter.jpg',
    user_id: userId,
  }).select().single();

  if (error || !data) {
    console.error('Failed to create project:', error);
    throw new Error('Kunne ikke oprette projekt');
  }

  // Invalidate the projects list so the new project appears on the next read.
  revalidateTag('projects-list')

  return mapProject(data, 'da');
}

export async function createSkill(title: string, vibeCoder: string, description: string, category: Skill["category"], tags: string[], githubUrl?: string, source?: string, actingAs?: ActingAs) {
  const { supabase, userId } = await resolveActor(actingAs);

  const newId = 's_' + Date.now();
  const { data, error } = await supabase.from('skills').insert({
    id: newId,
    title_da: title,
    title_en: title,
    vibe_coder: vibeCoder,
    vibe_coder_title_da: 'Community-bidragyder',
    vibe_coder_title_en: 'Community Contributor',
    rating: 5.0,
    reviews_count: 0,
    description_da: description,
    description_en: description,
    category,
    tags,
    github_url: githubUrl,
    source,
    user_id: userId,
  }).select().single();

  if (error || !data) {
    console.error('Failed to create skill:', error);
    throw new Error('Kunne ikke oprette skill');
  }

  // Invalidate the skills list so the new skill appears on the next read.
  revalidateTag('skills-list')

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

export async function createAgent(name: string, developer: string, category: Agent["category"], description: string, installCommand: string, systemPrompt: string, tags: string[], sourceUrl?: string, actingAs?: ActingAs) {
  const { supabase, userId } = await resolveActor(actingAs);

  const newId = 'a_' + Date.now();
  const { data, error } = await supabase.from('agents').insert({
    id: newId,
    name,
    developer,
    category,
    description_da: description,
    description_en: description,
    install_command: installCommand,
    system_prompt_da: systemPrompt,
    system_prompt_en: systemPrompt,
    upvotes: 1,
    tags,
    source_url: sourceUrl || null,
    user_id: userId,
  }).select().single();

  if (error || !data) {
    console.error('Failed to create agent:', error);
    throw new Error('Kunne ikke oprette agent');
  }

  // Invalidate the agents list so the new agent appears on the next read.
  revalidateTag('agents-list')

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
  }).select().single();

  if (error || !data) {
    console.error('Failed to create blog post:', error);
    throw new Error('Kunne ikke oprette blogindlæg');
  }

  // Invalidate the blog posts list so the new post appears on the next read.
  revalidateTag('blog-posts')

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
    supabasePublic.from('skills').select('*', head),
    supabasePublic.from('vibes').select('*', head),
    supabasePublic.from('forum_threads').select('*', head),
    // The CLI feed count excludes MCP servers (own surface) and hosts
    // (connection targets, not catalog items).
    supabasePublic.from('agents').select('*', head).neq('category', 'MCP Server').neq('category', 'Host'),
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

  const { data, error } = await supabasePublic
    .from('vibes')
    .select('*')
    .order('upvotes', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(p => mapProject(p, lang));
}

export async function getTopSkills(limit = 1, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag('skills-list', `top-skills:${limit}:${lang}`)

  // Homepage feature spot: showcase the Danish catalog — Denmark-specific
  // skills (job portals, property data, transit …) ahead of general tooling
  // from Danish contributors. (Previously ordered by the legacy rating
  // column, which is no longer rendered and identical across real rows.)
  const { data, error } = await supabasePublic
    .from('skills')
    .select('*')
    .eq('is_danish', true)
    .order('denmark_specific', { ascending: false })
    .order('upvotes', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(s => mapSkill(s, lang));
}

export async function getTopAgents(limit = 1, lang: 'da' | 'en' = 'da') {
  'use cache'
  cacheLife('max')
  cacheTag('agents-list', `top-agents:${limit}:${lang}`)

  const { data, error } = await supabasePublic
    .from('agents')
    .select('*')
    .neq('category', 'MCP Server')
    .neq('category', 'Host')
    .order('upvotes', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(a => mapAgent(a, lang));
}

export async function getLatestPosts(limit = 1, lang: 'da' | 'en' = 'da') {
  const { data, error } = await supabasePublic
    .from('blog_posts')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map(b => mapBlogPost(b, lang));
}
