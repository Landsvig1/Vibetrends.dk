"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useQueryState, parseAsString } from "nuqs";
import { BookOpen, Clock, Search, Trash2, Layers, Cpu, Grid } from "lucide-react";
import { BlogPost } from "@/lib/db";
import { useLanguage } from "../components/LanguageProvider";
import { useAuth } from "../components/AuthProvider";

const getCategoryIcon = (category: string) => {
  switch (category) {
    case "Guides":
      return <BookOpen className="h-4.5 w-4.5 text-accent-primary" />;
    case "Workflow":
      return <Layers className="h-4.5 w-4.5 text-violet-600" />;
    case "Agents":
      return <Cpu className="h-4.5 w-4.5 text-emerald-600" />;
    default:
      return <BookOpen className="h-4.5 w-4.5 text-accent-primary" />;
  }
};

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

/**
 * Filter blog posts by category and search query.
 * Extracted and exported to allow pure unit testing without a browser DOM,
 * and optimized to lower-case the search query once outside the filter loop.
 */
export function filterBlogPosts(
  posts: BlogPost[],
  selectedCategory: string,
  search: string
): BlogPost[] {
  const query = search.toLowerCase().trim();
  return posts.filter((post) => {
    const matchesCategory =
      selectedCategory === "All" || post.category === selectedCategory;
    if (!matchesCategory) return false;

    if (!query) return true;

    return (
      post.title.toLowerCase().includes(query) ||
      post.excerpt.toLowerCase().includes(query)
    );
  });
}

export default function BlogList() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selectedCategory, setSelectedCategory] = useQueryState("category", parseAsString.withDefault("All"));
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [loading, setLoading] = useState(true);
  const { language, t } = useLanguage();
  const { user } = useAuth();

  // Admin-only delete — RLS has no owner-delete policy for blog_posts, so
  // this only ever succeeds for public.is_admin() callers.
  const handleDeletePost = async (id: string, e: React.MouseEvent) => {
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
  };

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

  // Optimize search: use filterBlogPosts helper wrapped in useMemo to prevent
  // redundant calculations on every keystroke/render.
  const filteredPosts = useMemo(() => {
    return filterBlogPosts(posts, selectedCategory, search);
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
              <Link
                key={post.id}
                href={`/blog/${post.id}`}
                className="flex gap-4 items-start relative group rounded-xl p-4 -mx-4 hover:bg-accent-light/50 transition-all duration-300"
              >
                {/* Category Icon (Timeline Node) */}
                <div className="relative z-10 shrink-0 w-10 h-10 rounded-lg border border-card-border bg-card-bg flex items-center justify-center text-text-secondary group-hover:bg-accent-light group-hover:border-accent-primary/20 transition-all duration-300 hidden md:flex">
                  {getCategoryIcon(post.category)}
                </div>

                {/* Content Area */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-accent-primary md:hidden">
                    {post.category}
                  </div>

                  <h3 className="text-lg sm:text-xl font-bold text-foreground group-hover:text-accent-primary transition-colors leading-snug">
                    {post.title}
                  </h3>

                  <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed max-w-3xl">
                    {post.excerpt}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary pt-1">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <div className="w-5 h-5 rounded-full bg-accent-light text-accent-primary font-bold text-[10px] flex items-center justify-center border border-accent-primary/10 select-none">
                        {post.author.charAt(0).toUpperCase()}
                      </div>
                      <span>{post.author}</span>
                    </div>
                    <span className="text-card-border">•</span>
                    <span>{post.publishedAt}</span>
                    <span className="text-card-border">•</span>
                    <span className="flex items-center">
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      {post.readTime}
                    </span>
                  </div>
                </div>

                {/* Admin delete button */}
                {user?.isAdmin && (
                  <button
                    onClick={(e) => handleDeletePost(post.id, e)}
                    aria-label={t("blog.confirm_delete")}
                    className="flex items-center justify-center p-1.5 rounded-lg bg-card-bg border border-card-border hover:bg-red-50 hover:border-red-200 text-text-secondary hover:text-red-600 transition cursor-pointer shrink-0 z-20"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </Link>
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
