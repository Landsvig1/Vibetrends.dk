import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  getAgentBySlug: vi.fn(),
}));

import { getAgentBySlug } from "@/lib/db";
import { generateMetadata } from "../page";

const getAgentBySlugMock = vi.mocked(getAgentBySlug);
// Mirrors metadataBase in src/app/layout.tsx, which Next resolves the
// root-relative canonical against.
const METADATA_BASE = "https://vibetrends.dk";

function canonicalOf(meta: Awaited<ReturnType<typeof generateMetadata>>): string | undefined {
  const canonical = meta.alternates?.canonical;
  if (!canonical) return undefined;
  return new URL(canonical.toString(), METADATA_BASE).href;
}

describe("/mcp/[slug] generateMetadata", () => {
  it("emits the absolute self URL as canonical, with no trailing slash", async () => {
    getAgentBySlugMock.mockResolvedValue({
      id: "a_1",
      slug: "aula-mcp",
      name: "aula-mcp",
      category: "MCP Server",
      description: "MCP-server til Aula.",
    } as Awaited<ReturnType<typeof getAgentBySlug>>);

    const meta = await generateMetadata({ params: Promise.resolve({ slug: "aula-mcp" }) });

    expect(canonicalOf(meta)).toBe("https://vibetrends.dk/mcp/aula-mcp");
    expect(meta.openGraph?.url).toBe("/mcp/aula-mcp");
  });

  it("emits no canonical for a row that is not an MCP server", async () => {
    getAgentBySlugMock.mockResolvedValue({
      id: "a_2",
      slug: "aula-api-klient",
      name: "aula (API-klient)",
      category: "CLI",
      description: "CLI.",
    } as Awaited<ReturnType<typeof getAgentBySlug>>);

    const meta = await generateMetadata({ params: Promise.resolve({ slug: "aula-api-klient" }) });

    expect(canonicalOf(meta)).toBeUndefined();
  });
});
