"use client";

import { memo } from "react";
import Link from "next/link";
import { BookOpen, Clock, Trash2, Layers, Cpu } from "lucide-react";
import { BlogPost } from "@/lib/db";

interface BlogPostCardProps {
  post: BlogPost;
  canDelete: boolean;
  confirmDeleteLabel: string;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case "Guides":
      return <BookOpen className="h-4.5 w-4.5 text-accent-primary" />;
    case "Workflow":
      return <Layers className="h-4.5 w-4.5 text-violet-600" />;
    case "Agents":
      return <Cpu className="h-4.5 w-4.5 text-emerald-600" />;
    default:
      return <BookOpen className="h-4.5 w-4.5 text-accent-primary" />;
  }
};

function BlogPostCardComponent({
  post,
  canDelete,
  confirmDeleteLabel,
  onDelete,
}: BlogPostCardProps) {
  return (
    <Link
      href={`/blog/${post.id}`}
      className="flex gap-4 items-start relative group rounded-xl p-4 -mx-4 hover:bg-accent-light/50 transition-all duration-300"
    >
      {/* Category Icon (Timeline Node) */}
      <div className="relative z-10 shrink-0 w-10 h-10 rounded-lg border border-card-border bg-card-bg flex items-center justify-center text-text-secondary group-hover:bg-accent-light group-hover:border-accent-primary/20 transition-all duration-300 hidden md:flex">
        {getCategoryIcon(post.category)}
      </div>

      {/* Content Area */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-accent-primary md:hidden">
          {post.category}
        </div>

        <h3 className="text-lg sm:text-xl font-bold text-foreground group-hover:text-accent-primary transition-colors leading-snug">
          {post.title}
        </h3>

        <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed max-w-3xl">
          {post.excerpt}
        </p>

        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary pt-1">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <div className="w-5 h-5 rounded-full bg-accent-light text-accent-primary font-bold text-[10px] flex items-center justify-center border border-accent-primary/10 select-none">
              {post.author.charAt(0).toUpperCase()}
            </div>
            <span>{post.author}</span>
          </div>
          <span className="text-card-border">•</span>
          <span>{post.publishedAt}</span>
          <span className="text-card-border">•</span>
          <span className="flex items-center">
            <Clock className="h-3.5 w-3.5 mr-1" />
            {post.readTime}
          </span>
        </div>
      </div>

      {/* Admin delete button */}
      {canDelete && (
        <button
          onClick={(e) => onDelete(post.id, e)}
          aria-label={confirmDeleteLabel}
          className="flex items-center justify-center p-1.5 rounded-lg bg-card-bg border border-card-border hover:bg-red-50 hover:border-red-200 text-text-secondary hover:text-red-600 transition cursor-pointer shrink-0 z-20"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </Link>
  );
}

export const BlogPostCard = memo(BlogPostCardComponent);
