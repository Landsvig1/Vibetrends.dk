"use client";

import { memo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, Trash2, Info } from "lucide-react";
import { ShowcaseProject } from "@/lib/db";

interface ProjectCardProps {
  project: ShowcaseProject;
  isPriority?: boolean;
  canDelete?: boolean;
  confirmDeleteLabel: string;
  detailsLabel: string;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onUpvote: (id: string, e: React.MouseEvent) => void;
}

function ProjectCardComponent({
  project,
  isPriority = false,
  canDelete = false,
  confirmDeleteLabel,
  detailsLabel,
  onDelete,
  onUpvote,
}: ProjectCardProps) {
  return (
    <div
      data-testid="project-card"
      className="relative rounded-xl glass-card overflow-hidden flex flex-col group"
    >
      {/* Card-wide overlay: screenshot, title, and whitespace all open
          the project's live site directly; the delete/upvote/detail
          controls sit above it at z-20. */}
      <Link
        href={project.demoUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={project.title}
        className="absolute inset-0 z-10 rounded-xl"
      />
      <div className="h-44 relative bg-background overflow-hidden">
        <Image
          src={project.imageUrl}
          alt={project.title}
          fill
          sizes="(max-w-7xl) 33vw, 100vw"
          priority={isPriority}
          className="object-cover opacity-75 group-hover:scale-[1.03] transition duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>

        {/* Delete button for author */}
        {canDelete && (
          <button
            onClick={(e) => onDelete(project.id, e)}
            aria-label={confirmDeleteLabel}
            className="absolute top-4 left-4 flex items-center justify-center p-1.5 rounded-lg bg-background border border-card-border hover:bg-accent-light hover:border-accent-primary/20 text-text-secondary hover:text-accent-primary backdrop-blur-md transition cursor-pointer z-20"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}

        <button
          onClick={(e) => onUpvote(project.id, e)}
          aria-label={`Upvote ${project.title}`}
          className="absolute top-4 right-4 flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-card-border hover:bg-rose-500/20 hover:border-rose-500/40 text-foreground hover:text-accent-primary backdrop-blur-md transition cursor-pointer z-20"
        >
          <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          <span className="text-xs font-bold font-mono">{project.upvotes}</span>
        </button>

        <Link
          href={`/vibes/${project.id}`}
          onClick={(e) => e.stopPropagation()}
          aria-label={detailsLabel}
          title={detailsLabel}
          className="absolute top-[3.25rem] right-4 flex items-center justify-center p-1.5 rounded-lg bg-background border border-card-border hover:bg-card-border text-text-secondary hover:text-foreground backdrop-blur-md transition cursor-pointer z-20"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="p-6 flex-1 flex flex-col gap-4">
        <div className="space-y-2 flex-1">
          <h3 className="text-lg font-bold text-foreground leading-tight">
            {project.title}
          </h3>
          <p className="text-sm text-text-secondary line-clamp-3">
            {project.description}
          </p>
        </div>
      </div>
    </div>
  );
}

export const ProjectCard = memo(ProjectCardComponent);
