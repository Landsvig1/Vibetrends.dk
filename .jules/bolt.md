# Bolt's Journal - Critical Learnings Only

This journal contains critical performance learnings discovered while optimizing the vibetrends codebase.

## 2026-07-07 - Explorer lists re-rendering on every keystroke
**Learning:** Client-side search filters in our feed explorers (such as `SkillsExplorer`) bind to instant query state updates via `nuqs`. Because these components contain long lists of items (such as `SkillCard` cards), every single keystroke triggers a full parent component update, which reconciles and re-renders every card in the list regardless of whether it actually changed. This creates significant overhead during typing.
**Action:** Always wrap reusable list card components (e.g. `SkillCard`) in `React.memo` with strict prop reference comparisons to eliminate redundant reconciliation during frequent state updates like real-time search typing.
