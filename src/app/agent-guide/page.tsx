import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Bot, Settings, Search, MessageSquare, FileJson } from "lucide-react";
import { Language } from "@/lib/translations";

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";
  return {
    title: lang === "da" ? "Agent Guide" : "Agent Guide",
    description:
      lang === "da"
        ? "Sådan tilgår AI-agenter vibetrends.dk programmatisk via MCP og JSON-API'er."
        : "How AI agents access vibetrends.dk programmatically via MCP and JSON APIs.",
  };
}

export default async function AgentGuidePage() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  if (lang === "en") {
    return (
      <div className="max-w-3xl mx-auto space-y-12 py-8">
        <div className="space-y-4">
          <div className="pill-badge">
            <Bot className="h-3.5 w-3.5 text-accent-primary" />
            <span>Agent-native platform</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Agent Guide
          </h1>
          <p className="text-text-secondary text-lg max-w-2xl">
            vibetrends.dk is built to be read by both humans and AI agents.
            Every hub — Vibes, Skills, MCP, CLI, and the Forum — is backed by
            a real JSON API, and the whole catalog is also reachable through a
            single MCP server. Everything below is read-only today.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Settings className="h-5 w-5 text-accent-primary" />
            MCP server
          </h2>
          <div className="text-text-secondary leading-relaxed space-y-3">
            <p>
              A single JSON-RPC 2.0 endpoint at <code className="text-accent-primary">/api/mcp</code> exposes
              search tools across skills, vibes, CLI tools, MCP servers, and the forum. Send
              <code className="text-accent-primary"> initialize</code>, <code className="text-accent-primary">tools/list</code>, or
              <code className="text-accent-primary"> tools/call</code> via POST — a plain GET to the same URL returns the tool
              list for humans/debugging.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileJson className="h-5 w-5 text-accent-primary" />
            JSON APIs
          </h2>
          <div className="text-text-secondary leading-relaxed space-y-3">
            <p>Every hub has a matching JSON route, no auth required for reads:</p>
            <ul className="space-y-1.5 font-mono text-sm">
              <li>GET /api/skills</li>
              <li>GET /api/vibes</li>
              <li>GET /api/cli</li>
              <li>GET /api/mcp-servers</li>
              <li>GET /api/forum — supports <code>?search=</code>, <code>?category=</code>, <code>?sort=</code></li>
            </ul>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Search className="h-5 w-5 text-accent-primary" />
            Discovery files
          </h2>
          <div className="text-text-secondary leading-relaxed space-y-3">
            <p>Standardized files for agent-to-site negotiation:</p>
            <ul className="list-disc list-inside space-y-1.5 text-accent-primary font-medium">
              <li><a href="/ai.txt" className="hover:underline">/ai.txt</a> — human-readable agent instructions</li>
              <li><a href="/ara.json" className="hover:underline">/ara.json</a> — capability map</li>
              <li><a href="/llm-ld.json" className="hover:underline">/llm-ld.json</a> — linked data for LLMs</li>
              <li><a href="/capability.json" className="hover:underline">/capability.json</a> — capability card</li>
            </ul>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-accent-primary" />
            Write access
          </h2>
          <p className="text-text-secondary leading-relaxed">
            Contributing (submitting a project, sharing a skill, posting in the forum,
            upvoting) currently requires a human session — there is no agent write API yet.
            Point a human at <Link href="/vibes" className="text-accent-primary hover:underline">the site</Link> to
            contribute on your behalf in the meantime.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-12 py-8">
      <div className="space-y-4">
        <div className="pill-badge">
          <Bot className="h-3.5 w-3.5 text-accent-primary" />
          <span>Agent-native platform</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
          Agent Guide
        </h1>
        <p className="text-text-secondary text-lg max-w-2xl">
          vibetrends.dk er bygget til at kunne læses af både mennesker og AI-agenter.
          Alle hubs — Vibes, Skills, MCP, CLI og Forum — har en rigtig JSON-API, og hele
          kataloget kan også tilgås gennem én samlet MCP-server. Alt nedenfor er read-only i dag.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Settings className="h-5 w-5 text-accent-primary" />
          MCP-server
        </h2>
        <div className="text-text-secondary leading-relaxed space-y-3">
          <p>
            Ét JSON-RPC 2.0-endpoint på <code className="text-accent-primary">/api/mcp</code> stiller
            søgeværktøjer til rådighed på tværs af skills, vibes, CLI-værktøjer, MCP-servere og
            forummet. Send <code className="text-accent-primary">initialize</code>, <code className="text-accent-primary">tools/list</code> eller
            <code className="text-accent-primary"> tools/call</code> via POST — et almindeligt GET på samme URL returnerer
            værktøjslisten til mennesker/debugging.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <FileJson className="h-5 w-5 text-accent-primary" />
          JSON-API&apos;er
        </h2>
        <div className="text-text-secondary leading-relaxed space-y-3">
          <p>Hver hub har en tilsvarende JSON-rute, ingen auth krævet til læsning:</p>
          <ul className="space-y-1.5 font-mono text-sm">
            <li>GET /api/skills</li>
            <li>GET /api/vibes</li>
            <li>GET /api/cli</li>
            <li>GET /api/mcp-servers</li>
            <li>GET /api/forum — understøtter <code>?search=</code>, <code>?category=</code>, <code>?sort=</code></li>
          </ul>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Search className="h-5 w-5 text-accent-primary" />
          Discovery-filer
        </h2>
        <div className="text-text-secondary leading-relaxed space-y-3">
          <p>Standardiserede filer til agent-til-site-forhandling:</p>
          <ul className="list-disc list-inside space-y-1.5 text-accent-primary font-medium">
            <li><a href="/ai.txt" className="hover:underline">/ai.txt</a> — menneskelæsbare agent-instruktioner</li>
            <li><a href="/ara.json" className="hover:underline">/ara.json</a> — kapabilitetskort</li>
            <li><a href="/llm-ld.json" className="hover:underline">/llm-ld.json</a> — linked data til LLM&apos;er</li>
            <li><a href="/capability.json" className="hover:underline">/capability.json</a> — kapabilitetskort</li>
          </ul>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-accent-primary" />
          Skriveadgang
        </h2>
        <p className="text-text-secondary leading-relaxed">
          At bidrage (indsende et projekt, dele en skill, skrive i forummet, upvote) kræver i dag
          en menneskelig session — der findes endnu ikke en skrive-API til agenter. Send et
          menneske til <Link href="/vibes" className="text-accent-primary hover:underline">sitet</Link> for
          at bidrage på dine vegne i mellemtiden.
        </p>
      </section>
    </div>
  );
}
