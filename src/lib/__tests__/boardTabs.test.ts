import { describe, it, expect } from "vitest";
import { visibleBoards, resolveView, type Board } from "../boardTabs";

/**
 * The fixtures below mirror the live catalog sizes measured on 2026-08-14, so
 * a failure here means the rule stopped producing the tab rows that were
 * actually signed off, not merely that some abstract invariant moved.
 */

type Row = { id: string; danish: boolean; upvotes: number; name: string };

const row = (id: string, danish: boolean, upvotes: number, name = id): Row => ({
  id,
  danish,
  upvotes,
  name,
});

/** The three standard boards, built the way the explorers build them. */
function boardsFor(items: Row[], third: "hot" | "ranked" = "hot"): Board<Row>[] {
  const danish = [...items].filter((r) => r.danish).sort((a, b) => b.upvotes - a.upvotes);
  const all = [...items].sort((a, b) => a.name.localeCompare(b.name));
  const hot = [...items].sort((a, b) => b.upvotes - a.upvotes);
  return [
    { value: "danish", items: danish },
    { value: "all", items: all },
    { value: third, items: third === "hot" ? hot : items.filter((r) => r.upvotes > 90) },
  ];
}

const key = (r: Row) => r.id;

describe("visibleBoards — rule 0: an empty board is never a tab", () => {
  it("drops an empty third board and keeps the two that have content", () => {
    // The /skills state between the read-path deploy and the first merged
    // weekly ranking: Dansk and Alle are real, Hot has nothing to show.
    const items = Array.from({ length: 99 }, (_, i) => row(`s${i}`, i < 45, i));
    const boards: Board<Row>[] = [
      { value: "danish", items: items.filter((r) => r.danish) },
      { value: "all", items },
      { value: "hot", items: [] },
    ];
    const visible = visibleBoards(boards, key);

    expect(visible.map((b) => b.value)).toEqual(["danish", "all"]);
  });

  it("drops an empty default board and leaves the rest selectable", () => {
    const items = Array.from({ length: 10 }, (_, i) => row(`s${i}`, false, i));
    const boards: Board<Row>[] = [
      { value: "danish", items: [] },
      { value: "all", items },
      // A real subset, so rule 2 does not collapse the row for being a
      // sort control wearing a filter's clothing.
      { value: "hot", items: items.slice(0, 3) },
    ];
    const visible = visibleBoards(boards, key);

    expect(visible.map((b) => b.value)).toEqual(["all", "hot"]);
    // resolveView must not strand a request for the board that was dropped.
    expect(resolveView("danish", visible, "danish")).toBe("all");
  });

  it("still renders no row at all when every board is empty (/forum shape)", () => {
    const boards: Board<Row>[] = [
      { value: "danish", items: [] },
      { value: "all", items: [] },
      { value: "hot", items: [] },
    ];
    expect(visibleBoards(boards, key)).toEqual([]);
  });
});

describe("visibleBoards — a board row only when the boards differ", () => {
  it("/skills shape: three disjoint sets keep all three tabs, all counted", () => {
    // 98 entries, 45 Danish, 7 ranked and none of them Danish.
    const items = Array.from({ length: 98 }, (_, i) =>
      row(`s${i}`, i < 45, i >= 91 ? 99 : i, `skill-${String(i).padStart(2, "0")}`)
    );
    const visible = visibleBoards(boardsFor(items, "ranked"), key);

    expect(visible.map((b) => b.value)).toEqual(["danish", "all", "ranked"]);
    expect(visible.every((b) => b.showCount)).toBe(true);
  });

  it("/vibes shape: one foreign entry is enough to justify the row", () => {
    // 15 entries, 14 Danish. Dansk is a real subset, so the row survives.
    const items = Array.from({ length: 15 }, (_, i) => row(`v${i}`, i < 14, i));
    const visible = visibleBoards(boardsFor(items), key);

    expect(visible.map((b) => b.value)).toEqual(["danish", "all", "hot"]);
  });

  it("/vibes shape: Hot carries no count, because it can only ever repeat Alle's", () => {
    const items = Array.from({ length: 15 }, (_, i) => row(`v${i}`, i < 14, i));
    const visible = visibleBoards(boardsFor(items), key);

    expect(visible.find((b) => b.value === "danish")!.showCount).toBe(true);
    expect(visible.find((b) => b.value === "all")!.showCount).toBe(true);
    expect(visible.find((b) => b.value === "hot")!.showCount).toBe(false);
  });

  it("/cli shape: all-Danish catalog renders no row at all", () => {
    // 4 of 4 Danish. Dansk and Hot are byte-identical and Alle only re-sorts.
    const items = [
      row("a", true, 3, "alfa"),
      row("b", true, 1, "bravo"),
      row("c", true, 9, "charlie"),
      row("d", true, 5, "delta"),
    ];
    expect(visibleBoards(boardsFor(items), key)).toEqual([]);
  });

  it("/mcp shape: same at 11 entries — size is not what makes the row earn its place", () => {
    const items = Array.from({ length: 11 }, (_, i) => row(`m${i}`, true, i));
    expect(visibleBoards(boardsFor(items), key)).toEqual([]);
  });

  it("/forum shape: an empty hub renders no row", () => {
    expect(visibleBoards(boardsFor([]), key)).toEqual([]);
  });

  it("is self-correcting: the row returns the moment a foreign entry lands", () => {
    const danishOnly = [row("a", true, 3, "alfa"), row("b", true, 1, "bravo")];
    expect(visibleBoards(boardsFor(danishOnly), key)).toEqual([]);

    const withForeign = [...danishOnly, row("c", false, 2, "charlie")];
    expect(visibleBoards(boardsFor(withForeign), key).map((b) => b.value)).toEqual([
      "danish",
      "all",
      "hot",
    ]);
  });

  it("collapses an exact duplicate into the board declared first", () => {
    const items = [row("a", true, 2), row("b", true, 1)];
    const dup: Board<Row>[] = [
      { value: "danish", items },
      { value: "hot", items },
      { value: "all", items: [items[1], items[0]] },
    ];
    // "hot" is dropped as an exact duplicate of "danish"; "all" holds the same
    // MEMBERS as both, so nothing that survived differs by set → no row.
    expect(visibleBoards(dup, key)).toEqual([]);
  });

  it("treats a different order as a duplicate only when the members match too", () => {
    const a = row("a", true, 1);
    const b = row("b", false, 2);
    const boards: Board<Row>[] = [
      { value: "danish", items: [a] },
      { value: "all", items: [a, b] },
    ];
    expect(visibleBoards(boards, key).map((x) => x.value)).toEqual(["danish", "all"]);
  });

  it("does not mutate the boards it is given", () => {
    const items = Array.from({ length: 15 }, (_, i) => row(`v${i}`, i < 14, i));
    const boards = boardsFor(items);
    const before = boards.map((b) => b.items.map(key).join(","));
    visibleBoards(boards, key);
    expect(boards.map((b) => b.items.map(key).join(","))).toEqual(before);
  });
});

describe("resolveView — a stale ?view= cannot select a tab that isn't there", () => {
  const visible = [
    { value: "danish", items: [], showCount: true },
    { value: "all", items: [], showCount: true },
  ];

  it("keeps a requested view that still has a tab", () => {
    expect(resolveView("all", visible, "danish")).toBe("all");
  });

  it("falls back to the first visible board when the requested one was dropped", () => {
    // /cli?view=hot after Hot collapsed into Dansk.
    expect(resolveView("hot", visible, "danish")).toBe("danish");
  });

  it("falls back for an unknown view value", () => {
    expect(resolveView("nonsense", visible, "danish")).toBe("danish");
  });

  it("returns the hub's default when there is no row at all", () => {
    expect(resolveView("hot", [], "danish")).toBe("danish");
  });
});
