import Link from "next/link";
import { ArrowLeft, Heart, Cpu, Terminal, User, Sparkles, Code, Globe, ShieldCheck } from "lucide-react";
import { Agent } from "@/lib/db";
import { translations, Language } from "@/lib/translations";
import AgentActionSection from "./AgentActionSection";
import { jsonLdScript } from "@/lib/jsonLd";

// Shared detail view for an Agent or an MCP server (same `agents` table shape).
// `backHref` controls where the back link returns (/agents or /mcp).
export default function AgentDetailView({
  agent,
  lang,
  backHref,
}: {
  agent: Agent;
  lang: Language;
  backHref: string;
}) {
  const tDict = translations[lang] || translations.da;
  const t = (key: keyof typeof translations.da) => tDict[key] || translations.da[key];

  const categoryIcons = {
    "DevTools": <Terminal className="h-5 w-5" />,
    "Writing": <Code className="h-5 w-5" />,
    "Browsing": <Globe className="h-5 w-5" />,
    "MCP Server": <Cpu className="h-5 w-5" />
  };

  return (
    <div className="space-y-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": agent.name,
            "description": agent.description,
            "applicationCategory": "DeveloperApplication",
            "author": {
              "@type": "Person",
              "name": agent.developer
            }
          })
        }}
      />
      <Link
        href={backHref}
        className="flex items-center text-text-secondary hover:text-foreground text-sm font-semibold transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        {t("agents.detail.back")}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left: Agent Info & System Prompt */}
        <div className="lg:col-span-2 space-y-8">
          <div className="p-8 rounded-2xl glass-panel border border-card-border space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
               <Cpu className="h-32 w-32" />
            </div>

            <div className="flex justify-between items-start gap-4 relative z-10">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                   <div className="p-2.5 rounded-xl bg-violet-600/20 border border-accent-primary/20 text-accent-primary">
                     {categoryIcons[agent.category as keyof typeof categoryIcons] || <Cpu className="h-5 w-5" />}
                   </div>
                   <span className="text-xs font-bold text-accent-primary uppercase tracking-widest">{agent.category}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground leading-tight">
                  {agent.name}
                </h1>
              </div>
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-accent-primary">
                <Heart className="h-4 w-4 fill-current" />
                <span className="font-mono font-bold">{agent.upvotes}</span>
              </div>
            </div>

            <p className="text-text-secondary text-lg leading-relaxed relative z-10">
              {agent.description}
            </p>

            <div className="flex flex-wrap gap-2 relative z-10">
               {agent.tags.map(tag => (
                 <span key={tag} className="px-3 py-1 rounded-full bg-background border border-card-border text-text-secondary text-xs font-mono">
                   #{tag}
                 </span>
               ))}
            </div>

            <div className="flex items-center space-x-4 pt-6 border-t border-card-border text-xs text-text-secondary relative z-10">
               <div className="flex items-center space-x-2">
                 <User className="h-4 w-4" />
                 <span>{lang === "da" ? "Udgivet af" : "Published by"} <span className="text-text-secondary font-bold">@{agent.developer}</span></span>
               </div>
               <span className="text-text-secondary">&middot;</span>
               <div className="flex items-center space-x-2">
                 <ShieldCheck className="h-4 w-4 text-accent-primary" />
                 <span className="text-accent-primary/80">
                   {lang === "da" ? "Verificeret Vibe Tool" : "Verified Vibe Tool"}
                 </span>
               </div>
            </div>
          </div>

          {/* System Prompt Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
               <h3 className="text-lg font-bold text-foreground flex items-center">
                 <Terminal className="h-5 w-5 mr-2 text-accent-primary" />
                 {t("agents.detail.prompt")}
               </h3>
               <span className="text-[10px] text-text-secondary font-mono uppercase tracking-widest bg-background px-2 py-1 rounded border border-card-border">
                 Raw Output
               </span>
            </div>
            <div className="relative group">
               <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-violet-500/5 rounded-2xl -m-0.5" />
               <div className="relative p-6 rounded-2xl bg-background border border-card-border font-mono text-sm text-text-secondary leading-relaxed whitespace-pre-wrap overflow-x-auto shadow-inner">
                  {agent.systemPrompt}
               </div>
            </div>
          </div>
        </div>

        {/* Right: Actions & Stats */}
        <div className="space-y-6">
           <AgentActionSection agent={agent} backHref={backHref} />

           <div className="p-6 rounded-2xl glass-card border border-card-border space-y-4">
              <h4 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center">
                <Sparkles className="h-4 w-4 mr-2 text-accent-primary" />
                Vibe Insights
              </h4>
              <ul className="space-y-3 text-xs text-text-secondary leading-relaxed">
                 <li className="flex gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-violet-500 mt-1.5 flex-shrink-0" />
                    <span>
                      {lang === "da"
                        ? "Optimeret til Claude 3.5 Sonnet & GPT-4o."
                        : "Optimized for Claude 3.5 Sonnet & GPT-4o."
                      }
                    </span>
                 </li>
                 <li className="flex gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-500 mt-1.5 flex-shrink-0" />
                    <span>
                      {lang === "da"
                        ? "Understøtter Cursor & Windsurf workflows."
                        : "Supports Cursor & Windsurf workflows."
                      }
                    </span>
                 </li>
                 <li className="flex gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                    <span>
                      {lang === "da"
                        ? "Lokal eksekvering via CLI understøttet."
                        : "Local execution via CLI supported."
                      }
                    </span>
                 </li>
              </ul>
           </div>
        </div>
      </div>
    </div>
  );
}
