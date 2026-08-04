"use client";

import { useState } from "react";
import { Copy, CheckCircle, Terminal } from "lucide-react";
import { HOSTS, type FeedTypeSlug } from "@/lib/feedTypes";
import { buildConnectRecipe, type ConnectItem } from "@/lib/connect";

// One-step install/connect component (R5/R6).
// For skills, presents a direct, distilled "INSTALLATION: Code" block that works across
// all AI agents without requiring host tab selection by default.
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
  const [showAdvanced, setShowAdvanced] = useState(false);

  const recipe = buildConnectRecipe(feedType, item, host, lang);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  // Direct, distilled INSTALLATION block for skills across AI agents (/distill + /clarify)
  if (feedType === "skills") {
    const cloneUrl = item.githubUrl && /^https:\/\/github\.com\//i.test(item.githubUrl) ? item.githubUrl : undefined;
    const installCmd = item.installCommand?.trim() || (cloneUrl ? `git clone ${cloneUrl}` : item.source ? `git clone ${item.source}` : null);

    return (
      <div
        data-testid="connect-block"
        className="p-6 rounded-2xl glass-panel border border-card-border space-y-4 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-accent-primary" aria-hidden="true" />
            <h4 className="text-xs font-bold text-foreground uppercase tracking-widest font-mono">
              {lang === "da" ? "Installation" : "Installation"}
            </h4>
          </div>
          <span className="text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-accent-light text-accent-primary border border-accent-primary/20">
            {lang === "da" ? "Alle AI-agenter" : "All AI Agents"}
          </span>
        </div>

        {installCmd ? (
          <div className="flex items-center justify-between rounded-xl bg-background border border-card-border p-3.5 font-mono text-xs text-accent-primary shadow-inner">
            <span className="break-all pr-3 font-bold">{installCmd}</span>
            <button
              type="button"
              onClick={() => copy(installCmd, "install")}
              aria-label={lang === "da" ? "Kopiér installationskommando" : "Copy install command"}
              className="p-2 rounded-lg bg-background border border-card-border text-text-secondary hover:text-foreground hover:bg-accent-light transition active:scale-95 cursor-pointer shrink-0"
            >
              {copied === "install" ? (
                <CheckCircle className="h-4 w-4 text-accent-primary" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        ) : (
          <p className="text-xs text-text-secondary">
            {lang === "da"
              ? "Ingen direkte installationskommando. Følg kilden for instruktioner."
              : "No direct install command. Follow source for instructions."}
          </p>
        )}

        <p className="text-xs text-text-secondary leading-relaxed">
          {lang === "da"
            ? "Placér instruktionerne i dit projekts agent-kontekst (f.eks. .claude/skills/, .cursor/rules eller system prompt)."
            : "Place instructions in your project's agent context (e.g. .claude/skills/, .cursor/rules or system prompt)."}
        </p>

        {!showAdvanced ? (
          <button
            type="button"
            onClick={() => setShowAdvanced(true)}
            className="text-[11px] text-text-secondary hover:text-accent-primary font-mono transition-colors pt-2 border-t border-card-border/60 w-full text-left cursor-pointer"
          >
            {lang === "da" ? "→ Vis specifikke værktøjs-trin (Claude, Cursor, Gemini)" : "→ Show tool-specific steps (Claude, Cursor, Gemini)"}
          </button>
        ) : (
          <div className="pt-3 border-t border-card-border space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {HOSTS.map((h) => (
                <button
                  key={h.slug}
                  type="button"
                  data-testid={`connect-host-${h.slug}`}
                  onClick={() => setHost(h.slug)}
                  aria-pressed={host === h.slug}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                    host === h.slug
                      ? "bg-accent-primary text-white"
                      : "bg-background border border-card-border text-text-secondary hover:bg-accent-light hover:text-foreground"
                  }`}
                >
                  {h.name}
                </button>
              ))}
            </div>

            <ol className="list-decimal list-inside space-y-1 text-xs text-text-secondary break-words">
              {recipe.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  }

  const heading = lang === "da" ? "Forbind til en host" : "Connect to a host";
  const stepsLabel = lang === "da" ? "Trin" : "Steps";

  return (
    <div
      data-testid="connect-block"
      className="p-6 rounded-2xl glass-panel border border-card-border space-y-5 shadow-xl"
    >
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-accent-primary" aria-hidden="true" />
        <h4 className="text-xs font-bold text-foreground uppercase tracking-widest font-mono">
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
                : "bg-background border border-card-border text-text-secondary hover:bg-accent-light hover:text-foreground"
            }`}
          >
            {h.name}
          </button>
        ))}
      </div>

      {/* Copyable command */}
      {recipe.command && (
        <div className="flex items-center justify-between rounded-xl bg-background border border-card-border p-4 font-mono text-xs text-accent-primary shadow-inner">
          <span className="break-all pr-4 font-bold">{recipe.command}</span>
          <button
            type="button"
            onClick={() => copy(recipe.command!, "command")}
            aria-label={lang === "da" ? "Kopiér kommando" : "Copy command"}
            className="p-2 rounded-lg bg-background border border-card-border text-text-secondary hover:text-foreground hover:bg-accent-light transition active:scale-95 cursor-pointer shrink-0"
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
            className="absolute top-3 right-3 p-2 rounded-lg bg-background border border-card-border text-text-secondary hover:text-foreground hover:bg-accent-light transition active:scale-95 cursor-pointer"
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
        <ol className="list-decimal list-inside space-y-1 text-sm text-text-secondary break-words">
          {recipe.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
