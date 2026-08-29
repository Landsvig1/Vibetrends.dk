import { describe, it, expect } from "vitest";
import { buildConnectRecipe } from "@/lib/connect";

describe("buildConnectRecipe", () => {
  it("builds a non-empty skill recipe for Claude Code (AE3)", () => {
    const r = buildConnectRecipe(
      "skills",
      { name: "Prompt Linter", githubUrl: "https://github.com/x/prompt-linter" },
      "claude-code",
    );
    expect(r.host).toBe("claude-code");
    expect(r.steps.length).toBeGreaterThan(0);
    expect(r.command).toContain("git clone https://github.com/x/prompt-linter");
  });

  it("diverges by host for an MCP server: command for Claude Code, config for Cursor", () => {
    const item = { name: "Postgres MCP", installCommand: "npx -y @mcp/postgres" };
    const claude = buildConnectRecipe("mcp-servers", item, "claude-code");
    expect(claude.command).toBe("claude mcp add postgres-mcp -- npx -y @mcp/postgres");
    expect(claude.configSnippet).toBeUndefined();

    const cursor = buildConnectRecipe("mcp-servers", item, "cursor");
    expect(cursor.configSnippet).toBeTruthy();
    expect(cursor.configSnippet).toContain("mcpServers");
    expect(cursor.configSnippet).toContain("npx -y @mcp/postgres");
    expect(cursor.command).toBeUndefined();
  });

  it("handles HTTP MCP servers: claude command with --transport http, type/url in JSON config for Cursor/Gemini", () => {
    const item = { name: "Dinero MCP", installCommand: "https://mcp.dinero.dk" };
    const claude = buildConnectRecipe("mcp-servers", item, "claude-code");
    expect(claude.command).toBe("claude mcp add --transport http dinero-mcp https://mcp.dinero.dk");

    const cursor = buildConnectRecipe("mcp-servers", item, "cursor");
    expect(cursor.configSnippet).toContain('"type": "http"');
    expect(cursor.configSnippet).toContain('"url": "https://mcp.dinero.dk"');

    const gemini = buildConnectRecipe("mcp-servers", item, "gemini-cli");
    expect(gemini.configSnippet).toContain('"type": "http"');
    expect(gemini.configSnippet).toContain('"url": "https://mcp.dinero.dk"');
  });

  it("avoids double-wrapping claude mcp add commands with transport or stdio", () => {
    const httpItem = {
      name: "Dinero MCP",
      installCommand: "claude mcp add --transport http dinero https://mcp.dinero.dk",
    };
    const claudeHttp = buildConnectRecipe("mcp-servers", httpItem, "claude-code");
    expect(claudeHttp.command).toBe("claude mcp add --transport http dinero https://mcp.dinero.dk");

    const cursorHttp = buildConnectRecipe("mcp-servers", httpItem, "cursor");
    expect(cursorHttp.configSnippet).toContain('"type": "http"');
    expect(cursorHttp.configSnippet).toContain('"url": "https://mcp.dinero.dk"');

    const stdioItem = {
      name: "Nordic Registry MCP",
      installCommand: "claude mcp add nordic-registry ./nordic-registry-mcp-server",
    };
    const claudeStdio = buildConnectRecipe("mcp-servers", stdioItem, "claude-code");
    expect(claudeStdio.command).toBe("claude mcp add nordic-registry -- ./nordic-registry-mcp-server");

    const cursorStdio = buildConnectRecipe("mcp-servers", stdioItem, "cursor");
    expect(cursorStdio.configSnippet).toContain('"command": "./nordic-registry-mcp-server"');
  });

  it("wraps a CLI's install command for the chosen host", () => {
    const r = buildConnectRecipe(
      "cli",
      { name: "Scrapey", installCommand: "npm i -g scrapey" },
      "gemini-cli",
    );
    expect(r.command).toBe("npm i -g scrapey");
    expect(r.steps.join(" ")).toContain("Gemini CLI");
  });

  it("falls back to manual steps when an item has no install metadata", () => {
    const r = buildConnectRecipe("skills", { name: "Mystery Skill" }, "claude-code");
    expect(r.command).toBeUndefined();
    expect(r.configSnippet).toBeUndefined();
    expect(r.steps.length).toBeGreaterThan(0);
    expect(r.steps.join(" ")).toContain("Mystery Skill");
  });

  it("uses the source URL as a fallback reference when no github URL exists", () => {
    const r = buildConnectRecipe(
      "skills",
      { name: "Sourced Skill", source: "https://skills.sh/x" },
      "cursor",
    );
    expect(r.steps.join(" ")).toContain("https://skills.sh/x");
  });

  it("only emits a git clone command for a trusted https github.com URL — on every host", () => {
    for (const host of ["claude-code", "cursor", "gemini-cli"] as const) {
      const gh = buildConnectRecipe("skills", { name: "GH Skill", githubUrl: "https://github.com/x/y" }, host);
      expect(gh.command).toBe("git clone https://github.com/x/y");

      // A well-formed but non-github URL must NOT become a copyable clone
      // command for ANY host (the guard is uniform, not claude-code-only).
      const evil = buildConnectRecipe(
        "skills",
        { name: "Evil Skill", githubUrl: "https://evil.example.com/x/y" },
        host,
      );
      expect(evil.command).toBeUndefined();
      expect(evil.steps.length).toBeGreaterThan(0); // still gives manual steps
    }
  });

  it("localizes recipe steps: da by default, en when requested", () => {
    const da = buildConnectRecipe("cli", { name: "Scrapey", installCommand: "npm i -g scrapey" }, "claude-code");
    expect(da.steps.join(" ")).toContain("Kør installationskommandoen");
    const en = buildConnectRecipe(
      "cli",
      { name: "Scrapey", installCommand: "npm i -g scrapey" },
      "claude-code",
      "en",
    );
    expect(en.steps.join(" ")).toContain("Run the install command");
  });

  it("handles an unknown host without throwing", () => {
    expect(() =>
      buildConnectRecipe("cli", { name: "X", installCommand: "x" }, "emacs"),
    ).not.toThrow();
    const r = buildConnectRecipe("cli", { name: "X", installCommand: "x" }, "emacs", "en");
    expect(r.steps.length).toBeGreaterThan(0);
    expect(r.steps.join(" ")).toContain("not a supported host");
  });
});
