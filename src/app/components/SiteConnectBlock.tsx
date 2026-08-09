"use client";

import { useState } from "react";
import CopyableCommand from "./CopyableCommand";
import { SITE_CONNECT_RECIPES } from "@/lib/agentSurface";

/**
 * "Add this catalog to your agent" — the recipe for pointing a host at this
 * site's own MCP endpoint, in the same host-tabbed shape the catalog already
 * uses for its entries (ConnectBlock).
 *
 * The site was an MCP server for months without ever printing the string
 * anywhere a human could copy it. This is that string.
 */
export default function SiteConnectBlock() {
  const [active, setActive] = useState(SITE_CONNECT_RECIPES[0].slug);
  const recipe =
    SITE_CONNECT_RECIPES.find((r) => r.slug === active) ?? SITE_CONNECT_RECIPES[0];

  return (
    <div
      data-testid="site-connect-block"
      className="rounded-xl glass-card p-6 space-y-5"
    >
      <div
        role="tablist"
        aria-label="Vælg host"
        className="flex flex-wrap gap-2"
      >
        {SITE_CONNECT_RECIPES.map((r) => (
          <button
            key={r.slug}
            type="button"
            role="tab"
            id={`site-connect-tab-${r.slug}`}
            aria-selected={r.slug === active}
            aria-controls={`site-connect-panel-${r.slug}`}
            onClick={() => setActive(r.slug)}
            className={`px-3 py-2 rounded-md text-xs font-semibold transition-colors cursor-pointer border ${
              r.slug === active
                ? "bg-accent-light text-accent-primary border-accent-primary/20"
                : "bg-background text-text-secondary border-card-border hover:text-foreground hover:bg-accent-light"
            }`}
          >
            {r.hostName}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`site-connect-panel-${recipe.slug}`}
        aria-labelledby={`site-connect-tab-${recipe.slug}`}
        className="space-y-3"
      >
        {recipe.command && (
          <CopyableCommand label="Kommando" value={recipe.command} />
        )}
        {recipe.configSnippet && recipe.configFile && (
          <CopyableCommand
            label={recipe.configFile}
            value={recipe.configSnippet}
            multiline
          />
        )}
        <p className="text-sm text-text-secondary">{recipe.note}</p>
      </div>
    </div>
  );
}
