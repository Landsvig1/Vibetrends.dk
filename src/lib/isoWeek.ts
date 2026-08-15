// ISO-8601 week labels, used as the key for a weekly Hot ranking and as the
// manifest filename (rankings/skills-hot/<YYYY-Www>.md).
//
// This module is deliberately import-free: scripts/scan-hot-skills.mjs loads it
// directly through Node's built-in TypeScript type stripping. Same split as
// src/lib/epochId.ts and src/lib/hotMerge.ts.

/**
 * The ISO week containing `date`, as `YYYY-Www`.
 *
 * ISO rules, not "week of the year": weeks start Monday, and week 1 is the one
 * containing the first Thursday of the year. That is why the label's year can
 * differ from the date's own year — 2027-01-01 is a Friday and belongs to
 * 2026-W53. Naive week numbering would emit 2027-W01 there and again a few days
 * later, giving two different weeks the same key and colliding on the manifest
 * filename and the ranking primary key.
 *
 * Computed entirely in UTC. The scan runs on a UTC cron, and letting a runner's
 * local timezone decide the week would move the boundary depending on where the
 * job happened to execute.
 */
export function isoWeek(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  // Monday = 1 ... Sunday = 7, rather than JS's Sunday = 0.
  const dayNumber = d.getUTCDay() || 7;
  // Step to the Thursday of this week: that day's year is the ISO week-year.
  d.setUTCDate(d.getUTCDate() + 4 - dayNumber);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
