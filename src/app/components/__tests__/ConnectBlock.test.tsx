import { describe, it, expect, vi, beforeEach } from "vitest";
import { trackConnectCopy } from "../ConnectBlock";

// Mock @vercel/analytics track
vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

import { track } from "@vercel/analytics";

const trackMock = vi.mocked(track);

describe("ConnectBlock — adoption event tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fires adoption event for skill install snippet with universal host", () => {
    trackConnectCopy(
      {
        slug: "claude-code-helper",
        name: "Claude Code Helper",
        githubUrl: "https://github.com/anthropics/helper",
      },
      "skills",
      "install",
      "universal",
    );

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith("copy_install", {
      item_slug: "claude-code-helper",
      item_type: "skill",
      host_slug: "universal",
      snippet: "install",
    });
  });

  it("derives fallback slug via slugify when item.slug is omitted", () => {
    trackConnectCopy(
      {
        name: "My Awesome Tool",
        installCommand: "npm i -g awesome-tool",
      },
      "skills",
      "install",
    );

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith("copy_install", {
      item_slug: "my-awesome-tool",
      item_type: "skill",
      host_slug: "universal",
      snippet: "install",
    });
  });

  it("tracks host command copy for MCP server on claude-code", () => {
    trackConnectCopy(
      {
        slug: "postgres-mcp",
        name: "Postgres MCP",
        installCommand: "npx -y @mcp/postgres",
      },
      "mcp-servers",
      "command",
      "claude-code",
    );

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith("copy_install", {
      item_slug: "postgres-mcp",
      item_type: "mcp",
      host_slug: "claude-code",
      snippet: "command",
    });
  });

  it("tracks host config snippet copy for MCP server on cursor", () => {
    trackConnectCopy(
      {
        slug: "postgres-mcp",
        name: "Postgres MCP",
        installCommand: "npx -y @mcp/postgres",
      },
      "mcp-servers",
      "config",
      "cursor",
    );

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith("copy_install", {
      item_slug: "postgres-mcp",
      item_type: "mcp",
      host_slug: "cursor",
      snippet: "config",
    });
  });

  it("tracks CLI tool copy command on gemini-cli", () => {
    trackConnectCopy(
      {
        slug: "vibe-cli",
        name: "Vibe CLI",
        installCommand: "cargo install vibe-cli",
      },
      "cli",
      "command",
      "gemini-cli",
    );

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith("copy_install", {
      item_slug: "vibe-cli",
      item_type: "cli",
      host_slug: "gemini-cli",
      snippet: "command",
    });
  });

  it("does not throw or fail when track() throws an error", () => {
    trackMock.mockImplementationOnce(() => {
      throw new Error("Vercel analytics offline");
    });

    expect(() => {
      trackConnectCopy(
        {
          slug: "resilient-skill",
          name: "Resilient Skill",
        },
        "skills",
        "install",
      );
    }).not.toThrow();
  });
});
