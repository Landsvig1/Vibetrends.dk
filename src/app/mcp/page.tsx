import { Suspense } from "react";
import AgentsExplorer from "../components/AgentsExplorer";

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
