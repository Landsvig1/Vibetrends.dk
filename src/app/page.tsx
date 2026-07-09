import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import {
  ArrowRight, Heart, PlusCircle,
  Cpu, Layers, Briefcase, Sparkles,
  Info
} from "lucide-react";
import { getTopProjects, getTopSkills, getTopAgents, getProjectById, getAgentById, getSkillById } from "@/lib/db";
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

  // Fetch what the landing page renders: a small grid of top items per section,
  // plus three hand-picked spotlight items (fixed IDs, not query-driven) so the
  // fold gives new visitors something concrete immediately.
  const [topProjects, topSkills, [featuredAgent], spotlightVibe, spotlightMcp, spotlightSkill] =
    await Promise.all([
      getTopProjects(5, lang), // one extra: absorbs the spotlight filter below without leaving a gap in the 4-col grid
      getTopSkills(4, lang), // one extra: same reason, for the 3-col grid
      getTopAgents(1, lang),
      getProjectById("p_1782890295301", lang), // Rentemester
      getAgentById("a_1783085673265", lang), // aula-mcp by Casperjuel
      getSkillById("s_1782976394478", lang), // Jobindex Search
    ]);

  // Spotlighted items already appear above the fold — drop them from the
  // top-N grids below so the same card doesn't render twice on one page.
  const featuredProjects = topProjects.filter((p) => p.id !== spotlightVibe?.id).slice(0, 4);
  const featuredSkills = topSkills.filter((s) => s.id !== spotlightSkill?.id).slice(0, 3);

  return (
    <div className="space-y-12 sm:space-y-14">
      {/* Hero Section */}
      <section className="relative text-center py-4 sm:py-8 overflow-hidden">
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

        <p className="mt-4 text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto">
          {t("home.hero_desc")}
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-4">
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
          className="mt-4 inline-flex items-center text-sm text-text-secondary hover:text-accent-primary transition-colors"
        >
          <Info className="mr-1.5 h-3.5 w-3.5" />
          {t("home.btn_about")}
        </Link>
      </section>

      {/* Spotlight — three hand-picked items (one vibe, one MCP server, one
          skill) so a first-time visitor sees concrete, specific content
          immediately instead of scrolling past generic top-N grids. */}
      {(spotlightVibe || spotlightMcp || spotlightSkill) && (
        <section aria-label={t("home.section.spotlight")} className="space-y-4">
          <h2 className="text-xl font-bold flex items-center">
            <Sparkles className="mr-2 h-5 w-5 text-accent-primary" />
            {t("home.section.spotlight")}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {spotlightVibe && (
              <article className="relative rounded-xl glass-card overflow-hidden flex flex-col group">
                <Link
                  href={`/vibes/${spotlightVibe.id}`}
                  aria-label={spotlightVibe.title}
                  className="absolute inset-0 z-10 rounded-xl"
                />
                <div className="h-40 relative overflow-hidden bg-card-border">
                  <Image
                    src={spotlightVibe.imageUrl}
                    alt={spotlightVibe.title}
                    fill
                    sizes="(max-width: 767px) 100vw, 33vw"
                    priority
                    className="object-cover opacity-90 group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
                  <span className="absolute bottom-3 left-3 px-2 py-0.5 rounded text-xs font-semibold bg-background text-text-secondary border border-card-border">
                    {t("home.spotlight.vibe_label")}
                  </span>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between space-y-3 min-w-0">
                  <div className="space-y-1.5 min-w-0">
                    <h3 className="text-base font-bold leading-tight [text-wrap:balance]">
                      {spotlightVibe.title}
                    </h3>
                    <p className="text-sm text-text-secondary line-clamp-2">
                      {spotlightVibe.description}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-card-border text-xs text-text-secondary">
                    <span className="flex items-center font-medium">
                      <Heart className="h-3.5 w-3.5 mr-1 text-accent-primary" />
                      {spotlightVibe.upvotes} upvotes
                    </span>
                  </div>
                </div>
              </article>
            )}

            {spotlightMcp && (
              <article className="rounded-xl glass-card p-5 flex flex-col justify-between space-y-4 min-w-0">
                <div className="space-y-2 min-w-0">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold rounded bg-accent-light text-accent-primary border border-accent-primary/20 uppercase">
                    <Cpu className="h-3 w-3" aria-hidden="true" />
                    {spotlightMcp.category}
                  </span>
                  <h3 className="text-base font-bold leading-tight pt-1 [text-wrap:balance]">
                    {spotlightMcp.name}
                  </h3>
                  <p className="text-sm text-text-secondary line-clamp-2">
                    {spotlightMcp.description}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="bg-background border border-card-border rounded-lg p-2 font-mono text-[11px] text-text-secondary select-all overflow-x-auto whitespace-nowrap">
                    {spotlightMcp.installCommand}
                  </div>
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span className="truncate">{t("home.by")} {spotlightMcp.developer}</span>
                    <Link
                      href={`/mcp/${spotlightMcp.id}`}
                      className="text-accent-primary font-medium hover:opacity-80 flex items-center shrink-0 ml-2"
                    >
                      {t("home.see_all")}
                      <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </article>
            )}

            {spotlightSkill && (
              <article className="rounded-xl glass-card p-5 flex flex-col justify-between space-y-4 min-w-0">
                <div className="space-y-2 min-w-0">
                  <span className="px-2 py-0.5 text-xs rounded bg-background text-text-secondary border border-card-border">
                    {spotlightSkill.categoryLabel}
                  </span>
                  <h3 className="text-base font-bold leading-tight pt-1 [text-wrap:balance]">
                    {spotlightSkill.title}
                  </h3>
                  <p className="text-sm text-text-secondary line-clamp-2">
                    {spotlightSkill.description}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {spotlightSkill.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="px-2 py-0.5 text-[10px] rounded-md bg-background text-text-secondary border border-card-border font-mono">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-card-border text-xs text-text-secondary">
                  <span className="truncate">{spotlightSkill.vibeCoder}</span>
                  <Link
                    href={`/skills/${spotlightSkill.id}`}
                    className="text-accent-primary font-medium hover:opacity-80 flex items-center shrink-0 ml-2"
                  >
                    {t("home.see_all")}
                    <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </div>
              </article>
            )}
          </div>
        </section>
      )}

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
          {featuredProjects.map((project) => (
            <div key={project.id} className="relative rounded-xl glass-card overflow-hidden flex flex-col group">
              {/* Card-wide overlay: screenshot and title open the project
                  detail page (same pattern as SkillCard). */}
              <Link
                href={`/vibes/${project.id}`}
                aria-label={project.title}
                className="absolute inset-0 z-10 rounded-xl"
              />
              <div className="h-48 relative overflow-hidden bg-card-border">
                <Image
                  src={project.imageUrl}
                  alt={project.title}
                  fill
                  sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 25vw"
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
