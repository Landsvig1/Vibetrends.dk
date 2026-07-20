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

## 2026-07-20 - Redundant Blog post card re-renders during active search typing
**Learning:** In `BlogList`, active typing in the search input triggered parent component state updates. Because blog post cards were rendered as raw inline JSX elements and filtering was computed on every render (including repeated lowercasing of search terms inside the loop), React was forced to fully reconcile and re-render every single blog post card, leading to performance degradation.
**Action:** Extracted the inline JSX into a dedicated `<BlogPostCard />` component wrapped in `React.memo`, wrapped the filtered query logic in `useMemo` with pre-computed lowercase search values to prevent redundant string manipulation, and stabilized the delete callback with `useCallback`. This completely eliminates redundant blog post reconciliation and render cycles during user search typing.
