import { describe, it, expect } from "vitest";
import { timeAgo } from "@/lib/timeAgo";

const now = new Date("2026-06-23T12:00:00Z");
const ago = (secs: number) => new Date(now.getTime() - secs * 1000);

describe("timeAgo", () => {
  it("returns now/nu for sub-minute and future timestamps", () => {
    expect(timeAgo(ago(10), "en", now)).toBe("now");
    expect(timeAgo(ago(10), "da", now)).toBe("nu");
    expect(timeAgo(new Date(now.getTime() + 5000), "en", now)).toBe("now");
  });

  it("formats minutes, hours and days in English", () => {
    expect(timeAgo(ago(5 * 60), "en", now)).toBe("5m ago");
    expect(timeAgo(ago(2 * 3600), "en", now)).toBe("2h ago");
    expect(timeAgo(ago(3 * 86400), "en", now)).toBe("3d ago");
  });

  it("formats with Danish units", () => {
    expect(timeAgo(ago(5 * 60), "da", now)).toBe("5m siden");
    expect(timeAgo(ago(2 * 3600), "da", now)).toBe("2t siden");
    expect(timeAgo(ago(3 * 86400), "da", now)).toBe("3d siden");
  });

  it("falls back to an absolute date beyond ~30 days", () => {
    const old = timeAgo(ago(60 * 86400), "en", now);
    expect(old).not.toMatch(/ago|now/);
    expect(old).toMatch(/\d/);
  });

  it("returns empty string for an invalid date", () => {
    expect(timeAgo("not-a-date", "en", now)).toBe("");
  });
});
