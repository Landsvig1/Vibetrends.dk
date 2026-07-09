import { Suspense } from "react";
import BlogList from "./BlogList";
import { BookOpen } from "lucide-react";
import { cookies } from "next/headers";
import { translations, Language } from "@/lib/translations";
import { entityMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";
  return entityMetadata({
    title: "Blog - vibetrends.dk",
    description: lang === "da"
      ? "Guides, tutorials og dybdegående artikler om hvordan du maksimerer dit AI-workflow."
      : "Guides, tutorials, and deep-dive articles on how to maximize your AI workflow.",
    path: "/blog",
    lang,
  });
}

export default async function BlogPage() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as Language) || "da";
  const tDict = translations[lang] || translations.da;
  const t = (key: keyof typeof translations.da) => tDict[key] || translations.da[key];

  return (
    <div className="space-y-10">
      <div className="space-y-4 text-center md:text-left">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
          Vibe Trends <span className="text-accent-primary">Blog</span>
        </h1>
        <p className="text-text-secondary max-w-2xl">
          {t("blog.desc")}
        </p>
      </div>

      <Suspense fallback={
        <div className="text-center py-16">
          <BookOpen className="h-10 w-10 text-text-secondary animate-pulse mx-auto mb-4" />
          <p className="text-text-secondary">{t("blog.fetching")}</p>
        </div>
      }>
        <BlogList />
      </Suspense>
    </div>
  );
}
