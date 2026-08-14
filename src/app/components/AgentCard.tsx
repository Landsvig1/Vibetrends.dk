"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import {
  Terminal,
  Cpu,
  Globe,
  Heart,
  Copy,
  CheckCircle,
  Trash2,
} from "lucide-react";
import { Agent } from "@/lib/db";
import { ListCard } from "./ListCard";

interface AgentCardProps {
  agent: Agent;
  detailBase: string;
  testId: "mcp-card" | "cli-card";
  isCopied?: boolean;
  canDelete?: boolean;
  confirmDeleteLabel?: string;
  sourceLabel: string;
  copyLabel?: string;
  copiedLabel?: string;
  byLabel: string;
  detailsLabel: string;
  onDelete?: (id: string, e: React.MouseEvent) => void;
  /**
   * Client surfaces (/cli, /mcp) pass these and get an upvote button and a
   * copy button. Server surfaces — the homepage row — omit them and get the
   * read-only card: the count renders as text and the install command stays
   * select-all-able. Same arrangement SkillCard uses for the topic pages, so
   * one card definition covers both trees instead of a hand-copied twin.
   */
  onUpvote?: (id: string, e: React.MouseEvent) => void;
  onCopy?: (id: string, command: string, e: React.MouseEvent) => void;
}

const categoryIcons = {
  CLI: <Terminal className="h-4 w-4" />,
  "MCP Server": <Cpu className="h-4 w-4" />,
  Host: <Globe className="h-4 w-4" />,
};

function AgentCardComponent({
  agent,
  detailBase,
  testId,
  isCopied = false,
  canDelete = false,
  confirmDeleteLabel = "",
  sourceLabel,
  copyLabel = "",
  copiedLabel = "",
  byLabel,
  detailsLabel,
  onDelete,
  onUpvote,
  onCopy,
}: AgentCardProps) {
  return (
    <ListCard
      data-testid={testId}
      href={`${detailBase}/${agent.slug}`}
      ariaLabel={agent.name}
      className="p-6 flex flex-col justify-between space-y-6 h-full"
    >
      <div className="space-y-4 flex-1 flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold rounded bg-accent-light text-accent-primary border border-accent-primary/20 uppercase font-mono">
                  {categoryIcons[agent.category as keyof typeof categoryIcons]}
                  {agent.category}
                </div>
                {canDelete && onDelete && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(agent.id, e);
                    }}
                    aria-label={confirmDeleteLabel}
                    className="relative flex items-center justify-center p-1.5 rounded-lg bg-background border border-card-border hover:bg-accent-light hover:border-accent-primary/20 text-text-secondary hover:text-accent-primary backdrop-blur-md transition cursor-pointer z-20"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </motion.button>
                )}
              </div>
              <h3 className="text-lg font-bold text-foreground group-hover:text-accent-primary transition-colors leading-tight pt-1">
                {agent.name}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              {agent.sourceUrl && (
                <motion.a
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  href={agent.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={sourceLabel}
                  className="relative flex items-center justify-center p-2 rounded-lg bg-background border border-card-border hover:border-accent-primary/40 text-text-secondary hover:text-accent-primary backdrop-blur-md transition z-20"
                >
                  <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                </motion.a>
              )}
              {onUpvote ? (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpvote(agent.id, e);
                  }}
                  aria-label={`Upvote ${agent.name}`}
                  className="relative flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-card-border hover:border-accent-primary/40 text-text-secondary hover:text-accent-primary backdrop-blur-md transition z-20"
                >
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.3 }}
                    key={agent.upvotes}
                  >
                    <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  </motion.div>
                  <span className="text-xs font-bold font-mono">{agent.upvotes}</span>
                </motion.button>
              ) : (
                <span className="relative flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-card-border text-text-secondary z-20">
                  <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  <span className="text-xs font-bold font-mono">{agent.upvotes}</span>
                </span>
              )}
            </div>
          </div>

          <p className="text-sm text-text-secondary leading-relaxed line-clamp-3">
            {agent.description}
          </p>

          <div className="flex items-center justify-between rounded-lg bg-background border border-card-border p-3 font-mono text-[10px] text-accent-primary relative group/install">
            <span className={`truncate ${onCopy ? "pr-8" : "select-all"}`}>{agent.installCommand}</span>
            {onCopy && (
              <button
                onClick={(e) => onCopy(agent.id, agent.installCommand, e)}
                aria-label={isCopied ? copiedLabel : copyLabel}
                className="absolute right-2 p-1.5 rounded bg-background border border-card-border text-text-secondary hover:text-foreground hover:bg-accent-light transition-colors z-20"
              >
                {isCopied ? (
                  <CheckCircle
                    className="h-3.5 w-3.5 text-accent-primary"
                    aria-hidden="true"
                  />
                ) : (
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {agent.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-[10px] rounded-md bg-background text-text-secondary border border-card-border font-mono"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-card-border text-[10px] text-text-secondary uppercase font-bold tracking-widest">
        <span>
          {byLabel} {agent.developer}
        </span>
        <span className="text-accent-primary group-hover:translate-x-1 transition-transform flex items-center gap-1">
          {detailsLabel} <span className="text-xs">&rarr;</span>
        </span>
      </div>
    </ListCard>
  );
}

/**
 * Memoized version of the presentational AgentCard component.
 * Eliminates unneeded re-renders when the parent component re-renders (e.g.,
 * during active typing in search inputs).
 */
export const AgentCard = memo(AgentCardComponent);
