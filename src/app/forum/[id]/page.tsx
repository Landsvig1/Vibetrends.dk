import Link from "next/link";
import { ArrowLeft, Heart } from "lucide-react";
import { getThreads } from "@/lib/db";
import { notFound } from "next/navigation";
import ForumReplySection from "./ForumReplySection";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const threads = await getThreads();
  const thread = threads.find(t => t.id === id);
  if (!thread) return { title: "Tråd ikke fundet" };

  return {
    title: `${thread.title} - Vibe Trends Forum`,
    description: thread.content.substring(0, 160),
  };
}

export default async function ForumThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const threads = await getThreads();
  const thread = threads.find(t => t.id === id);

  if (!thread) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <Link
        href="/forum"
        className="flex items-center text-slate-400 hover:text-white text-sm font-semibold transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Tilbage til forum
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl glass-panel p-6 sm:p-8 space-y-6 border border-white/5 shadow-2xl">
            <div className="flex justify-between items-start gap-4">
              <div className="space-y-3">
                <span className="text-xs font-bold text-emerald-400 px-3 py-1 rounded-full bg-emerald-950/45 border border-emerald-500/20 uppercase tracking-tight">
                  {thread.category}
                </span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
                  {thread.title}
                </h1>
              </div>
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <Heart className="h-4 w-4 fill-current" />
                <span className="font-mono font-bold text-sm">{thread.upvotes}</span>
              </div>
            </div>

            <p className="text-slate-300 text-lg leading-relaxed whitespace-pre-wrap font-medium">
              {thread.content}
            </p>

            <div className="flex items-center space-x-4 pt-6 border-t border-white/5 text-xs text-slate-400">
              <div className="flex items-center space-x-2">
                <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-[10px]">
                  {thread.author[0].toUpperCase()}
                </div>
                <span className="font-bold text-white">@{thread.author}</span>
              </div>
              <span className="text-slate-600">&middot;</span>
              <span>{new Date(thread.createdAt).toLocaleString('da-DK', { dateStyle: 'long', timeStyle: 'short' })}</span>
            </div>
          </div>

          {/* Reply Section (Client Side) */}
          <ForumReplySection initialThread={thread} />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="rounded-xl glass-card p-6 space-y-4 border border-white/5">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider border-b border-white/5 pb-2">
              Forum Info
            </h4>
            <div className="space-y-3">
               <div className="flex justify-between text-xs">
                 <span className="text-slate-400">Svar i alt</span>
                 <span className="text-white font-mono">{thread.replies.length}</span>
               </div>
               <div className="flex justify-between text-xs">
                 <span className="text-slate-400">Visninger</span>
                 <span className="text-white font-mono">{Math.floor(thread.upvotes * 4.5)}</span>
               </div>
            </div>
          </div>

          <div className="rounded-xl glass-panel p-6 bg-violet-600/5 border border-violet-500/10">
            <h4 className="text-sm font-bold text-white mb-2">Vibe Coding Tip</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Husk at du kan indsende dine egne projekter i Showcase-sektionen og få feedback her i forummet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
