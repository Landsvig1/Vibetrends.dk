import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Language } from "@/lib/translations";
import { getAgents } from "@/lib/db";
import AgentsLoading from "./loading";
import AgentsExplorer from "../components/AgentsExplorer";
import { entityMetadata } from "@/lib/seo";

export const metadata: Metadata = entityMetadata({
  title: "Agent & MCP Registry",
  description: "Find færdigbyggede systemprompts, custom GPT configs og MCP servere. Kobl dem direkte til dine AI-agenter.",
  path: "/agents",
  image: "/images/og-default.jpg",
});

/**
 * Outer server component — wraps the data-fetch layer in a Suspense boundary
 * so loading.tsx is streamed as the fallback on a cache-miss rather than
 * blocking or showing nothing.
 */
export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <Suspense fallback={<AgentsLoading />}>
      <AgentsPageContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Inner async server component — separated from the outer route shell so that
 * cookies() (a dynamic API) is called inside its own Suspense boundary, not
 * inside a cached parent component. Follows the KTD4 pattern established by
 * every detail page in this codebase (agents/[id], vibes/[id], etc.).
 *
 * Reads lang from cookie, calls the cached getAgents() (default catalog —
 * excludes MCP Server and Host categories per db.ts query logic), then passes
 * the result as initialItems to AgentsExplorer so the agents hub renders real
 * content on first paint instead of a skeleton-then-fetch.
 *
 * When ?q= is present (human search box or ?format=json agent call), passes it
 * to getAgents() so the server-rendered initial list and any SSR content reflect
 * the filtered result — closing the crawlability gap for agent-discovery callers.
 *
 * The view tabs (danish/all/hot) within /agents are purely client-side
 * filter/sort operations on the initialItems list — they do not require
 * category-scoped re-fetches since the default catalog already includes all
 * non-MCP agent categories.
 *
 * Exported for unit testing.
 */
export async function AgentsPageContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const resolvedParams = await searchParams;
  const search = resolvedParams?.q || undefined;

  // Cached read — getAgents() is wrapped with "use cache" + cacheTag in db.ts
  // (U1/U2). No category arg → default catalog (excludes MCP Server + Host).
  const items = await getAgents(search, undefined, lang);

  return <AgentsExplorer scope="agents" initialItems={items} />;
}
