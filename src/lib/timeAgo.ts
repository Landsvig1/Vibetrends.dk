/**
 * Relative-time formatter for forum timestamps ("2h ago" / "2t siden").
 * Bilingual (da/en), compact Reddit-style units. Pure function — unit-tested.
 *
 * ⚡ Bolt Optimization:
 * - Direct type-checking (typeof, instanceof) to retrieve milliseconds immediately without redundant Date instantiation.
 * - Single conditional branch pattern instead of looping through a dynamic list of objects, avoiding allocation overhead.
 * - Drastically speeds up high-frequency formatting calls across long list renders.
 */

export function timeAgo(
  date: string | number | Date,
  lang: "da" | "en" = "da",
  now: Date = new Date(),
): string {
  let then: number;
  if (typeof date === "number") {
    then = date;
  } else if (date instanceof Date) {
    then = date.getTime();
  } else {
    then = Date.parse(date);
    if (Number.isNaN(then)) return "";
  }

  const diffSecs = Math.floor((now.getTime() - then) / 1000);

  // Future or sub-minute → "now" / "nu".
  if (diffSecs < 60) return lang === "en" ? "now" : "nu";

  // Compact relative boundaries:
  // < 3600s (60m)
  if (diffSecs < 3600) {
    const value = Math.floor(diffSecs / 60);
    return lang === "en" ? `${value}m ago` : `${value}m siden`;
  }
  // < 86400s (24h)
  if (diffSecs < 86400) {
    const value = Math.floor(diffSecs / 3600);
    return lang === "en" ? `${value}h ago` : `${value}t siden`;
  }
  // < 2592000s (30d)
  if (diffSecs < 2592000) {
    const value = Math.floor(diffSecs / 86400);
    return lang === "en" ? `${value}d ago` : `${value}d siden`;
  }

  // Older than ~30 days → absolute date in the locale.
  return new Date(then).toLocaleDateString(lang === "en" ? "en-GB" : "da-DK");
}
