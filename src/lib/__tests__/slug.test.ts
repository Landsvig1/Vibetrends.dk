import { describe, it, expect } from "vitest";
import { slugify, nextFreeSlug, RESERVED_SLUGS, SLUG_MAX_LENGTH } from "../slug";

/**
 * U7 — the whole substance of the slug unit is this table. Written before the
 * implementation: the Danish folding and the edge cases define the function,
 * not the other way round.
 *
 * The underscore assertion at the bottom is load-bearing beyond aesthetics.
 * src/proxy.ts decides whether a param is a legacy ID by matching
 * /^(s_\d+|p_\d+|a_\d+|seed_)/ — if slugify could ever emit an underscore, a
 * slug could match that shape, trigger a Supabase lookup on the hot path, and
 * in the worst case redirect a live page to itself.
 */

const CASES: Array<[input: string, expected: string]> = [
  ["SEO & GEO", "seo-geo"],
  ["Dansk Ø-analyse", "dansk-oe-analyse"],
  ["Æblegrød på Åen", "aeblegroed-paa-aaen"],
  ["  leading and trailing  ", "leading-and-trailing"],
  ["C++", "c"],
  ["Topic", "topic"],
  ["s_1785096155359", "s-1785096155359"],
  ["seed_skill-creator", "seed-skill-creator"],
  ["Café Déjà Vu", "cafe-deja-vu"],
  ["Multiple   spaces--and__underscores", "multiple-spaces-and-underscores"],
  ["UPPER Case Title", "upper-case-title"],
];

describe("slugify", () => {
  it.each(CASES)("slugifies %j to %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("never emits an underscore, for any case in the table", () => {
    for (const [input] of CASES) {
      expect(slugify(input)).not.toContain("_");
    }
  });

  it("never produces a string matching the proxy's legacy-ID shape", () => {
    const ID_SHAPE = /^(s_\d+|p_\d+|a_\d+|seed_)/;
    for (const [input] of CASES) {
      expect(ID_SHAPE.test(slugify(input))).toBe(false);
    }
  });

  it("is idempotent for every case in the table", () => {
    for (const [input] of CASES) {
      const once = slugify(input);
      expect(slugify(once)).toBe(once);
    }
  });

  it("truncates a long title at a hyphen boundary, never mid-word", () => {
    const title = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const slug = slugify(title);

    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
    // Cutting at a hyphen boundary means the final segment is a whole token
    // from the input, not a prefix of one.
    const last = slug.split("-").pop();
    expect(title.toLowerCase().split(" ")).toContain(last);
    expect(slugify(slug)).toBe(slug);
  });

  it("hard-caps a single unbroken word rather than emitting an empty slug", () => {
    const slug = slugify("a".repeat(200));
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.length).toBeGreaterThan(0);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("returns a non-empty deterministic fallback when nothing maps to ASCII", () => {
    const a = slugify("日本語");
    const b = slugify("日本語");

    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toContain("_");
    // Different input, different fallback — two untranslatable titles must not
    // collapse onto one slug and then fight over the unique index.
    expect(slugify("日本語")).not.toBe(slugify("中文"));
    // And the fallback survives a second pass unchanged.
    expect(slugify(a)).toBe(a);
  });

  it("returns the fallback for an empty or whitespace-only title", () => {
    expect(slugify("")).not.toBe("");
    expect(slugify("   ")).not.toBe("");
    expect(slugify("")).toBe(slugify(""));
  });
});

describe("RESERVED_SLUGS", () => {
  it("includes the static sibling segments a slug would be shadowed by", () => {
    // src/app/skills/topic/[slug] — a skill slugged "topic" is unreachable.
    expect(RESERVED_SLUGS.has("topic")).toBe(true);
  });

  it("holds only already-slugified values, so membership checks can't miss", () => {
    for (const reserved of RESERVED_SLUGS) {
      expect(slugify(reserved)).toBe(reserved);
    }
  });
});

/**
 * The collision rules the backfill (scripts/backfill-slugs.mjs) applies. Tested
 * here rather than through the script, which needs a database — and "the second
 * row of a shared title gets -2" is a rule that, once wrong, is baked into
 * indexed URLs permanently.
 */
describe("nextFreeSlug", () => {
  it("gives the first row of a shared title the bare slug and the second -2", () => {
    const taken = new Set<string>();
    const first = nextFreeSlug("React Dashboard", taken);
    taken.add(first);
    const second = nextFreeSlug("React Dashboard", taken);

    expect(first).toBe("react-dashboard");
    expect(second).toBe("react-dashboard-2");
  });

  it("keeps counting past -2 for a third and fourth collision", () => {
    const taken = new Set(["x", "x-2", "x-3"]);
    expect(nextFreeSlug("X", taken)).toBe("x-4");
  });

  it("suffixes a reserved slug instead of emitting it bare", () => {
    expect(nextFreeSlug("Topic", new Set())).toBe("topic-2");
  });

  it("is deterministic — the same rows in the same order produce the same slugs", () => {
    const run = () => {
      const taken = new Set<string>();
      return ["Alpha", "Alpha", "Beta", "Alpha"].map((t) => {
        const s = nextFreeSlug(t, taken);
        taken.add(s);
        return s;
      });
    };
    expect(run()).toEqual(["alpha", "alpha-2", "beta", "alpha-3"]);
    expect(run()).toEqual(run());
  });

  it("never hands out a slug an existing row already holds", () => {
    // A re-run after new submissions: their slugs are reserved up front.
    const taken = new Set(["react-dashboard"]);
    expect(nextFreeSlug("React Dashboard", taken)).toBe("react-dashboard-2");
  });

  it("suffixes rather than collides when two untranslatable titles differ", () => {
    const taken = new Set<string>();
    const a = nextFreeSlug("日本語", taken);
    taken.add(a);
    const b = nextFreeSlug("中文", taken);
    expect(b).not.toBe(a);
  });
});
