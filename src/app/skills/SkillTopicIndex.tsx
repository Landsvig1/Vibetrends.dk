import Link from "next/link";
import { SKILL_CATEGORIES } from "@/lib/skillCategories";
import { TopicIcon } from "@/app/components/TopicIcon";

/**
 * Server-rendered index of the eight topic pages, at the foot of /skills.
 *
 * Why it exists, and why it is not the topic cards that already live in
 * SkillsExplorer: those render only when `view === "all"`, which is a client
 * tab. The hub's default view is "danish", so the server response for /skills
 * contained no link to any /skills/topic/* URL — Google had never crawled a
 * single one of them (all eight returned `lastCrawlTime: never` on 2026-08-13,
 * re-polled to rule out inspection flapping).
 *
 * It also closes the larger hole. SkillsExplorer caps its grid at 12 cards
 * (INITIAL_VISIBLE) and expands client-side, so only 12 of the 98 skill detail
 * URLs were reachable by following links from the hub; the other 86 were
 * sitemap-only, which gets a URL crawled but passes it no internal authority.
 * Every skill has exactly one category drawn from these eight, and the topic
 * pages render their full list server-side with no truncation, so linking the
 * topics here restores a crawl path to the entire catalog in one hop.
 *
 * Deliberately additive: the 12-card cap is a considered mobile decision (see
 * the INITIAL_VISIBLE comment — 46 cards ran ~17,000px of scroll on a phone),
 * so this sits below the explorer rather than lifting that cap.
 */
export default function SkillTopicIndex({
  counts,
}: {
  counts: Record<string, number>;
}) {
  return (
    <section
      data-testid="skill-topic-index"
      aria-labelledby="skill-topic-index-heading"
      className="rounded-xl glass-card p-6 space-y-5"
    >
      <div className="space-y-2">
        <h2
          id="skill-topic-index-heading"
          className="text-lg font-bold text-foreground"
        >
          Alle emner
        </h2>
        <p className="text-sm text-text-secondary max-w-2xl">
          Hele biblioteket sorteret i otte emner. Hvert emne viser alle sine
          skills på én side.
        </p>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {SKILL_CATEGORIES.map((topic) => (
          <li key={topic.slug}>
            <Link
              href={`/skills/topic/${topic.slug}`}
              className="group flex items-center gap-3 rounded-lg border border-card-border p-3 hover:bg-accent-light transition-colors"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-light text-accent-primary">
                <TopicIcon name={topic.icon} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-foreground group-hover:text-accent-primary transition-colors">
                {topic.labelDa}
              </span>
              {/* aria-hidden: the count duplicates information the topic page
                  states in full, and reads as a bare number to a screen reader
                  sitting between two link labels. */}
              <span
                aria-hidden="true"
                className="shrink-0 text-xs font-mono text-text-secondary tabular-nums"
              >
                {counts[topic.slug] ?? 0}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
