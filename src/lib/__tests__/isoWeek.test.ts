import { describe, it, expect } from "vitest";
import { isoWeek } from "../isoWeek";

const at = (iso: string) => isoWeek(new Date(iso));

describe("isoWeek", () => {
  it("labels a mid-year Monday and the Sunday that closes the same week identically", () => {
    expect(at("2026-08-10T00:00:00Z")).toBe(at("2026-08-16T23:59:59Z"));
  });

  it("rolls to the next week on Monday, not on Sunday", () => {
    expect(at("2026-08-16T23:59:59Z")).not.toBe(at("2026-08-17T00:00:00Z"));
  });

  it("gives early January days the previous year's week when ISO says so", () => {
    // 2027-01-01 is a Friday, so it belongs to the week of 2026-12-28.
    expect(at("2027-01-01T12:00:00Z")).toBe("2026-W53");
    expect(at("2026-12-28T12:00:00Z")).toBe("2026-W53");
  });

  it("starts a year at W01 when January 1 is early enough in the week", () => {
    // 2025-01-01 is a Wednesday, so its week contains the first Thursday.
    expect(at("2025-01-01T12:00:00Z")).toBe("2025-W01");
  });

  it("zero-pads single-digit weeks so labels sort lexically", () => {
    expect(at("2026-01-08T00:00:00Z")).toMatch(/^2026-W0\d$/);
    const labels = ["2026-03-01", "2026-01-08", "2026-11-02"].map((d) => at(`${d}T00:00:00Z`));
    expect([...labels].sort()).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });

  it("is computed in UTC, so the runner's timezone cannot move the boundary", () => {
    // Same instant, two ways of expressing it.
    expect(at("2026-08-17T00:30:00Z")).toBe(isoWeek(new Date("2026-08-17T02:30:00+02:00")));
  });

  it("never emits the same label for two different weeks across a year boundary", () => {
    const seen = new Map<string, string>();
    for (let day = 0; day < 400; day++) {
      const date = new Date(Date.UTC(2026, 0, 1 + day));
      const label = isoWeek(date);
      // Monday of this date's week, as the canonical identity of the week.
      const monday = new Date(date);
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() || 7) - 1));
      const key = monday.toISOString().slice(0, 10);
      const existing = seen.get(label);
      if (existing) expect(existing).toBe(key);
      else seen.set(label, key);
    }
  });
});
