"use client";

import React from "react";
import Link from "next/link";

/**
 * The shell every catalog list card shares: a `.glass-card` surface plus the
 * whole-card overlay link that DESIGN.md names as the standard pattern
 * ("an absolutely positioned overlay link covers the card at z-10; interactive
 * controls inside it sit at z-20 and stop propagation").
 *
 * This exists because that shell had been hand-copied into SkillCard,
 * AgentCard and ProjectCard, and the copies had already drifted apart:
 * two of them carried `hover:-translate-y-0.5 transition-all hover:shadow-md
 * hover:shadow-accent-primary/5` on top of `.glass-card`, which
 *   - duplicates a lift `.glass-card:hover` already applies (and applies it
 *     with an un-guarded Tailwind transform, outside the
 *     prefers-reduced-motion override that resets `.glass-card:hover`), and
 *   - adds a hover shadow bloom, which the Border-Becomes-Accent rule
 *     explicitly rules out: the hover signal is the hairline turning Forest
 *     Ink plus the 2px rise, never a shadow.
 * Consolidating here means the hover behavior is defined once, in CSS, where
 * the reduced-motion guard can actually reach it.
 *
 * Deliberately NOT wrapped in React.memo. `children` is a fresh element on
 * every parent render, so a memo here would compare unequal every time and buy
 * nothing while implying otherwise. Memoization belongs on the leaf card
 * components, which own their own props — see SkillCard/AgentCard/ProjectCard.
 */
export interface ListCardProps {
  /** Whole-card destination. */
  href: string;
  /** Accessible name for the overlay link — normally the entry's title. */
  ariaLabel: string;
  /** Opens in a new tab with the usual rel guard. For off-site targets. */
  external?: boolean;
  "data-testid"?: string;
  /**
   * Layout classes for the card body. The surface, radius, border, hover and
   * focus-within behavior all come from `.glass-card` and are not overridable
   * here on purpose.
   */
  className?: string;
  children: React.ReactNode;
}

export function ListCard({
  href,
  ariaLabel,
  external = false,
  className = "",
  children,
  ...rest
}: ListCardProps) {
  return (
    <div
      data-testid={rest["data-testid"]}
      className={`relative rounded-xl glass-card group ${className}`}
    >
      <Link
        href={href}
        aria-label={ariaLabel}
        className="absolute inset-0 z-10 rounded-xl"
        {...(external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      />
      {children}
    </div>
  );
}
