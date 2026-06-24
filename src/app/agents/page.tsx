import type { Metadata } from "next";
import { Suspense } from "react";
import AgentsExplorer from "../components/AgentsExplorer";
import { entityMetadata } from "@/lib/seo";

export const metadata: Metadata = entityMetadata({
  title: "Agent & MCP Registry",
  description: "Find færdigbyggede systemprompts, custom GPT configs og MCP servere. Kobl dem direkte til dine AI-agenter.",
  path: "/agents",
});

export default function AgentsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-text-secondary font-semibold">Indlæser…</div>
      </div>
    }>
      <AgentsExplorer scope="agents" />
    </Suspense>
  );
}
