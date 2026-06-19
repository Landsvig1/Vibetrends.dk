import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Heart, ExternalLink, Code, Sparkles } from "lucide-react";
import { getProjectById } from "@/lib/db";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { translations, Language } from "@/lib/translations";
import { jsonLdScript } from "@/lib/jsonLd";

// Custom Github Icon matching Lucide style
const GithubIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className}
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const project = await getProjectById(id, lang);
  if (!project) return { title: "Projekt ikke fundet" };

  return {
    title: `${project.title} - Vibe Coding Showcase`,
    description: project.description,
  };
}

import { Suspense } from "react";

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [
    {
      cookies: [{ name: "vibe_lang", value: "da" }],
      params: { id: "p1" }
    }
  ]
};

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={
      <div className="space-y-10 animate-pulse">
        <div className="h-6 bg-card-border/50 rounded w-24"></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-8">
            <div className="relative rounded-2xl overflow-hidden border border-card-border bg-card-border/10 aspect-video shadow-2xl h-80"></div>
          </div>
          <div className="h-60 rounded-2xl glass-panel border border-card-border bg-card-border/10"></div>
        </div>
      </div>
    }>
      <ShowcaseProjectContent params={params} />
    </Suspense>
  );
}

async function ShowcaseProjectContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";
  const tDict = translations[lang] || translations.da;
  const t = (key: keyof typeof translations.da) => tDict[key] || translations.da[key];

  const project = await getProjectById(id, lang);

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": project.title,
            "description": project.description,
            "applicationCategory": "DeveloperApplication",
            "author": {
              "@type": "Person",
              "name": project.author
            },
            "offers": {
              "@type": "Offer",
              "price": "0",
              "priceCurrency": "USD"
            }
          })
        }}
      />
      <Link
        href="/showcase"
        className="flex items-center text-text-secondary hover:text-foreground text-sm font-semibold transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        {t("showcase.detail.back")}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left: Project Media & Info */}
        <div className="lg:col-span-2 space-y-8">
          <div className="relative rounded-2xl overflow-hidden border border-card-border bg-background aspect-video shadow-2xl">
            <Image
              src={project.imageUrl}
              alt={project.title}
              fill
              priority
              className="object-cover opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent"></div>
            <div className="absolute bottom-6 left-6 flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-violet-600 flex items-center justify-center text-white font-bold text-xl shadow-lg border-2 border-card-border">
                {project.author[0]}
              </div>
              <div>
                <h1 className="text-white font-bold text-xl">{project.title}</h1>
                <p className="text-slate-300 text-sm">{t("showcase.by")} @{project.author}</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">
                {lang === "da" ? "Om projektet" : "About the project"}
              </h2>
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-accent-primary">
                <Heart className="h-4 w-4 fill-current" />
                <span className="font-mono font-bold">{project.upvotes}</span>
              </div>
            </div>
            
            <p className="text-text-secondary leading-relaxed text-lg">
              {project.description}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              <div className="p-6 rounded-xl glass-card space-y-3">
                <h3 className="text-sm font-bold text-accent-primary uppercase tracking-wider flex items-center">
                  <Sparkles className="h-4 w-4 mr-2" />
                  {t("showcase.detail.tools")}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {project.tools.map(tool => (
                    <span key={tool} className="px-3 py-1 rounded-full bg-background border border-card-border text-text-secondary text-xs font-medium">
                      {tool}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-6 rounded-xl glass-card space-y-4 flex flex-col justify-center">
                 <div className="flex gap-4">
                    <a
                      href={project.demoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg btn-primary text-foreground font-bold transition shadow-sm"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t("showcase.detail.visit")}
                    </a>
                    {project.githubUrl && (
                      <a
                        href={project.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="GitHub"
                        className="p-3 rounded-lg bg-background border border-card-border text-foreground hover:bg-card-border transition-colors"
                      >
                        <GithubIcon className="h-5 w-5" />
                      </a>
                    )}
                 </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Prompts & Details */}
        <div className="space-y-6">
          <div className="p-6 rounded-2xl glass-panel border border-card-border space-y-6 sticky top-24">
            <div className="flex items-center space-x-2">
              <Code className="h-5 w-5 text-accent-primary" />
              <h3 className="text-lg font-bold text-foreground">
                {t("showcase.detail.prompts")}
              </h3>
            </div>
            
            <div className="space-y-4">
              {project.prompts.length > 0 ? (
                project.prompts.map((prompt, index) => (
                  <div key={index} className="space-y-2">
                    <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
                      Step {index + 1}
                    </span>
                    <div className="p-4 rounded-xl bg-background border border-card-border text-text-secondary text-xs font-mono whitespace-pre-wrap leading-relaxed">
                      {prompt}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-text-secondary italic">{t("showcase.detail.no_prompts")}</p>
              )}
            </div>

            <div className="pt-6 border-t border-card-border">
              <p className="text-xs text-text-secondary leading-relaxed italic">
                {lang === "da" 
                  ? "Disse prompts er hentet direkte fra skaberens workflow. Kopier dem for at genskabe lignende funktionalitet i dine egne projekter."
                  : "These prompts are fetched directly from the creator's workflow. Copy them to recreate similar features in your own projects."
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
