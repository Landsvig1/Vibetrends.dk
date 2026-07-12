# Bolt's Journal - Critical Learnings Only

This journal contains critical performance learnings discovered while optimizing the vibetrends codebase.

## 2026-07-07 - Explorer lists re-rendering on every keystroke
**Learning:** Client-side search filters in our feed explorers (such as `SkillsExplorer`) bind to instant query state updates via `nuqs`. Because these components contain long lists of items (such as `SkillCard` cards), every single keystroke triggers a full parent component update, which reconciles and re-renders every card in the list regardless of whether it actually changed. This creates significant overhead during typing.
**Action:** Always wrap reusable list card components (e.g. `SkillCard`) in `React.memo` with strict prop reference comparisons to eliminate redundant reconciliation during frequent state updates like real-time search typing.

## 2026-07-11 - [O(N * M) nested-loop in getThreads forum hot path]
**Learning:** In list views with related collections (such as forum threads and their replies), querying relations in bulk and joining them via nested `.filter()` inside a `.map()` creates an O(N * M) performance bottleneck. While SQL-side scoping limits the records, JS execution time still degrades quadratically as local threads and replies counts scale.
**Action:** Use a linear-time Map/hash table lookup to group relational data (e.g., grouping replies by `thread_id` into a `Map` first) before mapping parents, achieving O(N + M) execution efficiency.
