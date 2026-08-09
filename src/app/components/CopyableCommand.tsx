"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

/**
 * A labelled, copyable machine string: overline label, paper-filled mono block,
 * copy button. Shared by AgentSurfaceStrip and SiteConnectBlock so the two
 * agent-facing surfaces can't drift apart the way the catalog card shells did
 * before ListCard (see ListCard.tsx's header comment).
 *
 * Flat by default — hairline border, no shadow. The 44px copy button is
 * deliberate: the existing icon-only copy controls on /cli and /mcp cards are
 * 28px, below the touch-target floor, and that is not a size to reproduce.
 */
export default function CopyableCommand({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  /** Renders the value as a pre block (config snippets) rather than one line. */
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can reject (permissions, insecure context). The value is
      // select-all-able either way, so failing silently still leaves a working
      // path — throwing here would not.
    }
  };

  return (
    <div className="space-y-1.5">
      <span className="block text-[10px] font-bold text-text-secondary uppercase tracking-[0.2em]">
        {label}
      </span>
      <div className="flex items-start gap-2">
        {multiline ? (
          <pre className="flex-1 min-w-0 rounded-lg bg-background border border-card-border px-3 py-3 font-mono text-xs text-accent-primary select-all overflow-x-auto">
            {value}
          </pre>
        ) : (
          <code className="flex-1 min-w-0 rounded-lg bg-background border border-card-border px-3 py-3 font-mono text-xs text-accent-primary select-all overflow-x-auto whitespace-nowrap">
            {value}
          </code>
        )}
        <button
          type="button"
          onClick={copy}
          aria-label={`Kopiér: ${label}`}
          className="shrink-0 h-11 w-11 flex items-center justify-center rounded-lg bg-background border border-card-border text-text-secondary hover:text-accent-primary hover:border-accent-primary transition-colors cursor-pointer"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-accent-primary" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Kopieret" : ""}
      </span>
    </div>
  );
}
