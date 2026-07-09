import Link from "next/link";
import { ArrowLeft, Heart } from "lucide-react";
import { getThreadById } from "@/lib/db";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { translations, Language } from "@/lib/translations";
import { entityMetadata, truncateTitle } from "@/lib/seo";
import { jsonLdScript, forumThreadJsonLd, breadcrumbJsonLd } from "@/lib/jsonLd";
import { forumCategoryLabel } from "@/lib/forumCategories";
import ForumReplySection from "./ForumReplySection";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const thread = await getThreadById(id, lang);
  if (!thread) return { title: "Tråd ikke fundet" };

  return entityMetadata({
    title: `${truncateTitle(thread.title, " - Vibe Trends Forum".length)} - Vibe Trends Forum`,
    description: thread.content.substring(0, 160),
    path: `/forum/${id}`,
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
      params: { id: "t1" }
    }
  ]
};

export default async function ForumThreadPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={
      <div className="space-y-8 animate-pulse">
        <div className="h-6 bg-card-border/50 rounded w-24"></div>
        <div className="max-w-3xl space-y-6">
          <div className="rounded-xl glass-panel p-6 sm:p-8 border border-card-border shadow-2xl h-80 bg-card-border/20"></div>
        </div>
      </div>
    }>
      <ForumThreadContent params={params} />
    </Suspense>
  );
}

async function ForumThreadContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";
  const tDict = translations[lang] || translations.da;
  const t = (key: keyof typeof translations.da) => tDict[key] || translations.da[key];

  const thread = await getThreadById(id, lang);

  if (!thread) {
    notFound();
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            forumThreadJsonLd({
              title: thread.title,
              author: thread.author,
              url: `https://vibetrends.dk/forum/${id}`,
              image: "https://vibetrends.dk/images/og-default.jpg",
              datePublished: thread.createdAt,
            })
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: "Forum", url: "https://vibetrends.dk/forum" },
              { name: thread.title, url: `https://vibetrends.dk/forum/${id}` },
            ])
          ),
        }}
      />
      <div className="space-y-8">
      <Link
        href="/forum"
        className="flex items-center text-text-secondary hover:text-foreground text-sm font-semibold transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        {t("forum.detail.back")}
      </Link>

      <div className="max-w-3xl space-y-6">
          <div className="rounded-xl glass-panel p-6 sm:p-8 space-y-6 border border-card-border shadow-2xl">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-3">
                <span className="text-xs font-bold text-accent-primary px-3 py-1 rounded-full bg-accent-light border border-accent-primary/20 uppercase tracking-tight">
                  {forumCategoryLabel(thread.category, lang)}
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground leading-tight">
                  {thread.title}
                </h1>
              </div>
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-accent-primary">
                <Heart className="h-4 w-4 fill-current" />
                <span className="font-mono font-bold text-sm">{thread.upvotes}</span>
              </div>
            </div>

            <p className="text-text-secondary text-lg leading-relaxed whitespace-pre-wrap font-medium">
              {thread.content}
            </p>

            <div className="flex items-center space-x-4 pt-6 border-t border-card-border text-xs text-text-secondary">
              <div className="flex items-center space-x-2">
                <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center text-foreground font-bold text-[10px]">
                  {thread.author[0].toUpperCase()}
                </div>
                <span className="font-bold text-foreground">@{thread.author}</span>
              </div>
              <span className="text-text-secondary">&middot;</span>
              <span>{new Date(thread.createdAt).toLocaleString(lang === "da" ? 'da-DK' : 'en-US', { dateStyle: 'long', timeStyle: 'short' })}</span>
            </div>
          </div>

          {/* Reply Section (Client Side) */}
          <ForumReplySection initialThread={thread} />
      </div>
      </div>
    </>
  );
}
