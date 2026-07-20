"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { BookOpen, Search, Layers, Cpu, Grid } from "lucide-react";
import { BlogPost } from "@/lib/db";
import { useLanguage } from "../components/LanguageProvider";
import { useAuth } from "../components/AuthProvider";
import { BlogPostCard } from "../components/BlogPostCard";

const getCategoryFilterIcon = (category: string) => {
  switch (category) {
    case "All":
      return <Grid className="h-3.5 w-3.5" />;
    case "Guides":
      return <BookOpen className="h-3.5 w-3.5" />;
    case "Workflow":
      return <Layers className="h-3.5 w-3.5" />;
    case "Agents":
      return <Cpu className="h-3.5 w-3.5" />;
    default:
      return <Grid className="h-3.5 w-3.5" />;
  }
};

export default function BlogList() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selectedCategory, setSelectedCategory] = useQueryState("category", parseAsString.withDefault("All"));
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [loading, setLoading] = useState(true);
  const { language, t } = useLanguage();
  const { user } = useAuth();

  // Admin-only delete — RLS has no owner-delete policy for blog_posts, so
  // this only ever succeeds for public.is_admin() callers.
  // Memoized with useCallback to stabilize the reference across typing-induced re-renders.
  const handleDeletePost = useCallback(async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(t("blog.confirm_delete"))) return;

    try {
      const res = await fetch(`/api/blog/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error("Error deleting blog post:", err);
    }
  }, [t]);

  useEffect(() => {
    fetch("/api/blog")
      .then((res) => res.json())
      .then((data) => {
        setPosts(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching blog posts:", err);
        setLoading(false);
      });
  }, [language]);

  // Memoized filter calculation with optimized lowercasing to prevent redundant string manipulation
  // and eliminate layout/reconciliation calculations on irrelevant state updates.
  const filteredPosts = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    return posts.filter((post) => {
      const matchesCategory =
        selectedCategory === "All" || post.category === selectedCategory;
      if (!searchLower) return matchesCategory;

      const matchesSearch =
        post.title.toLowerCase().includes(searchLower) ||
        post.excerpt.toLowerCase().includes(searchLower);

      return matchesCategory && matchesSearch;
    });
  }, [posts, selectedCategory, search]);

  const categories = ["All", "Guides", "Workflow", "Agents"];

  if (loading) {
    return (
      <div className="text-center py-16">
        <BookOpen className="h-10 w-10 text-text-secondary animate-pulse mx-auto mb-4" />
        <p className="text-text-secondary font-semibold">{t("blog.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-text-secondary" aria-hidden="true" />
          <input
            type="text"
            aria-label={t("blog.search")}
            placeholder={t("blog.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-card-border text-foreground placeholder-slate-500 focus:outline-none focus:border-accent-primary/20 focus:ring-1 focus:ring-accent-primary/30 transition text-sm"
          />
        </div>

        <div className="flex overflow-x-auto gap-2 pb-2 w-full scrollbar-none snap-x md:flex-wrap md:overflow-visible md:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer snap-center shrink-0 ${
                selectedCategory === cat
                  ? "bg-accent-primary text-white font-bold border border-accent-primary shadow-sm"
                  : "bg-background border border-card-border text-text-secondary hover:bg-card-border/50 hover:text-foreground"
              }`}
            >
              {getCategoryFilterIcon(cat)}
              <span>{cat === "All" ? (language === "da" ? "Alle" : "All") : cat}</span>
            </button>
          ))}
        </div>
      </div>

      {filteredPosts.length > 0 ? (
        <div className="relative pl-0 md:pl-8 py-2">
          {/* Vertical timeline line */}
          <div className="hidden absolute inset-y-2 left-[20px] w-px bg-card-border md:block"></div>

          <div className="flex flex-col gap-6">
            {filteredPosts.map((post) => (
              <BlogPostCard
                key={post.id}
                post={post}
                canDelete={!!user?.isAdmin}
                confirmDeleteLabel={t("blog.confirm_delete")}
                onDelete={handleDeletePost}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 rounded-xl border border-card-border bg-background">
          <BookOpen className="h-10 w-10 text-text-secondary mx-auto mb-4" />
          <p className="text-text-secondary font-semibold">{t("blog.empty")}</p>
        </div>
      )}
    </div>
  );
}
