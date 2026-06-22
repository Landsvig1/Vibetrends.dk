"use client";

import Link from "next/link";
import { Star, Plug } from "lucide-react";
import { Skill } from "@/lib/db";

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
export function SkillCard({
  skill,
  githubLabel,
  connectLabel = "Connect",
}: {
  skill: Skill;
  githubLabel: string;
  connectLabel?: string;
}) {
  return (
    <div
      data-testid="skill-card"
      className="relative rounded-xl glass-card p-6 flex flex-col justify-between space-y-6 group hover:-translate-y-0.5 transition"
    >
      <Link
        href={`/skills/${skill.id}`}
        aria-label={skill.title}
        className="absolute inset-0 z-10 rounded-xl"
      />
      <div className="space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <span className="px-2 py-0.5 text-xs rounded bg-accent-light text-accent-primary border border-accent-primary/20">
              {skill.categoryLabel}
            </span>
            <h3 className="text-lg font-bold text-foreground mt-2 leading-tight group-hover:text-accent-primary transition-colors">
              {skill.title}
            </h3>
          </div>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed">{skill.description}</p>
        <div className="flex flex-wrap gap-1.5 pt-2">
          {skill.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs rounded-md bg-background text-text-secondary border border-card-border"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-card-border">
        <div>
          <div className="flex items-center space-x-1.5">
            <span className="text-sm font-semibold text-foreground">{skill.vibeCoder}</span>
            <div className="flex items-center text-accent-primary text-xs">
              <Star className="h-3.5 w-3.5 fill-accent-primary mr-0.5" />
              <span className="font-bold">{skill.rating}</span>
            </div>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">{skill.vibeCoderTitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/skills/${skill.id}#connect`}
            data-testid="skill-connect"
            onClick={(e) => e.stopPropagation()}
            className="relative z-20 flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded btn-secondary text-foreground shadow-sm hover:scale-[1.02] transition cursor-pointer"
          >
            <Plug className="h-4 w-4" />
            {connectLabel}
          </Link>
          {skill.githubUrl && (
            <a
              href={skill.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="relative z-20 flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded btn-secondary text-foreground shadow-sm hover:scale-[1.02] transition cursor-pointer"
            >
              <GithubIcon className="h-4 w-4" />
              {githubLabel}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
