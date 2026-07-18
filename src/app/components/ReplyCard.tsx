"use client";

import { memo } from "react";
import { Trash2, Heart } from "lucide-react";
import { ForumReply } from "@/lib/db";
import { timeAgo } from "@/lib/timeAgo";

interface ReplyCardProps {
  reply: ForumReply;
  language: "da" | "en";
  canDelete: boolean;
  onUpvote: (id: string) => void;
  onDelete: (id: string) => void;
}

function ReplyCardComponent({
  reply,
  language,
  canDelete,
  onUpvote,
  onDelete,
}: ReplyCardProps) {
  return (
    <div className="rounded-xl bg-background border border-card-border p-5 space-y-4 relative group/reply animate-in slide-in-from-bottom-2 duration-300">
      {canDelete && (
        <button
          onClick={() => onDelete(reply.id)}
          className="absolute top-4 right-4 flex items-center justify-center p-2 rounded-lg bg-background border border-card-border hover:bg-accent-light hover:border-accent-primary/20 text-text-secondary hover:text-accent-primary transition opacity-0 group-hover/reply:opacity-100 focus-visible:opacity-100"
          aria-label={language === "da" ? "Slet svar" : "Delete reply"}
          title={language === "da" ? "Slet svar" : "Delete reply"}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}

      <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-wrap pr-8">
        {reply.content}
      </p>

      <div className="flex items-center space-x-3 text-[10px] sm:text-xs text-text-secondary pt-2 border-t border-card-border">
        <div className="flex items-center space-x-1.5">
          <div className="h-5 w-5 rounded-full bg-background flex items-center justify-center text-[10px] font-bold text-text-secondary uppercase">
            {reply.author[0]}
          </div>
          <span className="font-bold text-text-secondary">@{reply.author}</span>
        </div>
        <span>&middot;</span>
        <span>{timeAgo(reply.createdAt, language)}</span>
        <button
          onClick={() => onUpvote(reply.id)}
          aria-label={language === "da" ? "Stem op" : "Upvote reply"}
          className="ml-auto flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-background border border-card-border hover:border-rose-500/40 text-text-secondary hover:text-accent-primary transition cursor-pointer"
        >
          <Heart className="h-3 w-3 fill-current" aria-hidden="true" />
          <span className="font-bold font-mono">{reply.upvotes}</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Memoized version of the presentational ReplyCard component.
 * Eliminates unneeded re-renders when the parent component re-renders (e.g.,
 * during active typing in the reply textarea).
 */
export const ReplyCard = memo(ReplyCardComponent);
