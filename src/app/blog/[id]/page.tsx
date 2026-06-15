import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clock, Calendar, User } from "lucide-react";
import { getBlogPostById } from "@/lib/db";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getBlogPostById(id);
  if (!post) return { title: "Artikel ikke fundet" };

  return {
    title: `${post.title} - Vibe Trends Blog`,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getBlogPostById(id);

  if (!post) {
    notFound();
  }

  return (
    <div className="space-y-10">
      <Link
        href="/blog"
        className="flex items-center text-slate-400 hover:text-white text-sm font-semibold transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Tilbage til alle artikler
      </Link>

      <article className="max-w-3xl mx-auto rounded-xl glass-panel overflow-hidden border border-white/5 shadow-2xl">
        <div className="h-72 sm:h-96 relative bg-slate-900 overflow-hidden">
          <Image
            src={post.imageUrl}
            alt={post.title}
            fill
            sizes="(max-w-3xl) 100vw, 800px"
            priority
            className="object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/10 to-transparent"></div>
        </div>

        <div className="p-6 sm:p-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 pb-6">
            <div className="flex items-center space-x-3 text-xs text-slate-400">
              <span className="font-bold text-slate-950 bg-violet-400 px-3 py-1 rounded-full uppercase tracking-tight">
                {post.category}
              </span>
              <span className="flex items-center bg-white/5 px-3 py-1 rounded-full border border-white/5">
                <Clock className="h-3.5 w-3.5 mr-1.5 text-violet-400" />
                {post.readTime}
              </span>
            </div>
            <div className="flex items-center space-x-4 text-xs text-slate-400">
              <span className="flex items-center">
                <User className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
                @{post.author}
              </span>
              <span className="flex items-center">
                <Calendar className="h-3.5 w-3.5 mr-1.5 text-slate-500" />
                {post.publishedAt}
              </span>
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">
            {post.title}
          </h1>

          <div className="text-slate-300 leading-relaxed text-lg space-y-6 pt-2">
            <p className="text-xl text-slate-200 font-medium leading-relaxed italic border-l-4 border-violet-500 pl-6 py-1">
              {post.excerpt}
            </p>
            
            <div className="prose prose-invert prose-violet max-w-none">
              {post.content.split('\n\n').map((para, i) => (
                <p key={i} className="mb-4">{para}</p>
              ))}
            </div>

            <div className="mt-12 p-6 rounded-xl bg-violet-600/5 border border-violet-500/20 text-sm">
              <h4 className="font-bold text-white mb-2">Om denne serie</h4>
              <p className="text-slate-400">
                Dette er en del af en løbende artikelserie på vibetrends.dk. Vi dykker ned i de værktøjer og metoder, som Cand.it solo-foundere og &quot;vibe coders&quot; bruger til at bygge software hurtigere end nogensinde før.
              </p>
            </div>
          </div>
        </div>
      </article>

      {/* Author Bio or CTA */}
      <div className="max-w-3xl mx-auto p-8 rounded-xl glass-card flex items-center gap-6">
        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center text-white font-bold text-xl">
          {post.author[0]}
        </div>
        <div className="flex-1">
          <h4 className="text-lg font-bold text-white">Skrevet af {post.author}</h4>
          <p className="text-sm text-slate-400">Bidragsyder på vibetrends.dk og passioneret AI-udvikler.</p>
        </div>
      </div>
    </div>
  );
}
