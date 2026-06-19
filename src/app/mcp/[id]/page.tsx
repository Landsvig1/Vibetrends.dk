import { getAgentById } from "@/lib/db";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Language } from "@/lib/translations";
import { Suspense } from "react";
import AgentDetailView from "../../components/AgentDetailView";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const agent = await getAgentById(id, lang);
  if (!agent) return { title: "MCP-server ikke fundet" };

  return {
    title: `${agent.name} - MCP Server Registry`,
    description: agent.description,
  };
}

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [
    {
      cookies: [{ name: "vibe_lang", value: "da" }],
      params: { id: "a1" }
    }
  ]
};

export default async function McpDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
      <McpDetailContent params={params} />
    </Suspense>
  );
}

async function McpDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const agent = await getAgentById(id, lang);
  if (!agent) {
    notFound();
  }

  return <AgentDetailView agent={agent} lang={lang} backHref="/mcp" />;
}
