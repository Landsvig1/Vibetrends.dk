import type { Metadata } from "next";
import { Suspense } from "react";
import { getCli } from "@/lib/db";
import CliLoading from "./loading";
import AgentsExplorer from "../components/AgentsExplorer";
import AgentSurfaceStrip from "../components/AgentSurfaceStrip";
import { entityMetadata } from "@/lib/seo";

export const metadata: Metadata = entityMetadata({
  title: "CLI-værktøjer",
  description: "CLI-tools din agent kan kalde direkte. Kuraterede og testede.",
  path: "/cli",
});

/**
 * Outer server component — wraps the data-fetch layer in a Suspense boundary
 * so loading.tsx is streamed as the fallback on a cache-miss rather than
 * blocking or showing nothing.
 */
export default async function CliPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return (
    <Suspense fallback={<CliLoading />}>
      <CliPageContent searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Inner async server component — separated from the outer route shell so that
 * cookies() (a dynamic API) is called inside its own Suspense boundary, not
 * inside a cached parent component. Follows the KTD4 pattern established by
 * every detail page in this codebase (agents/[id], vibes/[id], etc.).
 *
 * Reads lang from cookie, calls the cached getCli(), then passes the result as
 * initialItems to AgentsExplorer so the CLI hub renders real content on first
 * paint instead of a skeleton-then-fetch.
 *
 * When ?q= is present (human search box or ?format=json agent call), passes it
 * to getCli() so the server-rendered initial list reflects the filtered result.
 *
 * Exported for unit testing.
 */
export async function CliPageContent({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const resolvedParams = await searchParams;
  const search = resolvedParams?.q || undefined;

  // Cached read — getCli() is wrapped with "use cache" + cacheTag in db.ts
  // (U1/U2). On cache-hit this is free; on cache-miss it queries Supabase and
  // stores the result. The Suspense fallback (loading.tsx) covers the miss.
  const items = await getCli(search, 'da');

  return (
    <div className="space-y-12 sm:space-y-14">
      <AgentsExplorer scope="cli" initialItems={items} />
      <AgentSurfaceStrip hub="cli" />
    </div>
  );
}
