/**
 * Relative-time formatter for forum timestamps ("2h ago" / "2t siden").
 * Bilingual (da/en), compact Reddit-style units. Pure function — unit-tested.
 */

const UNITS: { limit: number; secs: number; da: string; en: string }[] = [
  { limit: 60, secs: 1, da: "s", en: "s" }, // seconds
  { limit: 3600, secs: 60, da: "m", en: "m" }, // minutes
  { limit: 86400, secs: 3600, da: "t", en: "h" }, // hours
  { limit: 2592000, secs: 86400, da: "d", en: "d" }, // days (~30d cap)
];

export function timeAgo(
  date: string | number | Date,
  lang: "da" | "en" = "da",
  now: Date = new Date(),
): string {
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return "";

  const diffSecs = Math.floor((now.getTime() - then) / 1000);

  // Future or sub-minute → "now" / "nu".
  if (diffSecs < 60) return lang === "en" ? "now" : "nu";

  for (const unit of UNITS) {
    if (diffSecs < unit.limit) {
      const value = Math.floor(diffSecs / unit.secs);
      return lang === "en" ? `${value}${unit.en} ago` : `${value}${unit.da} siden`;
    }
  }

  // Older than ~30 days → absolute date in the locale.
  return new Date(date).toLocaleDateString(lang === "en" ? "en-GB" : "da-DK");
}
