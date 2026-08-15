import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Flag, Flame, Star } from "lucide-react";
import { getSkills, parseSkillView } from "@/lib/db";
import { getSkillCategory } from "@/lib/skillCategories";
import { entityMetadata } from "@/lib/seo";
import { jsonLdScript, skillsListJsonLd } from "@/lib/jsonLd";
import { TopicIcon } from "@/app/components/TopicIcon";
import { SkillCard } from "@/app/components/SkillCard";

// No generateStaticParams: the page reads searchParams,
// a request-time API that opts the route into dynamic rendering — matching
// every other detail route here (skills/[id], blog/[id], ...).
// Topic URLs are still crawlable via the sitemap.

export const unstable_instant = {
  prefetch: "runtime",
  samples: [
    {
      params: { slug: "backend-data" },
      searchParams: { view: null },
    },
  ],
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const topic = getSkillCategory(slug);
  if (!topic) return { title: "Emne ikke fundet" };

  return entityMetadata({
    title: topic.labelDa,
    suffix: " skills - Skills-biblioteket",
    description: topic.descDa,
    path: `/skills/topic/${slug}`,
    lang: "da",
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

  const label = topic.labelDa;
  const desc = topic.descDa;
  const githubLabel = "Se på GitHub";
  const connectLabel = "Forbind";

  // `base` is the full topic catalog (view-independent) — it drives the hero
  // count, the JSON-LD, and the default grid. The Hot board is fetched
  // unconditionally now: it decides both the featured card and whether the Hot
  // tab renders at all, and it is a warm `use cache` read either way.
  type SkillList = Awaited<ReturnType<typeof getSkills>>;
  const [base, danishList, hotList] = await Promise.all([
    getSkills(undefined, slug, 'da'),
    view === 'danish'
      ? getSkills(undefined, slug, 'da', 'danish')
      : Promise.resolve<SkillList>([]),
    getSkills(undefined, slug, 'da', 'hot'),
  ]);
  const viewList = view === 'hot' ? hotList : danishList;

  const total = base.length;
  const featured = view ? undefined : hotList[0] ?? base[0];
  // Default grid excludes the featured card so the top pick is not shown twice.
  const gridSkills = view ? viewList : base.filter((s) => s.id !== featured?.id);
  const hasAny = view ? viewList.length > 0 : base.length > 0;

  const jsonLd = skillsListJsonLd(base, `${label} skills`, desc);

  // The Hot tab appears only when this topic actually has ranked entries in the
  // current week's ranking. Same rule as the hub's board row (lib/boardTabs,
  // rule 0): a tab that opens an empty grid teaches visitors the tabs are inert.
  const tabs: { value: "all" | "danish" | "hot"; label: string; icon: typeof Flag | null; href: string }[] = [
    { value: "all", label: "Alle", icon: null, href: `/skills/topic/${slug}` },
    { value: "danish", label: "Dansk", icon: Flag, href: `/skills/topic/${slug}?view=danish` },
    ...(hotList.length > 0
      ? [{ value: "hot" as const, label: "Hotteste globalt", icon: Flame, href: `/skills/topic/${slug}?view=hot` }]
      : []),
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
        Alle emner
      </Link>

      {/* Hero */}
      <div className="rounded-2xl glass-panel border border-card-border p-8 flex flex-col sm:flex-row sm:items-center gap-6">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-accent-light text-accent-primary">
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
                  : "bg-background border border-card-border text-text-secondary hover:bg-accent-light hover:text-foreground"
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
          {/* Star, not Flame. The flame belongs to the Hot tab above. This pick
              falls back to the most-upvoted entry whenever the weekly ranking
              names nothing in this topic, so it is "most popular", not "hot". */}
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-secondary flex items-center">
            <Star className="h-4 w-4 mr-2 text-accent-primary" />
            Mest populære
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
            Ingen skills i dette emne endnu.
          </p>
          <Link href="/skills" className="inline-flex items-center text-sm font-semibold text-accent-primary mt-3">
            Udforsk andre emner
            <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      <p className="text-xs text-text-secondary">
        Udvalgt indhold seedet fra{" "}
        <a href="https://www.skills.sh/topic" target="_blank" rel="noopener noreferrer" className="text-accent-primary hover:underline">
          skills.sh
        </a>
        {" "}— bygges videre af fællesskabet.
      </p>
    </div>
  );
}
