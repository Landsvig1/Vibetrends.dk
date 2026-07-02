import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import {
  Sparkles, ArrowRight, Heart, PlusCircle,
  MessageSquare, Cpu, Layers, Briefcase,
  Clock, Info
} from "lucide-react";
import { getCounts, getTopProjects, getTopSkills, getTopAgents, getLatestPosts, getThreads } from "@/lib/db";
import { cookies } from "next/headers";
import { translations, Language } from "@/lib/translations";

export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-text-secondary font-semibold">Indlæser…</div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}

// Reads cookies() for the language, so this must stay inside a <Suspense>
// boundary — otherwise Cache Components can fold it into the prebuilt static
// shell instead of treating it as a per-request dynamic render.
async function HomeContent() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";
  const tDict = translations[lang] || translations.da;
  const t = (key: keyof typeof translations.da) => tDict[key] || translations.da[key];

  // Fetch what the landing page renders: counts for the stats band, a small
  // grid of top items per section, and the most-upvoted threads (with their
  // replies) for the forum snapshot.
  const [counts, featuredProjects, featuredSkills, [featuredAgent], featuredPosts, threads] =
    await Promise.all([
      getCounts(),
      getTopProjects(4, lang),
      getTopSkills(3, lang),
      getTopAgents(1, lang),
      getLatestPosts(3, lang),
      getThreads(undefined, lang, 3),
    ]);

  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <section className="relative text-center py-8 sm:py-16 overflow-hidden">
        
        <div className="pill-badge mb-6">
          <Sparkles className="h-3.5 w-3.5 text-accent-primary" />
          <span>{t("home.badge")}</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-4xl mx-auto leading-tight sm:leading-none">
          {lang === "da" ? (
            <>
              Se hvad folk <span className="text-accent-primary italic">bygger med AI</span>.
            </>
          ) : (
            <>
              Get inspired. <span className="text-accent-primary italic">Show what you built.</span>
            </>
          )}
        </h1>
        
        <p className="mt-6 text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto">
          {t("home.hero_desc")}
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            href="/vibes"
            className="btn-primary"
          >
            {t("home.btn_showcase")}
            <Layers className="ml-2 h-4 w-4" />
          </Link>
          <Link
            href="/skills"
            className="btn-secondary"
          >
            {t("home.btn_find_freelancer")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          <Link
            href="/vibes?submit=1"
            className="btn-secondary"
          >
            {t("home.btn_submit_project")}
            <PlusCircle className="ml-2 h-4 w-4" />
          </Link>
        </div>

        <Link
          href="/about"
          className="mt-6 inline-flex items-center text-sm text-text-secondary hover:text-accent-primary transition-colors"
        >
          <Info className="mr-1.5 h-3.5 w-3.5" />
          {t("home.btn_about")}
        </Link>
      </section>

      {/* Stats Counter */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-6 p-8 rounded-2xl glass-panel">
        <div className="text-center space-y-2 border-r border-card-border">
          <p className="text-3xl font-extrabold text-foreground font-mono">{counts.vibes}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{t("home.stat.projects")}</p>
        </div>
        <div className="text-center space-y-2 md:border-r border-card-border">
          <p className="text-3xl font-extrabold text-foreground font-mono">{counts.skills}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{t("home.stat.skills")}</p>
        </div>
        <div className="text-center space-y-2 border-r border-card-border">
          <p className="text-3xl font-extrabold text-foreground font-mono">{counts.threads}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{t("home.stat.threads")}</p>
        </div>
        <div className="text-center space-y-2">
          <p className="text-3xl font-extrabold text-foreground font-mono">{counts.agents}</p>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{t("home.stat.agents")}</p>
        </div>
      </section>

      {/* Showcase Highlight */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center">
            <Layers className="mr-2 h-5 w-5 text-accent-primary" />
            {t("home.section.featured_project")}
          </h2>
          <Link href="/vibes" className="text-sm text-accent-primary hover:opacity-80 flex items-center font-medium">
            {t("home.see_all")}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredProjects.map((project, i) => (
            <div key={project.id} className="rounded-xl glass-card overflow-hidden flex flex-col">
              <div className="h-48 relative overflow-hidden bg-card-border">
                <Image
                  src={project.imageUrl}
                  alt={project.title}
                  fill
                  sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 25vw"
                  priority={i === 0}
                  className="object-cover opacity-80 group-hover:scale-105 transition duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"></div>
                <div className="absolute bottom-4 left-4 flex items-center space-x-2">
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-background text-text-secondary border border-card-border">
                    Highlight
                  </span>
                </div>
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-bold leading-tight">
                    {project.title}
                  </h3>
                  <p className="text-sm text-text-secondary line-clamp-2">
                    {project.description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {project.tools.slice(0, 3).map((tool) => (
                    <span key={tool} className="px-2 py-0.5 text-xs rounded-md bg-background text-text-secondary border border-card-border">
                      {tool}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-card-border text-xs text-text-secondary">
                  <span>{t("home.by")} {project.author}</span>
                  <span className="flex items-center font-medium">
                    <Heart className="h-3.5 w-3.5 mr-1 text-accent-primary" />
                    {project.upvotes} upvotes
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Community Skills Highlight */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center">
            <Briefcase className="mr-2 h-5 w-5 text-accent-primary" />
            {t("home.section.featured_skills")}
          </h2>
          <Link href="/skills" className="text-sm text-accent-primary hover:opacity-80 flex items-center font-medium">
            {t("home.see_all")}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {featuredSkills.map((skill) => (
            <div key={skill.id} className="rounded-xl glass-card p-6 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="px-2 py-0.5 text-xs rounded bg-background text-text-secondary border border-card-border">
                      {skill.categoryLabel}
                    </span>
                    <h3 className="text-lg font-bold mt-2 leading-tight">
                      {skill.title}
                    </h3>
                  </div>
                </div>
                <p className="text-sm text-text-secondary line-clamp-3">
                  {skill.description}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {skill.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-xs rounded-md bg-background text-text-secondary border border-card-border">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-card-border">
                <div>
                  <p className="text-xs text-text-secondary">{t("home.freelancer")}</p>
                  <p className="text-sm font-semibold">{skill.vibeCoder}</p>
                </div>
                <Link
                  href="/skills"
                  className="btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                >
                  {t("home.book_now")}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Forum & Blog snapshot */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Forum Section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center">
              <MessageSquare className="mr-2 h-5 w-5 text-accent-primary" />
              {t("home.section.forum")}
            </h2>
            <Link href="/forum" className="text-sm text-accent-primary hover:opacity-80 flex items-center font-medium">
              {t("home.go_to_forum")}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {threads.map((thread) => (
              <Link 
                key={thread.id} 
                href="/forum"
                className="block p-5 rounded-xl glass-card group"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-text-secondary px-2 py-0.5 rounded bg-background border border-card-border">
                      {thread.category}
                    </span>
                    <h3 className="text-base font-bold leading-snug group-hover:text-accent-primary transition-colors pt-1">
                      {thread.title}
                    </h3>
                  </div>
                  <span className="flex items-center text-xs text-text-secondary bg-background border border-card-border px-2 py-1 rounded">
                    <Heart className="h-3.5 w-3.5 text-accent-primary mr-1" />
                    {thread.upvotes}
                  </span>
                </div>
                <div className="flex items-center space-x-4 mt-4 pt-3 border-t border-card-border text-xs text-text-secondary">
                  <span>{t("home.thread_by")} @{thread.author}</span>
                  <span>&middot;</span>
                  <span className="flex items-center">
                    <MessageSquare className="h-3 w-3 mr-1" />
                    {thread.replies.length} {t("home.replies")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Blog Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center">
              <Cpu className="mr-2 h-5 w-5 text-accent-primary" />
              {t("home.section.blog")}
            </h2>
            <Link href="/blog" className="text-sm text-accent-primary hover:opacity-80 flex items-center font-medium">
              {t("home.read_blog")}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="space-y-4">
            {featuredPosts.map((post) => (
              <div key={post.id} className="rounded-xl glass-card overflow-hidden">
                <div className="h-36 relative bg-card-border overflow-hidden">
                  <Image
                    src={post.imageUrl}
                    alt={post.title}
                    fill
                    sizes="(max-width: 1023px) 100vw, 33vw"
                    className="object-cover opacity-90"
                  />
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span className="font-semibold text-accent-primary">{post.category}</span>
                    <span className="flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      {post.readTime}
                    </span>
                  </div>
                  <h3 className="text-base font-bold leading-snug">
                    {post.title}
                  </h3>
                  <p className="text-xs text-text-secondary line-clamp-2">
                    {post.excerpt}
                  </p>
                  <Link
                    href="/blog"
                    className="inline-flex items-center text-xs font-semibold text-accent-primary hover:opacity-80 pt-2"
                  >
                    {t("home.read_article")}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agents & MCP Banner */}
      {featuredAgent && (
        <section className="relative rounded-2xl glass-panel p-8 overflow-hidden">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded bg-background text-text-secondary border border-card-border text-xs font-bold">
                <Cpu className="h-3.5 w-3.5 mr-1" />
                {t("home.popular_agent")}
              </div>
              <h2 className="text-2xl font-bold">{featuredAgent.name}</h2>
              <p className="text-sm text-text-secondary max-w-xl">{featuredAgent.description}</p>
            </div>
            <div className="flex flex-col gap-2 w-full md:w-auto">
              <div className="bg-background border border-card-border rounded-lg p-2 font-mono text-xs text-text-secondary select-all overflow-x-auto whitespace-nowrap">
                {featuredAgent.installCommand}
              </div>
              <Link
                href="/agents"
                className="btn-secondary text-xs"
              >
                {t("home.go_to_agents")}
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
