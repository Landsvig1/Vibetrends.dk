"use client";

import React from "react";
import { Search, PlusCircle, ArrowRight } from "lucide-react";

/**
 * A suggestion row. Either it navigates (`href`) or it acts in place
 * (`onSelect`) — the forum's cold-start state uses the latter to open the
 * composer pre-filled with a real catalog entry instead of sending the user
 * away from the very surface it is asking them to fill.
 */
interface EmptyStateSuggestion {
  id: string;
  title: string;
  href?: string;
  onSelect?: () => void;
}

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Defaults to the plus, which is right for "add one" and wrong for anything
   * else. Pass null when the primary action is not a contribution. */
  actionIcon?: React.ElementType | null;
  /**
   * A second way out, rendered beside the primary one. A zero-results search
   * has two genuinely useful next moves — get back to the full list, and add
   * the thing that was missing — and making one of them the only button meant
   * dropping the other.
   */
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  suggestions?: {
    title: string;
    items: EmptyStateSuggestion[];
  };
}

export default function EmptyState({
  icon: Icon = Search,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon: ActionIcon = PlusCircle,
  secondaryActionLabel,
  onSecondaryAction,
  suggestions,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 rounded-2xl border border-dashed border-card-border bg-card-bg/30 text-center">
      <div className="p-4 rounded-full bg-accent-light/30 text-accent-primary mb-6">
        <Icon className="h-10 w-10" />
      </div>

      <h3 className="text-xl font-bold text-foreground mb-2">
        {title}
      </h3>
      <p className="text-text-secondary max-w-sm mb-8">
        {description}
      </p>

      {onAction && actionLabel && (
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          <button
            type="button"
            onClick={onAction}
            className="btn-primary flex items-center gap-2"
          >
            {ActionIcon && <ActionIcon className="h-4 w-4" aria-hidden="true" />}
            {actionLabel}
          </button>
          {onSecondaryAction && secondaryActionLabel && (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="btn-secondary cursor-pointer"
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      )}

      {suggestions && suggestions.items.length > 0 && (
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="h-px flex-1 bg-card-border"></div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-secondary px-2">
              {suggestions.title}
            </span>
            <div className="h-px flex-1 bg-card-border"></div>
          </div>
          <div className="space-y-2">
            {suggestions.items.map((item) => {
              const rowClass =
                "w-full flex items-center justify-between p-3 rounded-lg bg-background border border-card-border hover:border-accent-primary/30 hover:bg-accent-light/10 transition group text-left";
              const label = (
                <>
                  <span className="text-sm font-medium text-foreground truncate mr-4">
                    {item.title}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-text-secondary group-hover:text-accent-primary transition-transform group-hover:translate-x-1" />
                </>
              );

              return item.onSelect ? (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onSelect}
                  className={`${rowClass} cursor-pointer`}
                >
                  {label}
                </button>
              ) : (
                <a key={item.id} href={item.href} className={rowClass}>
                  {label}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
