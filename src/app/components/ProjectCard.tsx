"use client";

import { memo } from "react";
import { Heart, Trash2, ExternalLink } from "lucide-react";
import { ShowcaseProject } from "@/lib/db";
import { ListCard } from "./ListCard";
import { CardThumbnail } from "./CardThumbnail";

interface ProjectCardProps {
  project: ShowcaseProject;
  isPriority?: boolean;
  canDelete?: boolean;
  confirmDeleteLabel: string;
  /** Label for the secondary action that opens the project's own site. */
  demoLabel: string;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onUpvote: (id: string, e: React.MouseEvent) => void;
}

/**
 * Showcase card for /vibes.
 *
 * The whole-card click goes to the in-site detail page, not to the project's
 * own site. It used to be the other way round — the card was one big off-site
 * link with a 28px icon button as the only route to /vibes/{slug} — which sent
 * every visitor away permanently and left the detail page, the upvote and the
 * rest of the catalog unreachable from the surface meant to lead into them.
 * The live demo is still one click away, now as a labelled action instead of
 * the entire card.
 */
function ProjectCardComponent({
  project,
  isPriority = false,
  canDelete = false,
  confirmDeleteLabel,
  demoLabel,
  onDelete,
  onUpvote,
}: ProjectCardProps) {
  return (
    <ListCard
      data-testid="project-card"
      href={`/vibes/${project.slug}`}
      ariaLabel={project.title}
      className="overflow-hidden flex flex-col h-full"
    >
      <CardThumbnail
        src={project.imageUrl}
        alt={project.title}
        heightClass="h-44"
        sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
        priority={isPriority}
      >
        {/* Delete button for author */}
        {canDelete && (
          <button
            onClick={(e) => onDelete(project.id, e)}
            aria-label={confirmDeleteLabel}
            className="absolute top-4 left-4 flex items-center justify-center h-11 w-11 rounded-lg bg-background border border-card-border hover:bg-accent-light hover:border-accent-primary/20 text-text-secondary hover:text-accent-primary backdrop-blur-md transition cursor-pointer z-20"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        <button
          onClick={(e) => onUpvote(project.id, e)}
          aria-label={`Upvote ${project.title}`}
          className="absolute top-4 right-4 flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-lg bg-background border border-card-border hover:bg-accent-primary/10 hover:border-accent-primary/40 text-foreground hover:text-accent-primary backdrop-blur-md transition cursor-pointer z-20"
        >
          <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          <span className="text-xs font-bold font-mono">{project.upvotes}</span>
        </button>
      </CardThumbnail>

      <div className="p-6 flex-1 flex flex-col gap-4">
        <div className="space-y-2 flex-1">
          <h3 className="text-lg font-bold text-foreground leading-tight group-hover:text-accent-primary transition-colors">
            {project.title}
          </h3>
          <p className="text-sm text-text-secondary line-clamp-3">
            {project.description}
          </p>
        </div>

        {project.tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {project.tools.slice(0, 4).map((tool) => (
              <span
                key={tool}
                className="px-2 py-0.5 text-[10px] rounded-md bg-background text-text-secondary border border-card-border font-mono"
              >
                {tool}
              </span>
            ))}
          </div>
        )}

        {/* Credit the builder, and give the live site a real labelled action.
            A showcase that names nobody can't turn a visitor into a follower.
            Not every row has an author (at least one live project has an empty
            string), so the credit is omitted rather than rendered as a bare
            "@" — the demo action then simply sits alone on the row. */}
        <div className="flex flex-wrap items-center justify-between gap-y-3 pt-4 border-t border-card-border">
          {project.author.trim() ? (
            <span className="text-xs font-semibold text-foreground truncate min-w-0 pr-2">
              @{project.author}
            </span>
          ) : (
            <span aria-hidden="true" />
          )}
          <a
            href={project.demoUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="relative z-20 flex items-center gap-1.5 text-xs btn-secondary cursor-pointer"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {demoLabel}
          </a>
        </div>
      </div>
    </ListCard>
  );
}

export const ProjectCard = memo(ProjectCardComponent);
