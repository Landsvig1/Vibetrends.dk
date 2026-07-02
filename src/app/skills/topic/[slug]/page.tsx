import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { ArrowLeft, ArrowRight, Flag, Flame, TrendingUp } from "lucide-react";
import { getSkills, parseSkillView } from "@/lib/db";
import { getSkillCategory } from "@/lib/skillCategories";
import { translations, Language } from "@/lib/translations";
import { entityMetadata } from "@/lib/seo";
import { jsonLdScript, skillsListJsonLd } from "@/lib/jsonLd";
import { TopicIcon } from "@/app/components/TopicIcon";
import { SkillCard } from "@/app/components/SkillCard";

// No generateStaticParams: the page reads the vibe_lang cookie and searchParams,
// both request-time APIs that opt the route into dynamic rendering — matching
// every other cookie-based detail route here (skills/[id], blog/[id], ...).
// Topic URLs are still crawlable via the sitemap.

export const unstable_instant = {
  prefetch: "runtime",
  samples: [
    {
      cookies: [{ name: "vibe_lang", value: "da" }],
      params: { slug: "backend-data" },
      searchParams: { view: null },
    },
  ],
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const topic = getSkillCategory(slug);
  if (!topic) return { title: "Emne ikke fundet" };

  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";
  const label = lang === "en" ? topic.labelEn : topic.labelDa;
  const desc = lang === "en" ? topic.descEn : topic.descDa;

  return entityMetadata({
    title: `${label} skills - Skills Library`,
    description: desc,
    path: `/skills/topic/${slug}`,
    lang,
  });
}

export default function TopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="space-y-10 animate-pulse">
          <div className="h-6 bg-card-border/50 rounded w-24"></div>
          <div className="rounded-2xl glass-panel border border-card-border bg-card-border/10 h-40"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-xl glass-card bg-card-border/10 h-48"></div>
            <div className="rounded-xl glass-card bg-card-border/10 h-48"></div>
          </div>
        </div>
      }
    >
      <TopicContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function TopicContent({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const topic = getSkillCategory(slug);
  if (!topic) notFound();

  const sp = await searchParams;
  const view = parseSkillView(sp.view);

  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";
  const isDa = lang === "da";

  const label = isDa ? topic.labelDa : topic.labelEn;
  const desc = isDa ? topic.descDa : topic.descEn;
  const githubLabel = translations[lang]["skills.github"];
  const connectLabel = translations[lang]["skills.connect"];

  // `base` is the full topic catalog (view-independent) — it drives the hero
  // count, the JSON-LD, and the default grid. When a view is active we fetch the
  // ranked board too; otherwise we fetch the Hot board only to pick the featured
  // card. This avoids the previous duplicate identical query when view === 'hot'.
  type SkillList = Awaited<ReturnType<typeof getSkills>>;
  const [base, viewList, hotList] = await Promise.all([
    getSkills(undefined, slug, lang),
    view ? getSkills(undefined, slug, lang, view) : Promise.resolve<SkillList>([]),
    view ? Promise.resolve<SkillList>([]) : getSkills(undefined, slug, lang, "hot"),
  ]);

  const total = base.length;
  const featured = view ? undefined : hotList[0] ?? base[0];
  // Default grid excludes the featured card so the top pick is not shown twice.
  const gridSkills = view ? viewList : base.filter((s) => s.id !== featured?.id);
  const hasAny = view ? viewList.length > 0 : base.length > 0;

  const jsonLd = skillsListJsonLd(base, `${label} skills`, desc);

  const tabs: { value: "all" | "danish" | "trending"; label: string; icon: typeof Flag | null; href: string }[] = [
    { value: "all", label: isDa ? "Alle" : "All", icon: null, href: `/skills/topic/${slug}` },
    { value: "danish", label: isDa ? "Dansk" : "Danish", icon: Flag, href: `/skills/topic/${slug}?view=danish` },
    { value: "trending", label: isDa ? "Trender" : "Trending", icon: TrendingUp, href: `/skills/topic/${slug}?view=trending` },
  ];
  const activeTab = view ?? "all";

  return (
    <div className="space-y-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <Link
        href="/skills"
        className="flex items-center text-text-secondary hover:text-foreground text-sm font-semibold transition-colors"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        {isDa ? "Alle emner" : "All topics"}
      </Link>

      {/* Hero */}
      <div className="rounded-2xl glass-panel border border-card-border p-8 flex flex-col sm:flex-row sm:items-center gap-6">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${topic.accent}1a`, color: topic.accent }}
        >
          <TopicIcon name={topic.icon} className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">{label}</h1>
            <span className="px-2 py-0.5 text-xs font-mono rounded bg-background text-text-secondary border border-card-border">
              {total} skills
            </span>
          </div>
          <p className="text-text-secondary max-w-2xl">{desc}</p>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.value}
              href={tab.href}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                activeTab === tab.value
                  ? "bg-accent-primary text-white font-extrabold shadow-md"
                  : "bg-background border border-card-border text-text-secondary hover:bg-card-border hover:text-foreground"
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Featured pick (default view only) */}
      {featured && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary flex items-center">
            <Flame className="h-4 w-4 mr-2 text-accent-primary" />
            {isDa ? "Mest populære" : "Most popular"}
          </h2>
          <SkillCard skill={featured} githubLabel={githubLabel} connectLabel={connectLabel} />
        </div>
      )}

      {/* Grid */}
      {gridSkills.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {gridSkills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} githubLabel={githubLabel} connectLabel={connectLabel} />
          ))}
        </div>
      )}

      {!hasAny && (
        <div className="text-center py-16 rounded-xl border border-card-border bg-background">
          <p className="text-text-secondary font-semibold">
            {isDa ? "Ingen skills i dette emne endnu." : "No skills in this topic yet."}
          </p>
          <Link href="/skills" className="inline-flex items-center text-sm font-semibold text-accent-primary mt-3">
            {isDa ? "Udforsk andre emner" : "Explore other topics"}
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      <p className="text-xs text-text-secondary">
        {isDa ? "Udvalgt indhold seedet fra " : "Seed content from "}
        <a href="https://www.skills.sh/topic" target="_blank" rel="noopener noreferrer" className="text-accent-primary hover:underline">
          skills.sh
        </a>
        {isDa ? " — bygges videre af fællesskabet." : " — grown by the community."}
      </p>
    </div>
  );
}
