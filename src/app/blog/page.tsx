import { Suspense } from "react";
import BlogList from "./BlogList";
import { BookOpen } from "lucide-react";

export const metadata = {
  title: "Blog - Vibe Trends",
  description: "Guides, tutorials og dybdegående artikler om hvordan du maksimerer dit AI-workflow.",
};

export default function BlogPage() {
  return (
    <div className="space-y-10">
      <div className="space-y-4 text-center md:text-left">
        <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
          Vibe Trends <span className="text-violet-400">Blog</span>
        </h1>
        <p className="text-slate-400 max-w-2xl">
          Guides, tutorials og dybdegående artikler om hvordan du maksimerer dit AI-workflow, opsætter agenter og vibe koder projekter.
        </p>
      </div>

      <Suspense fallback={
        <div className="text-center py-16">
          <BookOpen className="h-10 w-10 text-slate-600 animate-pulse mx-auto mb-4" />
          <p className="text-slate-400">Henter artikler...</p>
        </div>
      }>
        <BlogList />
      </Suspense>
    </div>
  );
}

