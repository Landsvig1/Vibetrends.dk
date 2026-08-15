/**
 * The boards the /skills hub exposes as tabs, and the single validator both
 * sides of the island use. It lives here rather than in the route file because
 * the client explorer needs it too, and importing it from page.tsx would drag
 * the server data layer into the client bundle.
 */
/** Tab order, and it matches the other hubs: Dansk first, then Alle, then the
 * third board. That board is keyed `hot` and labelled "Hotteste globalt": one
 * key, one label, one query.
 *
 * It used to be keyed `trending` while reading "Hot" and querying neither the
 * `hot` view nor anything measured — it showed a hand-curated `trending_rank`
 * snapshot frozen at launch in June 2026. The board is now a weekly ranking
 * merged from external sources that publish an order, and the label names that
 * signal so nobody reads it as Danish community momentum.
 */
export const SKILL_BOARDS = ["danish", "all", "hot"] as const;

export type SkillBoard = (typeof SKILL_BOARDS)[number];

export const DEFAULT_SKILL_BOARD: SkillBoard = "danish";

/**
 * Coerce an untrusted `?view=` value to a board.
 *
 * Defaults to "danish", which is the site-wide convention: /vibes, /cli, /mcp
 * and /forum all open on the Danish board. Do not change this one hub away
 * from it in isolation.
 *
 * The problem that default caused — the board holds 45 of 99 and said so
 * nowhere, so a visitor could reasonably read the grid as the whole library —
 * is fixed by printing every board's size on its own tab instead of by
 * reordering the boards.
 *
 * `trending` is accepted as a deprecated alias for `hot` so links and agent
 * integrations minted before the two collapsed keep resolving to a real board
 * instead of silently falling back to the default one.
 */
export function getValidView(view: string | undefined): SkillBoard {
  if (view === "trending") return "hot";
  return SKILL_BOARDS.includes(view as SkillBoard)
    ? (view as SkillBoard)
    : DEFAULT_SKILL_BOARD;
}
