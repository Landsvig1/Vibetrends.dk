/**
 * The machine-readable surface of this site, described for humans.
 *
 * PRODUCT.md names two audiences of equal weight and names connectability as
 * the differentiator. The machine half of that is built and works; the human
 * half was invisible — the site never printed its own endpoint anywhere a
 * person browsing the catalog would see it. These constants are what the
 * agent-facing surfaces (AgentSurfaceStrip, /agent-guide) render.
 *
 * Every string here is a live, verified surface, not a claim:
 *   - each `apiPath` is an existing read route (see src/app/api/*)
 *   - `MCP_ENDPOINT` answers JSON-RPC 2.0 on POST (initialize / tools/list /
 *     tools/call) and returns its tool list on a plain GET
 *   - `MCP_ADD_COMMAND` is the Claude Code CLI's documented HTTP-transport form
 *     (`claude mcp add --transport http <name> <url>`)
 *
 * Deliberately says nothing about write access. The write tools do ship (see
 * docs/decisions/2026-06-19-agent-auth.md and its two amendments), but they
 * need a bearer token from /api/agentauth, and the catalog is curated rather
 * than open-submission. These surfaces describe what an unauthenticated agent
 * can read; /agent-guide is where the write path is documented in full.
 */

/** Canonical public origin. Absolute URLs matter here — the point is that a
 *  human can copy the string straight into their agent's config. */
export const SITE_ORIGIN = "https://vibetrends.dk";

export const MCP_ENDPOINT = `${SITE_ORIGIN}/api/mcp`;

/** One-line recipe that registers this catalog as an MCP server in Claude Code. */
export const MCP_ADD_COMMAND = `claude mcp add --transport http vibetrends ${MCP_ENDPOINT}`;

export type AgentSurfaceHub = "skills" | "vibes" | "cli" | "mcp";

interface HubSurface {
  /** REST route serving the same rows this hub renders. */
  apiPath: string;
}

/**
 * Note the /mcp entry: the hub's REST feed is `/api/mcp-servers` (a catalog of
 * MCP server listings), which is NOT `/api/mcp` (this site's own MCP endpoint).
 * Both strings appear in the same strip on that page, so the labels around them
 * have to carry the distinction — see AgentSurfaceStrip.
 */
const HUB_SURFACES: Record<AgentSurfaceHub, HubSurface> = {
  skills: { apiPath: "/api/skills" },
  vibes: { apiPath: "/api/vibes" },
  cli: { apiPath: "/api/cli" },
  mcp: { apiPath: "/api/mcp-servers" },
};

/** Absolute, copyable read endpoint for a hub, e.g. `https://vibetrends.dk/api/skills`. */
export function hubApiUrl(hub: AgentSurfaceHub): string {
  return `${SITE_ORIGIN}${HUB_SURFACES[hub].apiPath}`;
}

export interface SiteConnectRecipe {
  slug: string;
  hostName: string;
  /** A single copyable shell command, when the host has one. */
  command?: string;
  /** A config snippet to paste, for hosts configured by file. */
  configSnippet?: string;
  /** Where that snippet goes. Present iff configSnippet is. */
  configFile?: string;
  note: string;
}

/**
 * How to point each supported host at this site's own MCP endpoint.
 *
 * Distinct from src/lib/connect.ts, which templates recipes for *catalog
 * items* over their per-row install metadata (a stdio `command`). This is the
 * one fixed HTTP-transport server — the site itself — so there is nothing to
 * template and no ConnectItem to build from.
 *
 * The Claude Code form is verified against the installed CLI's own help output
 * (`claude mcp add --transport http <name> <url>`). The Cursor and Gemini
 * entries use each host's documented HTTP key (`url` / `httpUrl`) in the
 * config files connect.ts already commits to elsewhere in this repo.
 */
export const SITE_CONNECT_RECIPES: readonly SiteConnectRecipe[] = [
  {
    slug: "claude-code",
    hostName: "Claude Code",
    command: MCP_ADD_COMMAND,
    note: "Kør kommandoen i din terminal. Værktøjerne er tilgængelige med det samme.",
  },
  {
    slug: "cursor",
    hostName: "Cursor",
    configFile: "~/.cursor/mcp.json",
    configSnippet: JSON.stringify(
      { mcpServers: { vibetrends: { url: MCP_ENDPOINT } } },
      null,
      2,
    ),
    note: "Tilføj posten under \"mcpServers\" og genstart Cursor.",
  },
  {
    slug: "gemini-cli",
    hostName: "Gemini CLI",
    configFile: "~/.gemini/settings.json",
    configSnippet: JSON.stringify(
      { mcpServers: { vibetrends: { httpUrl: MCP_ENDPOINT } } },
      null,
      2,
    ),
    note: "Tilføj posten under \"mcpServers\" og genstart Gemini CLI.",
  },
] as const;
