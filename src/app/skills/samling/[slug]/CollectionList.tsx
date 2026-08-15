"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Skill } from "@/lib/db";
import { SkillCard } from "@/app/components/SkillCard";

/**
 * The member list, with an in-page filter above a threshold.
 *
 * The filter is the answer to the real problem on a large collection (33 items
 * is a lot to scan) which grouping by category never solved. Below the
 * threshold a filter would be an affordance that tells the reader nothing, the
 * same test `visibleBoards` applies to the board row.
 */
const FILTER_THRESHOLD = 12;

export function CollectionList({
  skills,
  githubLabel,
  connectLabel,
}: {
  skills: Skill[];
  githubLabel: string;
  connectLabel: string;
}) {
  const [query, setQuery] = useState("");
  const showFilter = skills.length > FILTER_THRESHOLD;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills;
    return skills.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [skills, query]);

  return (
    <div className="space-y-6">
      {showFilter && (
        <div className="space-y-2">
          <label htmlFor="collection-filter" className="sr-only">
            Filtrér skills i denne samling
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
              aria-hidden="true"
            />
            <input
              id="collection-filter"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrér i samlingen"
              className="w-full rounded-lg border border-card-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-text-secondary"
            />
          </div>
          {/* Announced, not just rendered: typing changes the grid below and a
              screen reader gets no signal from the cards disappearing. */}
          <p aria-live="polite" className="text-xs text-text-secondary">
            {query.trim()
              ? `${visible.length} af ${skills.length} skills`
              : `${skills.length} skills`}
          </p>
        </div>
      )}

      {visible.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {visible.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              githubLabel={githubLabel}
              connectLabel={connectLabel}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-card-border bg-background py-12 text-center">
          <p className="font-semibold text-text-secondary">
            Ingen skills matcher &quot;{query.trim()}&quot;.
          </p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-3 text-sm font-semibold text-accent-primary hover:underline"
          >
            Ryd filteret
          </button>
        </div>
      )}
    </div>
  );
}
