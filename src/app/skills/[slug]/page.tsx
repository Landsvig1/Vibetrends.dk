import Link from "next/link";
import { ArrowLeft, ExternalLink, User, Sparkles } from "lucide-react";
import { getSkillBySlug, getCollectionSize } from "@/lib/db";
import { notFound } from "next/navigation";
import { jsonLdScript, breadcrumbJsonLd } from "@/lib/jsonLd";
import { entityMetadata } from "@/lib/seo";
import { Suspense } from "react";
import ConnectBlock from "@/app/components/ConnectBlock";
import ShareButton from "@/app/components/ShareButton";
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
          url,
        };
      }
    }
  } catch {
    // Ignore invalid URLs
  }
  return null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const skill = await getSkillBySlug(slug, 'da');
  if (!skill) return { title: "Skill ikke fundet" };

  return entityMetadata({
    title: skill.title,
    suffix: " - Skills-biblioteket",
    description: skill.description,
    path: `/skills/${slug}`,
    lang: 'da',
  });
}

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [
    {
      // A real slug, so the runtime prefetch sample renders an actual page.
      params: { slug: "skill-creator" }
    }
  ]
};

export default async function SkillDetailPage({ params }: { params: Promise<{ slug: string }> }) {
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

export async function SkillDetailContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Slug-only by design: src/proxy.ts turns a legacy /skills/{id} into a real
  // 308 before any page code runs. An id reaching this component means the
  // proxy matcher missed, which is a bug there rather than a case to handle
  // here — and a redirect thrown from a server component under
  // cacheComponents streams into an already-sent 200 (see src/proxy.ts).
  const skill = await getSkillBySlug(slug, 'da');
  if (!skill) {
    notFound();
  }

  const repo = parseGithubRepo(skill.githubUrl || skill.source);

  // Provenance for multi-skill imports. Suppressed below 2 members so a lone
  // import never reads as a one-item folder. Plain text, not a link: the
  // collection page is deliberately not built yet, and a link to a route that
  // does not exist is worse than no affordance.
  const collectionSize = skill.collectionSlug
    ? await getCollectionSize(skill.collectionSlug)
    : 0;
  const showCollection = Boolean(skill.collectionTitle) && collectionSize > 1;

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
              { name: skill.categoryLabel, url: `https://vibetrends.dk/skills/topic/${skill.category}` },
              { name: skill.title, url: `https://vibetrends.dk/skills/${slug}` },
            ])
          ),
        }}
      />

      {/* Navigation Breadcrumbs (/layout + /typeset) */}
      <nav aria-label="Brødkrummer" className="flex items-center flex-wrap text-xs text-text-secondary gap-2 font-mono">
        <Link href="/skills" className="flex items-center hover:text-foreground transition-colors font-semibold">
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Skills
        </Link>
        <span>/</span>
        <Link
          href={`/skills/topic/${skill.category}`}
          className="hover:text-accent-primary transition-colors text-accent-primary font-medium"
        >
          {skill.categoryLabel}
        </Link>
        <span>/</span>
        <span className="text-foreground font-semibold truncate max-w-[240px] sm:max-w-none">
          {skill.title}
        </span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* min-w-0: a grid item defaults to min-width:auto, so a wide <pre> in
            the fetched documentation would widen the whole track and scroll the
            page sideways instead of scrolling inside its own block. */}
        <div className="lg:col-span-2 min-w-0 space-y-8">
          <div className="p-8 rounded-2xl glass-panel border border-card-border space-y-6 shadow-2xl">
            {/* Header Badges & Action Buttons (/layout) */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 text-xs rounded bg-accent-light text-accent-primary border border-accent-primary/20 font-semibold">
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

              <div className="flex items-center gap-2">
                <ShareButton title={skill.title} url={`https://vibetrends.dk/skills/${slug}`} />
                {repo && (
                  <a
                    href={repo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    /* Padding, radius and weight were inert against unlayered
                       `.btn-primary`; see ForumExplorer's CTA. */
                    className="hidden sm:inline-flex items-center gap-2 text-xs btn-primary"
                  >
                    <GithubIcon className="h-4 w-4" />
                    Se Repository
                  </a>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground leading-tight">
                {skill.title}
              </h1>
              <p className="text-text-secondary text-lg leading-relaxed">
                {skill.description}
              </p>
              {showCollection && (
                <p className="text-xs text-text-secondary">
                  Del af{" "}
                  <span className="font-semibold text-foreground">{skill.collectionTitle}</span>{" "}
                  <span className="font-mono tabular-nums">({collectionSize} skills)</span>
                </p>
              )}
            </div>

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
          <SkillDocSection id={skill.id} />
        </div>

        {/* Sidebar Column (/distill: removed redundant details box) */}
        <div className="min-w-0 space-y-6">
          <div id="connect" className="scroll-mt-24">
            <ConnectBlock
              feedType="skills"
              item={{ slug: skill.slug, name: skill.title, githubUrl: skill.githubUrl, source: skill.source }}
              lang="da"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
