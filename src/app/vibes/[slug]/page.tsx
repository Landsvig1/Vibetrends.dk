import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Heart, ExternalLink, Code, Sparkles } from "lucide-react";
import { getProjectBySlug } from "@/lib/db";
import { notFound } from "next/navigation";
import { jsonLdScript, breadcrumbJsonLd } from "@/lib/jsonLd";
import { entityMetadata } from "@/lib/seo";
import ShareButton from "@/app/components/ShareButton";

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

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const project = await getProjectBySlug(slug, 'da');
  if (!project) return { title: "Projekt ikke fundet" };

  return entityMetadata({
    title: project.title,
    suffix: " - Vibe Coding Showcase",
    description: project.description,
    path: `/vibes/${slug}`,
    lang: 'da',
    type: "article",
  });
}

import { Suspense } from "react";

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [
    {
      // A real slug, so the runtime prefetch sample renders an actual page.
      params: { slug: "panoptik" }
    }
  ]
};

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
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

async function ShowcaseProjectContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const project = await getProjectBySlug(slug, 'da');

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: "Vibes", url: "https://vibetrends.dk/vibes" },
              { name: project.title, url: `https://vibetrends.dk/vibes/${slug}` },
            ])
          ),
        }}
      />
      <Link
        href="/vibes"
        className="flex items-center text-text-secondary hover:text-foreground text-sm font-semibold transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Tilbage til Showcase
      </Link>

      <div className={`grid grid-cols-1 gap-10 ${project.prompts.length > 0 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        {/* Left: Project Media & Info */}
        <div className="lg:col-span-2 space-y-8">
          <div className="relative rounded-2xl overflow-hidden border border-card-border bg-background aspect-video shadow-2xl">
            <Image
              src={project.imageUrl}
              alt={project.title}
              fill
              priority
              sizes="(min-width: 1024px) 66vw, 100vw"
              className="object-cover opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/80 to-transparent"></div>
            <div className="absolute bottom-6 left-6">
              <h1 className="text-white font-bold text-xl">{project.title}</h1>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">
                Om projektet
              </h2>
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-accent-light border border-accent-primary/20 text-accent-primary">
                <Heart className="h-4 w-4 fill-current" />
                <span className="font-mono font-bold">{project.upvotes}</span>
              </div>
            </div>
            
            <p className="text-text-secondary leading-relaxed text-lg">
              {project.description}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
              {project.tools.length > 0 && (
              <div className="p-6 rounded-xl glass-card space-y-3">
                <h3 className="text-sm font-bold text-accent-primary uppercase tracking-wider flex items-center">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Teknologier &amp; Værktøjer
                </h3>
                <div className="flex flex-wrap gap-2">
                  {project.tools.map(tool => (
                    <span key={tool} className="px-3 py-1 rounded-full bg-background border border-card-border text-text-secondary text-xs font-medium">
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
              )}

              <div className="p-6 rounded-xl glass-card space-y-4 flex flex-col justify-center">
                 <div className="flex gap-4">
                    <a
                      href={project.demoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      /* See VibesExplorer's CTA: everything but the flex box
                         was inert against unlayered `.btn-primary`, and the
                         shadow that did apply is not in DESIGN.md's button
                         spec. */
                      className="flex-1 flex items-center justify-center gap-2 btn-primary"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Besøg Live Demo
                    </a>
                    {project.githubUrl && (
                      <a
                        href={project.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="GitHub"
                        className="p-3 rounded-lg bg-background border border-card-border text-foreground hover:bg-accent-light transition-colors"
                      >
                        <GithubIcon className="h-5 w-5" />
                      </a>
                    )}
                    <ShareButton
                      title={project.title}
                      url={`https://vibetrends.dk/vibes/${slug}`}
                    />
                 </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Prompts & Details (only when the project actually has prompts) */}
        {project.prompts.length > 0 && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl glass-panel border border-card-border space-y-6 sticky top-24">
            <div className="flex items-center space-x-2">
              <Code className="h-5 w-5 text-accent-primary" />
              <h3 className="text-lg font-bold text-foreground">
                Core Prompts Anvendt
              </h3>
            </div>

            <div className="space-y-4">
              {project.prompts.map((prompt, index) => (
                <div key={index} className="space-y-2">
                  <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">
                    Step {index + 1}
                  </span>
                  <div className="p-4 rounded-xl bg-background border border-card-border text-text-secondary text-xs font-mono whitespace-pre-wrap leading-relaxed">
                    {prompt}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-6 border-t border-card-border">
              <p className="text-xs text-text-secondary leading-relaxed italic">
                Disse prompts er delt af skaberen. Kopier dem for at genskabe lignende funktionalitet i dine egne projekter.
              </p>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
