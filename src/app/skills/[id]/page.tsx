import Link from "next/link";
import { ArrowLeft, ExternalLink, User, Sparkles, Briefcase } from "lucide-react";
import { getSkillById } from "@/lib/db";
import { notFound } from "next/navigation";
import { jsonLdScript, breadcrumbJsonLd } from "@/lib/jsonLd";
import { entityMetadata } from "@/lib/seo";
import { Suspense } from "react";
import ConnectBlock from "@/app/components/ConnectBlock";
import SkillDocSection from "./SkillDocSection";

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

function parseGithubRepo(url?: string): { ownerRepo: string; url: string } | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("github.com")) {
      const parts = parsed.pathname.replace(/^\//, "").split("/").filter(Boolean);
      if (parts.length >= 2) {
        const ownerRepo = `${parts[0]}/${parts[1]}`;
        return {
          ownerRepo,
          url: `https://github.com/${ownerRepo}`,
        };
      }
    }
  } catch {
    // Ignore invalid URLs
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const skill = await getSkillById(id, 'da');
  if (!skill) return { title: "Skill ikke fundet" };

  return entityMetadata({
    title: skill.title,
    suffix: " - Skills Library",
    description: skill.description,
    path: `/skills/${id}`,
    lang: 'da',
  });
}

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [
    {
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

export async function SkillDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const skill = await getSkillById(id, 'da');
  if (!skill) {
    notFound();
  }

  const repo = parseGithubRepo(skill.githubUrl || skill.source);

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
        Tilbage til Skills
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* min-w-0: a grid item defaults to min-width:auto, so a wide <pre> in
            the fetched documentation would widen the whole track and scroll the
            page sideways instead of scrolling inside its own block. */}
        <div className="lg:col-span-2 min-w-0 space-y-8">
          <div className="p-8 rounded-2xl glass-panel border border-card-border space-y-6 shadow-2xl">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 text-xs rounded bg-accent-light text-accent-primary border border-accent-primary/20">
                    {skill.categoryLabel}
                  </span>
                  {repo && (
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-background border border-card-border text-xs text-text-secondary font-mono hover:text-foreground hover:border-text-secondary transition-colors"
                    >
                      <GithubIcon className="h-3.5 w-3.5" />
                      <span>{repo.ownerRepo}</span>
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </a>
                  )}
                </div>
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

            {/* Publisher & Source Attribution (/clarify + /typeset) */}
            <div className="pt-6 border-t border-card-border grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Publisher / Vibe Coder */}
              <div className="flex items-center space-x-3 p-3.5 rounded-xl bg-background/60 border border-card-border">
                <div className="h-10 w-10 rounded-full bg-accent-primary flex items-center justify-center text-white font-bold shrink-0 shadow-sm text-sm">
                  {skill.vibeCoder[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] uppercase font-bold text-accent-primary tracking-wider">Udgivet af</span>
                    <User className="h-3 w-3 text-text-secondary" />
                  </div>
                  <p className="font-bold text-foreground text-sm truncate">@{skill.vibeCoder}</p>
                  <p className="text-xs text-text-secondary truncate">{skill.vibeCoderTitle}</p>
                </div>
              </div>

              {/* Repository Source */}
              {repo ? (
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-3 p-3.5 rounded-xl bg-background/60 border border-card-border hover:border-accent-primary/50 transition-colors group"
                >
                  <div className="h-10 w-10 rounded-full bg-foreground text-background flex items-center justify-center font-bold shrink-0 shadow-sm">
                    <GithubIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase font-bold text-accent-primary tracking-wider">GitHub Kilde</span>
                      <ExternalLink className="h-3 w-3 text-text-secondary group-hover:text-accent-primary transition-colors" />
                    </div>
                    <p className="font-mono font-bold text-foreground text-xs truncate">{repo.ownerRepo}</p>
                    <p className="text-xs text-text-secondary truncate">Open source repository</p>
                  </div>
                </a>
              ) : (
                <div className="flex items-center space-x-3 p-3.5 rounded-xl bg-background/60 border border-card-border">
                  <div className="h-10 w-10 rounded-full bg-accent-light text-accent-primary flex items-center justify-center font-bold shrink-0">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-accent-primary tracking-wider">Kilde Type</span>
                    <p className="font-bold text-foreground text-sm">Vibetrends Community</p>
                    <p className="text-xs text-text-secondary">Direkte registreret skill</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Renders nothing when the skill has no stored SKILL.md/README.md. */}
          <SkillDocSection id={id} />
        </div>

        <div className="min-w-0 space-y-6">
          <div id="connect" className="scroll-mt-24">
            <ConnectBlock
              feedType="skills"
              item={{ name: skill.title, githubUrl: skill.githubUrl, source: skill.source }}
              lang="da"
            />
          </div>
          <div className="p-6 rounded-2xl glass-card border border-card-border space-y-4">
            <h4 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center">
              <Briefcase className="h-4 w-4 mr-2 text-accent-primary" />
              Detaljer
            </h4>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">Kategori</span>
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
                Se på GitHub
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
