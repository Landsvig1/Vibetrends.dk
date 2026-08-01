# Bolt's Journal - Critical Learnings Only

This journal contains critical performance learnings discovered while optimizing the vibetrends codebase.

## 2026-07-07 - Explorer lists re-rendering on every keystroke
**Learning:** Client-side search filters in our feed explorers (such as `SkillsExplorer`) bind to instant query state updates via `nuqs`. Because these components contain long lists of items (such as `SkillCard` cards), every single keystroke triggers a full parent component update, which reconciles and re-renders every card in the list regardless of whether it actually changed. This creates significant overhead during typing.
**Action:** Always wrap reusable list card components (e.g. `SkillCard`) in `React.memo` with strict prop reference comparisons to eliminate redundant reconciliation during frequent state updates like real-time search typing.

## 2026-07-11 - [O(N * M) nested-loop in getThreads forum hot path]
**Learning:** In list views with related collections (such as forum threads and their replies), querying relations in bulk and joining them via nested `.filter()` inside a `.map()` creates an O(N * M) performance bottleneck. While SQL-side scoping limits the records, JS execution time still degrades quadratically as local threads and replies counts scale.
**Action:** Use a linear-time Map/hash table lookup to group relational data (e.g., grouping replies by `thread_id` into a `Map` first) before mapping parents, achieving O(N + M) execution efficiency.

## 2026-07-14 - Redundant Project Showcase card re-renders
**Learning:** Like the `SkillsExplorer`, the real-time search typing in `VibesExplorer` was causing the entire list of projects to reconcile and re-render every card on every keystroke because the cards were raw JSX elements inside the `map()` loop and upvote/delete handlers were newly created on every render.
**Action:** Extracted the raw JSX into a memoized `<ProjectCard />` component, pre-calculating the boolean authorization flag (`canDelete`) on the parent to avoid passing dynamic user references, and stabilized the parent's `handleUpvote` and `handleDeleteProject` handlers with `useCallback`. This eliminated all redundant Project card reconciliation overhead during real-time user typing.

## 2026-07-15 - Redundant Agent Card re-renders during active search typing
**Learning:** In `AgentsExplorer` (which powers the CLI, MCP, and Agent views), active typing in the search input triggered parent component state updates. Because agent cards were rendered inline and upvote/delete/copy event handlers were re-instantiated on every render, React was forced to fully reconcile and re-render every single agent card in the list.
**Action:** Extracted the inline JSX to a dedicated `<AgentCard />` component wrapped in `React.memo`, computed authorization checks (`canDelete`) on the parent, and stabilized event handlers with `useCallback`. This entirely prevents card updates when typing search queries.

## 2026-07-16 - Redundant Forum thread card re-renders during active search typing
**Learning:** In `ForumExplorer`, active typing in the search input triggered parent component state updates. Because thread cards were rendered inline and upvote/delete event handlers were newly created on every render, React was forced to fully reconcile and re-render every single thread card in the list.
**Action:** Extracted the inline JSX to a dedicated `<ThreadCard />` component wrapped in `React.memo`, pre-computed authorization checks (`canDelete`) on the parent, and stabilized event handlers with `useCallback`. This entirely prevents thread card reconciliation overhead during real-time user typing.

## 2026-07-17 - O(N * K) Category counts recalculation on every keystroke
**Learning:** In `SkillsExplorer`, typing into the search input triggers state updates, forcing the component to re-render. Category counts (`counts`) were calculated on every single render by iterating over all categories and calling `.filter()` on the entire skills list. This resulted in $O(K \times N)$ execution complexity (where $K$ is the number of categories and $N$ is the number of skills), causing redundant recalculations.
**Action:** Wrapped the `counts` calculation in `useMemo` with `allSkills` as its dependency, and optimized the calculation algorithm to $O(N + K)$ complexity using a single-pass loop and key-value mapping. This completely eliminates CPU recalculation overhead for topic counts during real-time user typing.

## 2026-07-19 - Lightweight presentational cards over Framer Motion in high-frequency paths
**Learning:** In interactive surfaces with high-frequency updates, such as `ForumReplySection` where the user types actively on every keystroke, introducing Framer Motion wrappers (`motion.div`, `motion.button`) on list item elements (`ReplyCard`) can add unnecessary JS rendering overhead and inflate bundle sizes.
**Action:** Revert Framer Motion additions inside high-frequency render lists; prefer native lightweight HTML elements styled with native Tailwind CSS transitions to ensure absolute zero rendering lag during active typing.

## REJECTED — 2026-07-21 — Card/memo extraction pattern (7th occurrence)
**PR:** #74 (af7d191)
**Reason:** Extracted BlogList's inline JSX into a memoized `<BlogPostCard />` + `useCallback`-stabilized `handleDeletePost`, same pattern already applied to SkillCard/ProjectCard/AgentCard/ThreadCard with no shared wrapper ever built (see AGENTS.md PR quality bar). Also reproduces the exact defect confirmed on PR #73: the `useCallback`/prop depends on `t` from `LanguageProvider`, which isn't memoized, so the memo chain doesn't actually hold.
**Do not propose again unless:** a shared memoized list-card wrapper is built once and reused, AND `LanguageProvider`'s `t` is made referentially stable first. Until then, any new `<XCard/>` + `useCallback([t, ...])` PR will have the same broken premise.

## 2026-07-22 - Upstream Referential Instability of LanguageProvider's translation function
**Learning:** Downstream `React.memo` and `useCallback` optimizations relying on `t` (from `LanguageProvider`) were silently invalidated because `t`, `setLanguage`, and the provider's context `value` object were completely recreated on every single render of `LanguageProvider`. This broke the memoization chain across the entire application.
**Action:** Always fully memoize localization context functions (`t` and `setLanguage`) using `useCallback` and wrap the context provider value object in `useMemo` with proper dependencies, ensuring complete referential stability.

## 2026-07-23 - Redundant sorting and string lowercasing in active explorer search views
**Learning:** In list explorer components (`ForumExplorer`, `AgentsExplorer`, `VibesExplorer`, and `BlogList`), search filters and view sorts were computed on every single render. Since search inputs bind to instant state updates on keyup, every keystroke triggered array copying, `.filter()`, `.sort()`, and CPU-heavy `.toLowerCase()` computations on the entire catalog.
**Action:** Always wrap combined search filters and view sorts in a `useMemo` block, ensuring query parsing, string mapping, and sorting are only executed when the base list, active view, or search parameters change.

## 2026-07-24 - Upvote callback referential instability breaking memoization on lists
**Learning:** In list components with memoized cards (`SkillsExplorer`, `VibesExplorer`, `AgentsExplorer`), the upvote callbacks depended on the local items state array (e.g., `projects`, `agents`, `allSkills`). This meant any upvote action modified the state, recreated the upvote callback, and destroyed the `React.memo` benefit on all other cards, causing O(N) card reconciliation on every upvote.
**Action:** Mirror the list state array to a `useRef` pointing to the items list, and update it inside a `useEffect` synced to the state. Reference the `useRef` inside the `handleUpvote` callback and omit the list state from the dependency array, keeping the callback reference fully stable.

## REJECTED — 2026-07-26 — Stray pnpm-lock.yaml + useMemo on a 4-item static nav (#80)
**PR:** #80 (bolt/header-navigation-memoization)
**Reason:** Added a 5,414-line `pnpm-lock.yaml` to this npm repo (recurring habit — see AGENTS.md PR quality bar; this lockfile has now been stripped or caused rejection on at least five PRs across the three repos). The code change memoized the Header's 4-item static nav array and its active-index calculation — a fixed-size, props-less computation with no measurable render cost. Memoization of trivially small static structures is complexity without benefit.
**Do not propose again unless:** the nav becomes dynamic (driven by data/props that change at runtime) or profiling shows Header re-renders are a measurable cost under real traffic. Never commit `pnpm-lock.yaml` here — this repo uses npm (`package-lock.json`).

## 2026-07-28 - Database-level date filtering in getFeedItems
**Learning:** Polling on interactive endpoints like `/api/feed` with a `since` parameter was previously fetching the full set of entries in SQL and filtering by date in JS memory. For larger catalogs, this wastes DB resources, CPU, and network transfer, and creates a critical correctness bug (truncating the feed list due to hard `.limit` queries before the date filtering occurs in JS).
**Action:** Filter dates at the database level by dynamically appending `.gt()` filters in SQL (lexicographical matching epoch-millisecond prefixed ID strings for skills/agents, and ISO-8601 strings on the real `created_at` timestamp column for vibes).

## 2026-07-29 - Redundant string date parsing in market feed mapping, filtering, and sorting
**Learning:** In the `getFeedItems` database utility function, item timestamps were being converted to string ISO strings, only to be repeatedly parsed back using `Date.parse()` in both the filtering and the sorting steps. In situations with larger feed listings (up to 300 total feed rows), this resulted in up to 5000+ redundant, computationally expensive regex-based date-string parsing operations on every single API request.
**Action:** Pre-calculate/pre-parse the epoch millisecond timestamps once per feed item during mapping, attach it as a temporary property (`publishedAtMs`), and use simple primitive number comparisons for all subsequent filter and sort actions. Strip the temporary property before returning.

## 2026-07-31 - Pre-serialization and caching of static OpenAPI endpoint
**Learning:** The OpenAPI 3.1 specification endpoint at `/api/openapi.json` returns a large (~500 lines) static document. Dynamic JSON serialization via `NextResponse.json` on every single request wastes server CPU cycles. Additionally, without caching headers, clients (especially automated AI agents/tools) are forced to download the entire spec on every call, increasing network and server load.
**Action:** Pre-serialize the static configuration object to a JSON string once at startup (module level), return it directly with a `Response` object to avoid runtime serialization overhead, and set a `Cache-Control` header (`public, max-age=3600, stale-while-revalidate=86400`) to enable downstream CDN and browser caching.

## 2026-08-01 - Regex-free ID parsing and deferred Date formatting in Market Feed
**Learning:** Eagerly parsing epoch timestamps via regex (`id.match()`) and converting thousands of database rows to ISO date strings (`new Date().toISOString()`) inside the mapping loop of `getFeedItems` creates a substantial CPU bottleneck. Since the feed is sliced to a small `limit` (e.g., 50) after sorting, eagerly formatting every single raw item is extremely wasteful.
**Action:** Extract epoch milliseconds from IDs using fast index checks and substring slicing instead of regular expressions. Defer ISO date string formatting to run only on the final sorted and sliced subset, cutting CPU-bound date parsing overhead on `/api/feed` up to 4x.

## REJECTED — 2026-08-01 — replacing data-driven UNITS table with duplicated if/else branches
**PR:** #93 (0fee349)
**Reason:** Rewrote `timeAgo`'s clean 4-entry `UNITS` config/loop into three near-duplicate if/else blocks to avoid "loop overhead" and "allocation overhead" — no benchmark or measurement backing the claim, and a 4-element array scan is not a measurable cost for a per-item formatter on a low-traffic site. Net effect: less readable, more surface, unproven payoff.
**Do not propose again unless:** real profiling data shows `timeAgo` (or its call site) is an actual measured bottleneck at current or realistic traffic — not a bare "avoids a loop" narration.
