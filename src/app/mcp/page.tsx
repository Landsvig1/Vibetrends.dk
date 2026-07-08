import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Language } from "@/lib/translations";
import { getAgents } from "@/lib/db";
import AgentsExplorer from "../components/AgentsExplorer";
import { entityMetadata } from "@/lib/seo";

export const metadata: Metadata = entityMetadata({
  title: "MCP Servere",
  description: "Find Model Context Protocol (MCP) servere til Claude, Cursor og andre AI-agenter. Gratis og open source.",
  path: "/mcp",
});

/**
 * Outer server component — wraps the data-fetch layer in a Suspense boundary
 * so the inline fallback is streamed on a cache-miss rather than blocking or
 * showing nothing. /mcp has no dedicated loading.tsx so an inline fallback is
 * used instead.
 */
export default async function McpPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-text-secondary font-semibold">Indlæser…</div>
      </div>
    }>
      <McpPageContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Inner async server component — separated from the outer route shell so that
 * cookies() (a dynamic API) is called inside its own Suspense boundary, not
 * inside a cached parent component. Follows the KTD4 pattern established by
 * every detail page in this codebase (agents/[id], mcp/[id], etc.).
 *
 * Reads lang from cookie, calls the cached getAgents() scoped to 'MCP Server',
 * then passes the result as initialItems to AgentsExplorer so the MCP hub
 * renders real content on first paint instead of a skeleton-then-fetch.
 *
 * When ?q= is present (human search box or ?format=json agent call), passes it
 * to getAgents() so the server-rendered initial list reflects the filtered result.
 *
 * Exported for unit testing.
 */
export async function McpPageContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const resolvedParams = await searchParams;
  const search = resolvedParams?.q || undefined;

  // Cached read — getAgents() is wrapped with "use cache" + cacheTag in db.ts
  // (U1/U2). Scoped to 'MCP Server' category matching the AgentsExplorer scope.
  const items = await getAgents(search, "MCP Server", lang);

  return <AgentsExplorer scope="mcp" initialItems={items} />;
}
