import { getAgentById } from "@/lib/db";
import { notFound } from "next/navigation";
import { entityMetadata, truncateTitle } from "@/lib/seo";
import { jsonLdScript, softwareAppJsonLd, breadcrumbJsonLd } from "@/lib/jsonLd";
import { Suspense } from "react";
import AgentDetailView from "../../components/AgentDetailView";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const agent = await getAgentById(id, 'da');
  // MCP servers live at /mcp/[id]; hosts are connection targets, not catalog
  // items, so they 404 on this demoted surface.
  if (!agent || agent.category === "MCP Server" || agent.category === "Host") return { title: "Agent ikke fundet" };

  return entityMetadata({
    title: `${truncateTitle(agent.name, " - AI Agent Registry".length)} - AI Agent Registry`,
    description: agent.description,
    path: `/agents/${id}`,
    lang: 'da',
  });
}

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [
    {
      params: { id: "a2" }
    }
  ]
};

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={
      <div className="space-y-10 animate-pulse">
        <div className="h-6 bg-card-border/50 rounded w-24"></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-8">
            <div className="rounded-2xl glass-panel border border-card-border bg-card-border/10 h-80"></div>
          </div>
          <div className="h-60 rounded-2xl glass-card border border-card-border bg-card-border/10"></div>
        </div>
      </div>
    }>
      <AgentDetailContent params={params} />
    </Suspense>
  );
}

async function AgentDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const agent = await getAgentById(id, 'da');
  // MCP servers live at /mcp/[id]; hosts are connection targets and are never
  // shown as catalog items. Keep the routes strictly scoped.
  if (!agent || agent.category === "MCP Server" || agent.category === "Host") {
    notFound();
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            softwareAppJsonLd({
              name: agent.name,
              description: agent.description,
              developer: agent.developer,
              url: `https://vibetrends.dk/agents/${id}`,
            })
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: "Agents", url: "https://vibetrends.dk/agents" },
              { name: agent.name, url: `https://vibetrends.dk/agents/${id}` },
            ])
          ),
        }}
      />
      <AgentDetailView agent={agent} backHref="/agents" />
    </>
  );
}
