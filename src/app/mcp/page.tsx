import type { Metadata } from "next";
import { Suspense } from "react";
import AgentsExplorer from "../components/AgentsExplorer";
import { entityMetadata } from "@/lib/seo";

export const metadata: Metadata = entityMetadata({
  title: "MCP Servere",
  description: "Find Model Context Protocol (MCP) servere til Claude, Cursor og andre AI-agenter. Gratis og open source.",
  path: "/mcp",
});

export default function McpPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-text-secondary font-semibold">Indlæser…</div>
      </div>
    }>
      <AgentsExplorer scope="mcp" />
    </Suspense>
  );
}
