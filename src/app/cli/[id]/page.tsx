import { getAgentById } from "@/lib/db";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Language } from "@/lib/translations";
import { entityMetadata } from "@/lib/seo";
import { jsonLdScript, softwareAppJsonLd, breadcrumbJsonLd } from "@/lib/jsonLd";
import { Suspense } from "react";
import AgentDetailView from "../../components/AgentDetailView";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const agent = await getAgentById(id, lang);
  if (!agent || agent.category !== "CLI") return { title: "CLI ikke fundet" };

  return entityMetadata({
    title: `${agent.name} - CLIs`,
    description: agent.description,
    path: `/cli/${id}`,
    lang,
  });
}

export default async function CliDetailPage({ params }: { params: Promise<{ id: string }> }) {
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

async function CliDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const agent = await getAgentById(id, lang);
  // Only CLIs belong here; MCP servers live at /mcp/[id] and hosts are
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
              url: `https://vibetrends.dk/cli/${id}`,
            })
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: "CLI Tools", url: "https://vibetrends.dk/cli" },
              { name: agent.name, url: `https://vibetrends.dk/cli/${id}` },
            ])
          ),
        }}
      />
      <AgentDetailView agent={agent} lang={lang} backHref="/cli" />
    </>
  );
}
