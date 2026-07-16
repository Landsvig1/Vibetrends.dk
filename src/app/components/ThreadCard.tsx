"use client";

import { memo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { MessageSquare, Trash2, TrendingUp, Clock, User } from "lucide-react";
import { ForumThread } from "@/lib/db";
import { forumCategoryLabel } from "@/lib/forumCategories";
import { timeAgo } from "@/lib/timeAgo";

interface ThreadCardProps {
  thread: ForumThread;
  language: "da" | "en";
  canDelete: boolean;
  repliesLabel: string;
  onUpvote: (id: string) => void;
  onDelete: (id: string) => void;
}

function ThreadCardComponent({
  thread,
  language,
  canDelete,
  repliesLabel,
  onUpvote,
  onDelete,
}: ThreadCardProps) {
  return (
    <div className="flex">
      {/* Absolute overlay Link: screenshot, title, and whitespace all open
          the thread details directly; the delete/upvote sit above it at z-20. */}
      <Link
        href={`/forum/${thread.id}`}
        aria-label={thread.title}
        className="absolute inset-0 z-10"
      />

      {/* Reddit-style Vote Column */}
      <div className="hidden sm:flex flex-col items-center w-12 pt-4 bg-black/5 dark:bg-white/5 border-r border-card-border/50">
        <motion.button
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onUpvote(thread.id);
          }}
          className="p-1 text-text-secondary hover:text-accent-primary transition-colors z-20 cursor-pointer"
        >
          <TrendingUp className="h-5 w-5" />
        </motion.button>
        <span className="text-xs font-bold text-foreground my-1">{thread.upvotes}</span>
      </div>

      <div className="flex-1 p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
          <span className="text-accent-primary px-1.5 py-0.5 rounded bg-accent-light/50 border border-accent-primary/10">
            {forumCategoryLabel(thread.category, language)}
          </span>
          <span>&middot;</span>
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            @{thread.author}
          </span>
          <span>&middot;</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeAgo(thread.createdAt, language)}
          </span>

          {canDelete && (
            <motion.button
              whileHover={{ scale: 1.1, color: "#ef4444" }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(thread.id);
              }}
              className="ml-auto p-1 text-text-secondary transition-colors z-20 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </motion.button>
          )}
        </div>

        <div className="space-y-1">
          <h3 className="text-base sm:text-lg font-bold text-foreground group-hover:text-accent-primary transition-colors leading-snug">
            {thread.title}
          </h3>
          <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed font-serif italic opacity-80">
            {thread.content}
          </p>
        </div>

        <div className="flex items-center space-x-4 pt-1 text-xs font-bold text-text-secondary">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-card-border/30 hover:bg-card-border/50 transition-colors">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>
              {thread.replies.length} {repliesLabel}
            </span>
          </div>

          <div className="sm:hidden flex items-center gap-1.5 px-2 py-1 rounded-md bg-card-border/30">
            <TrendingUp className="h-3.5 w-3.5 text-accent-primary" />
            <span>{thread.upvotes}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Memoized version of the presentational ThreadCard component.
 * Eliminates unneeded re-renders when the parent component re-renders (e.g.,
 * during active typing in search inputs).
 */
export const ThreadCard = memo(ThreadCardComponent);
