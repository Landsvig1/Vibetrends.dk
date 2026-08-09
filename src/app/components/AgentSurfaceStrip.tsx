"use client";

import Link from "next/link";
import { Terminal } from "lucide-react";
import CopyableCommand from "./CopyableCommand";
import { hubApiUrl, MCP_ADD_COMMAND, type AgentSurfaceHub } from "@/lib/agentSurface";

/**
 * The site's own connectability, made visible on the pages people actually
 * browse. Rendered at the foot of /skills, /vibes, /cli and /mcp.
 *
 * Why per-hub rather than one page: /agent-guide already existed and said all
 * of this, but a visitor landing on a hub from search never saw it. Each strip
 * prints *that hub's* real read endpoint, so the instance carries information
 * rather than repeating a slogan.
 *
 * Deliberately flat — hairline border, no shadow — per DESIGN.md's
 * Flat-By-Default rule. ConnectBlock's shadow-xl/shadow-inner stack is an
 * existing violation, not a pattern to copy.
 */
export default function AgentSurfaceStrip({ hub }: { hub: AgentSurfaceHub }) {
  return (
    <section
      data-testid="agent-surface-strip"
      aria-labelledby="agent-surface-heading"
      className="rounded-xl glass-card p-6 space-y-5"
    >
      <div className="space-y-2">
        {/* items-start, not items-center: the heading wraps to two lines at
            390px, and centering leaves the icon floating against the gap
            between them. mt-1 puts it on the first line's baseline instead. */}
        <h2
          id="agent-surface-heading"
          className="text-lg font-bold text-foreground flex items-start gap-2"
        >
          <Terminal
            className="h-4 w-4 mt-1 shrink-0 text-accent-primary"
            aria-hidden="true"
          />
          Din agent kan læse det her katalog
        </h2>
        <p className="text-sm text-text-secondary max-w-2xl">
          Alt på siden her ligger også som JSON, uden login og uden nøgle. Hele
          kataloget kan kobles på din coding agent som MCP-server.
        </p>
      </div>

      <div className="space-y-4">
        <CopyableCommand label="Samme data som JSON" value={`GET ${hubApiUrl(hub)}`} />
        {/* Labelled distinctly from the row above on purpose: on /mcp the two
            strings are /api/mcp-servers and /api/mcp, which read as a typo of
            each other without the surrounding copy to separate them. */}
        <CopyableCommand label="Kobl hele kataloget på Claude Code" value={MCP_ADD_COMMAND} />
      </div>

      {/* Plain inline, not inline-flex: when the label wraps at 390px a flex
          container pushes the arrow to the far edge of the line box, leaving it
          stranded away from the text it belongs to. */}
      <Link
        href="/agent-guide"
        className="block text-sm font-medium text-accent-primary hover:opacity-80 transition-opacity"
      >
        Cursor, Gemini CLI og resten af API&apos;et i Agent Guide{" "}
        <span aria-hidden="true">&rarr;</span>
      </Link>
    </section>
  );
}
