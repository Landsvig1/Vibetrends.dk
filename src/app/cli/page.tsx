import type { Metadata } from "next";
import { Suspense } from "react";
import AgentsExplorer from "../components/AgentsExplorer";
import { entityMetadata } from "@/lib/seo";

export const metadata: Metadata = entityMetadata({
  title: "CLI Tools",
  description: "Find CLI-tools og kommandolinje-hjælpere til dine AI-workflows og agent-opsætninger.",
  path: "/cli",
});

export default function CliPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-text-secondary font-semibold">Indlæser…</div>
      </div>
    }>
      <AgentsExplorer scope="cli" />
    </Suspense>
  );
}
