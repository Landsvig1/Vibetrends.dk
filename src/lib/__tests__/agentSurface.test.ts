import { describe, it, expect } from "vitest";
import {
  SITE_ORIGIN,
  MCP_ENDPOINT,
  MCP_ADD_COMMAND,
  SITE_CONNECT_RECIPES,
  hubApiUrl,
  type AgentSurfaceHub,
} from "../agentSurface";

/**
 * These strings are rendered for a human to copy into a real config, so the
 * cost of one being subtly wrong is a broken setup with no error message.
 * The assertions below pin the things that would silently rot: relative paths
 * creeping back in, the /api/mcp vs /api/mcp-servers confusion, and the
 * Claude Code flag order.
 */

const HUBS: AgentSurfaceHub[] = ["skills", "vibes", "cli", "mcp"];

describe("agentSurface", () => {
  it("exposes an absolute https origin with no trailing slash", () => {
    expect(SITE_ORIGIN).toBe("https://vibetrends.dk");
    expect(SITE_ORIGIN.endsWith("/")).toBe(false);
  });

  it("builds an absolute read URL for every hub", () => {
    for (const hub of HUBS) {
      const url = hubApiUrl(hub);
      expect(url.startsWith(`${SITE_ORIGIN}/api/`)).toBe(true);
      // A relative path here would be uncopyable — the whole point is that the
      // string works pasted into a terminal with no base URL in scope.
      expect(() => new URL(url)).not.toThrow();
    }
  });

  it("gives every hub a distinct endpoint", () => {
    const urls = HUBS.map(hubApiUrl);
    expect(new Set(urls).size).toBe(HUBS.length);
  });

  it("points /mcp at the catalog feed, not at this site's own MCP endpoint", () => {
    // /api/mcp-servers lists MCP servers; /api/mcp *is* the MCP server. Both
    // strings render in the same strip on that hub, so swapping them would be
    // easy to do and nearly invisible in review.
    expect(hubApiUrl("mcp")).toBe(`${SITE_ORIGIN}/api/mcp-servers`);
    expect(hubApiUrl("mcp")).not.toBe(MCP_ENDPOINT);
  });

  it("uses the Claude Code CLI's http-transport form", () => {
    // Verified against `claude mcp add --help`:
    //   claude mcp add --transport http <name> <url>
    expect(MCP_ADD_COMMAND).toBe(
      `claude mcp add --transport http vibetrends ${MCP_ENDPOINT}`,
    );
    expect(MCP_ENDPOINT).toBe(`${SITE_ORIGIN}/api/mcp`);
  });

  it("gives every host recipe something copyable and a note", () => {
    expect(SITE_CONNECT_RECIPES.length).toBeGreaterThan(0);
    for (const recipe of SITE_CONNECT_RECIPES) {
      expect(recipe.command ?? recipe.configSnippet).toBeTruthy();
      expect(recipe.note.length).toBeGreaterThan(0);
      // configFile and configSnippet are meaningless apart: a snippet with no
      // destination, or a destination with nothing to put in it.
      expect(Boolean(recipe.configFile)).toBe(Boolean(recipe.configSnippet));
    }
  });

  it("points every host config snippet at the MCP endpoint", () => {
    for (const recipe of SITE_CONNECT_RECIPES) {
      if (!recipe.configSnippet) continue;
      const parsed = JSON.parse(recipe.configSnippet) as {
        mcpServers: Record<string, Record<string, string>>;
      };
      const entry = parsed.mcpServers.vibetrends;
      expect(entry).toBeDefined();
      expect(Object.values(entry)).toContain(MCP_ENDPOINT);
    }
  });

  it("has unique host slugs", () => {
    const slugs = SITE_CONNECT_RECIPES.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
