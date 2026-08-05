import { getAgentBySlug } from "@/lib/db";
import { notFound } from "next/navigation";
import { entityMetadata } from "@/lib/seo";
import { jsonLdScript, softwareAppJsonLd, breadcrumbJsonLd } from "@/lib/jsonLd";
import { Suspense } from "react";
import AgentDetailView from "../../components/AgentDetailView";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const agent = await getAgentBySlug(slug, 'da');
  if (!agent || agent.category !== "CLI") return { title: "CLI ikke fundet" };

  return entityMetadata({
    title: agent.name,
    suffix: " - CLIs",
    description: agent.description,
    path: `/cli/${slug}`,
    lang: 'da',
  });
}

export default async function CliDetailPage({ params }: { params: Promise<{ slug: string }> }) {
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
      <CliDetailContent params={params} />
    </Suspense>
  );
}

async function CliDetailContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const agent = await getAgentBySlug(slug, 'da');
  // Only CLIs belong here; MCP servers live at /mcp/[slug] and hosts are
  // never shown as catalog items.
  if (!agent || agent.category !== "CLI") {
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
              url: `https://vibetrends.dk/cli/${slug}`,
            })
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: "CLI-værktøjer", url: "https://vibetrends.dk/cli" },
              { name: agent.name, url: `https://vibetrends.dk/cli/${slug}` },
            ])
          ),
        }}
      />
      <AgentDetailView agent={agent} backHref="/cli" />
    </>
  );
}
