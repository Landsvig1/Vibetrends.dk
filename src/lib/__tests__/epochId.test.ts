import { describe, it, expect } from "vitest";
import { epochFromId, contentUpdatedAtSeed } from "@/lib/epochId";

describe("epochFromId", () => {
  it("extracts the millisecond epoch from an app-generated id", () => {
    expect(epochFromId("s_1785096155359")).toBe(1785096155359);
    expect(epochFromId("p_1784000000000")).toBe(1784000000000);
    expect(epochFromId("a_1783085673118")).toBe(1783085673118);
  });

  it("returns 0 for legacy seed_* ids, which carry no epoch", () => {
    expect(epochFromId("seed_copywriting")).toBe(0);
    expect(epochFromId("seed_tdd")).toBe(0);
  });

  it("returns 0 rather than a bogus number for ids it cannot parse", () => {
    expect(epochFromId("")).toBe(0);
    expect(epochFromId("s_")).toBe(0);
    expect(epochFromId("s_notanumber")).toBe(0);
    expect(epochFromId("1785096155359")).toBe(0);
    // Uppercase prefix isn't a shape this codebase generates.
    expect(epochFromId("S_1785096155359")).toBe(0);
  });
});

describe("contentUpdatedAtSeed", () => {
  it("returns the row's creation instant as an ISO timestamp", () => {
    expect(contentUpdatedAtSeed("s_1785096155359")).toBe(
      new Date(1785096155359).toISOString()
    );
  });

  it("returns null for ids with no epoch, rather than inventing a date", () => {
    expect(contentUpdatedAtSeed("seed_copywriting")).toBeNull();
    expect(contentUpdatedAtSeed("s_notanumber")).toBeNull();
  });

  /**
   * The point of seeding from the id rather than from a build date: the whole
   * reason Google learned to ignore lastmod on this site was 150 URLs sharing
   * one timestamp. Distinctness is the property that matters, not recency.
   */
  it("produces a distinct value per id", () => {
    const ids = ["s_1785096155359", "s_1785096155360", "s_1700000000000"];
    const seeds = ids.map(contentUpdatedAtSeed);
    expect(new Set(seeds).size).toBe(ids.length);
  });

  it("rejects an epoch outside the representable Date range instead of throwing", () => {
    expect(contentUpdatedAtSeed(`s_${Number.MAX_SAFE_INTEGER}`)).toBeNull();
  });
});
