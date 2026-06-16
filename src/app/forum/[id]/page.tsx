import Link from "next/link";
import { ArrowLeft, Heart } from "lucide-react";
import { getThreads } from "@/lib/db";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { translations, Language } from "@/lib/translations";
import ForumReplySection from "./ForumReplySection";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";

  const threads = await getThreads(undefined, lang);
  const thread = threads.find(t => t.id === id);
  if (!thread) return { title: "Tråd ikke fundet" };

  return {
    title: `${thread.title} - Vibe Trends Forum`,
    description: thread.content.substring(0, 160),
  };
}

export default async function ForumThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";
  const tDict = translations[lang] || translations.da;
  const t = (key: keyof typeof translations.da) => tDict[key] || translations.da[key];

  const threads = await getThreads(undefined, lang);
  const thread = threads.find(t => t.id === id);

  if (!thread) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <Link
        href="/forum"
        className="flex items-center text-text-secondary hover:text-foreground text-sm font-semibold transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        {t("forum.detail.back")}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl glass-panel p-6 sm:p-8 space-y-6 border border-card-border shadow-2xl">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-3">
                <span className="text-xs font-bold text-accent-primary px-3 py-1 rounded-full bg-accent-light border border-accent-primary/20 uppercase tracking-tight">
                  {thread.category}
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

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="rounded-xl glass-card p-6 space-y-4 border border-card-border">
            <h4 className="text-sm font-bold text-foreground uppercase tracking-wider border-b border-card-border pb-2">
              Forum Info
            </h4>
            <div className="space-y-3">
               <div className="flex justify-between text-xs">
                 <span className="text-text-secondary">{lang === "da" ? "Svar i alt" : "Total replies"}</span>
                 <span className="text-foreground font-mono">{thread.replies.length}</span>
               </div>
               <div className="flex justify-between text-xs">
                 <span className="text-text-secondary">{lang === "da" ? "Visninger" : "Views"}</span>
                 <span className="text-foreground font-mono">{Math.floor(thread.upvotes * 4.5)}</span>
               </div>
            </div>
          </div>

          <div className="rounded-xl glass-panel p-6 bg-violet-600/5 border border-accent-primary/20">
            <h4 className="text-sm font-bold text-foreground mb-2">Vibe Coding Tip</h4>
            <p className="text-xs text-text-secondary leading-relaxed">
              {lang === "da" 
                ? "Husk at du kan indsende dine egne projekter i Showcase-sektionen og få feedback her i forummet."
                : "Remember that you can submit your own projects to the Showcase section and get feedback here in the forum."
              }
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
