import Link from "next/link";
import { ArrowLeft, Briefcase } from "lucide-react";
import { getSkillById } from "@/lib/db";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { Language } from "@/lib/translations";
import { jsonLdScript, breadcrumbJsonLd } from "@/lib/jsonLd";
import { entityMetadata, truncateTitle } from "@/lib/seo";
import { Suspense } from "react";
import ConnectBlock from "@/app/components/ConnectBlock";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const skill = await getSkillById(id, lang);
  if (!skill) return { title: "Skill ikke fundet" };

  return entityMetadata({
    title: `${truncateTitle(skill.title, " - Skills Library".length)} - Skills Library`,
    description: skill.description,
    path: `/skills/${id}`,
    lang,
  });
}

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [
    {
      cookies: [{ name: "vibe_lang", value: "da" }],
      params: { id: "s1" }
    }
  ]
};

export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={
      <div className="space-y-10 animate-pulse">
        <div className="h-6 bg-card-border/50 rounded w-24"></div>
        <div className="rounded-2xl glass-panel border border-card-border bg-card-border/10 h-80"></div>
      </div>
    }>
      <SkillDetailContent params={params} />
    </Suspense>
  );
}

async function SkillDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const skill = await getSkillById(id, lang);
  if (!skill) {
    notFound();
  }

  return (
    <div className="space-y-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({
            "@context": "https://schema.org",
            "@type": "SoftwareSourceCode",
            "name": skill.title,
            "description": skill.description,
            "author": {
              "@type": "Person",
              "name": skill.vibeCoder
            }
          })
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: "Skills", url: "https://vibetrends.dk/skills" },
              { name: skill.title, url: `https://vibetrends.dk/skills/${id}` },
            ])
          ),
        }}
      />
      <Link
        href="/skills"
        className="flex items-center text-text-secondary hover:text-foreground text-sm font-semibold transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        {lang === "da" ? "Tilbage til Skills" : "Back to Skills"}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-8">
          <div className="p-8 rounded-2xl glass-panel border border-card-border space-y-6 shadow-2xl">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-3">
                <span className="px-2.5 py-0.5 text-xs rounded bg-accent-light text-accent-primary border border-accent-primary/20">
                  {skill.categoryLabel}
                </span>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground leading-tight">
                  {skill.title}
                </h1>
              </div>
            </div>

            <p className="text-text-secondary text-lg leading-relaxed">
              {skill.description}
            </p>

            <div className="flex flex-wrap gap-2">
              {skill.tags.map((tag) => (
                <span key={tag} className="px-3 py-1 rounded-full bg-background border border-card-border text-text-secondary text-xs font-mono">
                  #{tag}
                </span>
              ))}
            </div>

            <div className="flex items-center space-x-3 pt-6 border-t border-card-border text-xs text-text-secondary">
              <div className="h-8 w-8 rounded-full bg-accent-primary/80 flex items-center justify-center text-white font-bold">
                {skill.vibeCoder[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-foreground">@{skill.vibeCoder}</p>
                <p>{skill.vibeCoderTitle}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div id="connect" className="scroll-mt-24">
            <ConnectBlock
              feedType="skills"
              item={{ name: skill.title, githubUrl: skill.githubUrl, source: skill.source }}
              lang={lang}
            />
          </div>
          <div className="p-6 rounded-2xl glass-card border border-card-border space-y-4">
            <h4 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center">
              <Briefcase className="h-4 w-4 mr-2 text-accent-primary" />
              {lang === "da" ? "Detaljer" : "Details"}
            </h4>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">{lang === "da" ? "Kategori" : "Category"}</span>
                <span className="text-foreground font-mono">{skill.categoryLabel}</span>
              </div>
            </div>
            {skill.githubUrl && (
              <a
                href={skill.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg btn-primary text-sm mt-2"
              >
                {lang === "da" ? "Se på GitHub" : "View on GitHub"}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
