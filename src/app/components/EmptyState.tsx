"use client";

import React from "react";
import { Search, PlusCircle, ArrowRight } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  suggestions?: {
    title: string;
    items: { id: string; title: string; href: string }[];
  };
}

export default function EmptyState({
  icon: Icon = Search,
  title,
  description,
  actionLabel,
  onAction,
  suggestions,
}: EmptyStateProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 rounded-2xl border border-dashed border-card-border bg-card-bg/30 text-center animate-in fade-in zoom-in duration-300">
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
        <button
          onClick={onAction}
          className="btn-primary flex items-center gap-2 mb-10"
        >
          <PlusCircle className="h-4 w-4" />
          {actionLabel}
        </button>
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
            {suggestions.items.map((item) => (
              <a
                key={item.id}
                href={item.href}
                className="flex items-center justify-between p-3 rounded-lg bg-background border border-card-border hover:border-accent-primary/30 hover:bg-accent-light/10 transition group text-left"
              >
                <span className="text-sm font-medium text-foreground truncate mr-4">
                  {item.title}
                </span>
                <ArrowRight className="h-4 w-4 text-text-secondary group-hover:text-accent-primary transition-transform group-hover:translate-x-1" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
