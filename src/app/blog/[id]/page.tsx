import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { getBlogPostById } from "@/lib/db";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { translations, Language } from "@/lib/translations";
import { entityMetadata, truncateTitle } from "@/lib/seo";
import { jsonLdScript, articleJsonLd, breadcrumbJsonLd } from "@/lib/jsonLd";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const post = await getBlogPostById(id, lang);
  if (!post) return { title: "Artikel ikke fundet" };

  return entityMetadata({
    title: `${truncateTitle(post.title, " - Vibe Trends Blog".length)} - Vibe Trends Blog`,
    description: post.excerpt,
    path: `/blog/${id}`,
    lang,
    type: "article",
  });
}

import { Suspense } from "react";

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [
    {
      cookies: [{ name: "vibe_lang", value: "da" }],
      params: { id: "b1" }
    }
  ]
};

export default async function BlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={
      <div className="space-y-10 animate-pulse">
        <div className="h-6 bg-card-border/50 rounded w-24"></div>
        <div className="max-w-3xl mx-auto rounded-xl glass-panel overflow-hidden border border-card-border shadow-2xl h-96 bg-card-border/20"></div>
      </div>
    }>
      <BlogPostContent params={params} />
    </Suspense>
  );
}

async function BlogPostContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";
  const tDict = translations[lang] || translations.da;
  const t = (key: keyof typeof translations.da) => tDict[key] || translations.da[key];

  const post = await getBlogPostById(id, lang);

  if (!post) {
    notFound();
  }

  return (
    <div className="space-y-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            articleJsonLd({
              title: post.title,
              description: post.excerpt,
              author: post.author,
              url: `https://vibetrends.dk/blog/${id}`,
              image: post.imageUrl,
              datePublished: post.publishedAt,
            })
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: "Blog", url: "https://vibetrends.dk/blog" },
              { name: post.title, url: `https://vibetrends.dk/blog/${id}` },
            ])
          ),
        }}
      />
      <Link
        href="/blog"
        className="flex items-center text-text-secondary hover:text-foreground text-sm font-semibold transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        {t("blog.detail.back")}
      </Link>

      <article className="max-w-3xl mx-auto rounded-xl glass-panel overflow-hidden border border-card-border shadow-2xl">
        <div className="p-6 sm:p-10 space-y-6">
          <div className="space-y-4 border-b border-card-border pb-6">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-accent-primary bg-accent-light px-2.5 py-1 rounded-md">
                {post.category}
              </span>
              <span className="text-xs text-text-secondary bg-background px-2.5 py-1 rounded-md border border-card-border flex items-center">
                <Clock className="h-3 w-3 mr-1 text-accent-primary" />
                {post.readTime}
              </span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground leading-tight tracking-tight">
              {post.title}
            </h1>

            <div className="flex items-center gap-2 pt-2 text-xs text-text-secondary">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <div className="w-6 h-6 rounded-full bg-accent-light text-accent-primary font-bold text-[11px] flex items-center justify-center border border-accent-primary/10 select-none">
                  {post.author.charAt(0).toUpperCase()}
                </div>
                <span>{post.author}</span>
              </div>
              <span className="text-card-border">•</span>
              <span>{post.publishedAt}</span>
            </div>
          </div>

          <div className="text-text-secondary leading-relaxed text-lg space-y-6 pt-2">
            <p className="text-xl text-foreground font-medium leading-relaxed italic border-l-4 border-accent-primary pl-6 py-1">
              {post.excerpt}
            </p>
            
            <div className="prose prose-invert prose-violet max-w-none">
              {post.content.split('\n\n').map((para, i) => (
                <p key={i} className="mb-4">{para}</p>
              ))}
            </div>

          </div>
        </div>
      </article>

    </div>
  );
}
