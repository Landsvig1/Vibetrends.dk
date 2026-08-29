"use client";

import { memo } from "react";
import Link from "next/link";
import { Heart, Plug, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { Skill } from "@/lib/db";
import { ListCard } from "./ListCard";
import { SecurityBadge } from "./SecurityBadge";

const GithubIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className}
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

/**
 * Presentational skill card shared by the Skills hub (client) and the topic
 * landing pages (server). It is a client component so it can be rendered inside
 * either tree; it takes the GitHub link label as a prop so it needs no language
 * hook of its own. The compact Connect affordance links to the detail page,
 * where the full host picker (ConnectBlock) lives.
 */
function SkillCardComponent({
  skill,
  githubLabel,
  connectLabel = "Connect",
  onUpvote,
  onDelete,
}: {
  skill: Skill;
  githubLabel: string;
  connectLabel?: string;
  /** When set (client surfaces), the heart becomes an upvote button; without
   * it (server-rendered topic pages) the count is shown read-only. */
  onUpvote?: (id: string, e: React.MouseEvent) => void;
  /** When set (admin-only, client surfaces), shows a delete affordance. */
  onDelete?: (id: string, e: React.MouseEvent) => void;
}) {
  return (
    <ListCard
      data-testid="skill-card"
      href={`/skills/${skill.slug}`}
      ariaLabel={skill.title}
      className="p-6 flex flex-col justify-between space-y-6 h-full"
    >
      <div className="space-y-4 flex-1 flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-accent-light text-accent-primary border border-accent-primary/20 uppercase font-mono">
                  {skill.categoryLabel}
                </span>
                <SecurityBadge scan={skill.securityScan} />
              </div>
              <h3 className="text-lg font-bold text-foreground mt-1 leading-tight group-hover:text-accent-primary transition-colors">
                {skill.title}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(skill.id, e); }}
                  aria-label={`Slet ${skill.title}`}
                  data-testid="skill-delete"
                  className="relative flex items-center justify-center p-1.5 rounded-lg bg-background border border-card-border hover:bg-accent-light hover:border-accent-primary/20 text-text-secondary hover:text-accent-primary backdrop-blur-md transition z-20"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
              {onUpvote ? (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => { e.stopPropagation(); onUpvote(skill.id, e); }}
                  aria-label={`Stem på ${skill.title}`}
                  data-testid="skill-upvote"
                  className="relative flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-card-border hover:border-accent-primary/40 text-text-secondary hover:text-accent-primary backdrop-blur-md transition z-20"
                >
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.3 }}
                    key={skill.upvotes}
                  >
                    <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  </motion.div>
                  <span className="text-xs font-bold font-mono">{skill.upvotes}</span>
                </motion.button>
              ) : (
                /* pointer-events-none: this branch is a label, not a control,
                   and z-20 would otherwise lift it over ListCard's whole-card
                   overlay link and leave a dead click target on the card. */
                <span
                  data-testid="skill-upvote-count"
                  className="relative flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-card-border text-text-secondary z-20 pointer-events-none"
                >
                  <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  <span className="text-xs font-bold font-mono">{skill.upvotes}</span>
                  <span className="sr-only">{" upvotes"}</span>
                </span>
              )}
            </div>
          </div>

          {/* title so the clamped tail is recoverable without opening the card. */}
          <p
            title={skill.description}
            className="text-sm text-text-secondary leading-relaxed line-clamp-3"
          >
            {skill.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {skill.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-[10px] rounded-md bg-background text-text-secondary border border-card-border font-mono"
            >
              #{tag.replace(/^#/, "")}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-y-3 pt-4 border-t border-card-border">
        <div className="min-w-0 pr-2">
          <span className="text-xs font-semibold text-foreground truncate block">@{skill.vibeCoder}</span>
          <p className="text-[10px] text-text-secondary truncate mt-0.5">{skill.vibeCoderTitle}</p>
        </div>

        {/* Connect carries the weight, GitHub does not.
            These were two identical secondary buttons, and the GitHub one was
            the wider of the pair — so the control that sends the reader off to
            a README outranked the one that gets the skill into their agent.
            Connectability is the whole bet (PRODUCT.md), and the off-ramp was
            winning the card. The hover scale is gone with them: it was an
            un-guarded transform sitting outside the reduced-motion override. */}
        {/* py-2.5 on the GitHub link is hit area, not visual weight: as a bare
            text link it was a 16px-tall target, under the 24px floor. */}
        <div className="flex items-center gap-3">
          {skill.githubUrl && (
            <a
              href={skill.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="relative z-20 flex items-center gap-1.5 py-2.5 text-xs font-semibold text-text-secondary hover:text-accent-primary transition-colors cursor-pointer"
            >
              <GithubIcon className="h-3.5 w-3.5" />
              {githubLabel}
            </a>
          )}
          <Link
            href={`/skills/${skill.slug}#connect`}
            data-testid="skill-connect"
            onClick={(e) => e.stopPropagation()}
            /* See ProjectCard's "Se live": padding, radius and weight were
               inert against unlayered `.btn-primary`. */
            className="relative z-20 flex items-center gap-1.5 text-xs btn-primary cursor-pointer"
          >
            <Plug className="h-3.5 w-3.5" aria-hidden="true" />
            {connectLabel}
          </Link>
        </div>
      </div>
    </ListCard>
  );
}

/**
 * Memoized version of the presentational SkillCard component.
 * Eliminates unneeded re-renders when the parent component re-renders (e.g.,
 * during active typing in search inputs).
 */
export const SkillCard = memo(SkillCardComponent);
