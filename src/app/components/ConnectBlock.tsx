"use client";

import { useState } from "react";
import { Copy, CheckCircle, Plug } from "lucide-react";
import { HOSTS, type FeedTypeSlug } from "@/lib/feedTypes";
import { buildConnectRecipe, type ConnectItem } from "@/lib/connect";

// One-step connect (R5/R6): pick a host, get a host-specific recipe templated
// over the item's existing install metadata. Shared by skills, MCP servers and
// tool-CLIs so any feed item is one step from a supported host.
export default function ConnectBlock({
  feedType,
  item,
  lang = "da",
}: {
  feedType: FeedTypeSlug;
  item: ConnectItem;
  lang?: "da" | "en";
}) {
  const [host, setHost] = useState<string>(HOSTS[0].slug);
  const [copied, setCopied] = useState<string | null>(null);

  const recipe = buildConnectRecipe(feedType, item, host, lang);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const heading = lang === "da" ? "Forbind til en host" : "Connect to a host";
  const stepsLabel = lang === "da" ? "Trin" : "Steps";

  return (
    <div
      data-testid="connect-block"
      className="p-6 rounded-2xl glass-panel border border-card-border space-y-5 shadow-xl"
    >
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-accent-primary" aria-hidden="true" />
        <h4 className="text-sm font-bold text-text-secondary uppercase tracking-widest">
          {heading}
        </h4>
      </div>

      {/* Host picker */}
      <div className="flex flex-wrap gap-2">
        {HOSTS.map((h) => (
          <button
            key={h.slug}
            type="button"
            data-testid={`connect-host-${h.slug}`}
            onClick={() => setHost(h.slug)}
            aria-pressed={host === h.slug}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
              host === h.slug
                ? "bg-accent-primary text-white font-extrabold shadow-md"
                : "bg-background border border-card-border text-text-secondary hover:bg-card-border hover:text-foreground"
            }`}
          >
            {h.name}
          </button>
        ))}
      </div>

      {/* Copyable command */}
      {recipe.command && (
        <div className="flex items-center justify-between rounded-xl bg-background border border-card-border p-4 font-mono text-xs text-accent-primary shadow-inner">
          {/* No truncation: the full command must be visible so a long payload
              tail can't be visually concealed behind an ellipsis. */}
          <span className="break-all pr-4">{recipe.command}</span>
          <button
            type="button"
            onClick={() => copy(recipe.command!, "command")}
            aria-label={lang === "da" ? "Kopiér kommando" : "Copy command"}
            className="p-2 rounded-lg bg-background border border-card-border text-text-secondary hover:text-foreground hover:bg-card-border transition active:scale-95 cursor-pointer"
          >
            {copied === "command" ? (
              <CheckCircle className="h-4 w-4 text-accent-primary" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      )}

      {/* Copyable config snippet */}
      {recipe.configSnippet && (
        <div className="relative rounded-xl bg-background border border-card-border p-4 shadow-inner">
          <button
            type="button"
            onClick={() => copy(recipe.configSnippet!, "config")}
            aria-label={lang === "da" ? "Kopiér konfiguration" : "Copy config"}
            className="absolute top-3 right-3 p-2 rounded-lg bg-background border border-card-border text-text-secondary hover:text-foreground hover:bg-card-border transition active:scale-95 cursor-pointer"
          >
            {copied === "config" ? (
              <CheckCircle className="h-4 w-4 text-accent-primary" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          <pre className="overflow-x-auto font-mono text-xs text-accent-primary pr-10 whitespace-pre">
            {recipe.configSnippet}
          </pre>
        </div>
      )}

      {/* Steps */}
      <div className="space-y-1">
        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
          {stepsLabel}
        </span>
        <ol className="list-decimal list-inside space-y-1 text-sm text-text-secondary">
          {recipe.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
