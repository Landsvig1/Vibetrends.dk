/**
 * The boards the /skills hub exposes as tabs, and the single validator both
 * sides of the island use. It lives here rather than in the route file because
 * the client explorer needs it too, and importing it from page.tsx would drag
 * the server data layer into the client bundle.
 */
/** Tab order, and it matches the other hubs: Dansk first, then Alle, then the
 * hub's own third board (Hot on /vibes and /cli, Trender here). */
export const SKILL_BOARDS = ["danish", "all", "trending"] as const;

export type SkillBoard = (typeof SKILL_BOARDS)[number];

export const DEFAULT_SKILL_BOARD: SkillBoard = "danish";

/**
 * Coerce an untrusted `?view=` value to a board.
 *
 * Defaults to "danish", which is the site-wide convention: /vibes, /cli, /mcp
 * and /forum all open on the Danish board. Do not change this one hub away
 * from it in isolation.
 *
 * The problem that default caused — the board holds 45 of 98 and said so
 * nowhere, so a visitor could reasonably read the grid as the whole library —
 * is fixed by printing every board's size on its own tab instead of by
 * reordering the boards.
 *
 * "hot" is deliberately not a board here. getSkills() still serves it, and it
 * stays available to agents through /api/skills and the MCP tool, but no tab on
 * this page ever surfaced it: ?view=hot rendered rows with every tab reading
 * inactive and no control to get back. It folds to the default instead.
 */
export function getValidView(view: string | undefined): SkillBoard {
  return SKILL_BOARDS.includes(view as SkillBoard)
    ? (view as SkillBoard)
    : DEFAULT_SKILL_BOARD;
}
