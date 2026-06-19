"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, Clock, Calendar, User, Search } from "lucide-react";
import { BlogPost } from "@/lib/db";
import { useLanguage } from "../components/LanguageProvider";

export default function BlogList() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const { language, t } = useLanguage();

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

  const filteredPosts = posts.filter((post) => {
    const matchesCategory =
      selectedCategory === "All" || post.category === selectedCategory;
    const matchesSearch =
      post.title.toLowerCase().includes(search.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(search.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  const categories = ["All", "Guides", "Workflow", "Industry"];

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
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer snap-center shrink-0 ${
                selectedCategory === cat
                  ? "bg-violet-600 text-white font-extrabold shadow-md shadow-violet-500/20"
                  : "bg-background border border-card-border text-text-secondary hover:bg-card-border hover:text-foreground"
              }`}
            >
              {cat === "All" ? (language === "da" ? "Alle" : "All") : cat}
            </button>
          ))}
        </div>
      </div>

      {filteredPosts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {filteredPosts.map((post, index) => (
            <Link
              key={post.id}
              href={`/blog/${post.id}`}
              className="rounded-xl glass-card overflow-hidden flex flex-col justify-between group h-full"
            >
              <div className="h-56 relative bg-background overflow-hidden">
                <Image
                  src={post.imageUrl}
                  alt={post.title}
                  fill
                  sizes="(max-w-7xl) 50vw, 100vw"
                  priority={index === 0}
                  className="object-cover opacity-70 group-hover:scale-105 transition duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>
              </div>

              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-text-secondary">
                    <span className="font-semibold text-accent-primary">{post.category}</span>
                    <span className="flex items-center">
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      {post.readTime}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-foreground group-hover:text-accent-primary transition-colors leading-snug">
                    {post.title}
                  </h3>
                  <p className="text-sm text-text-secondary line-clamp-3 leading-relaxed pt-1">
                    {post.excerpt}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-card-border text-xs text-text-secondary">
                  <div className="flex items-center space-x-1">
                    <User className="h-3.5 w-3.5 text-text-secondary" />
                    <span>{t("blog.detail.author")} {post.author}</span>
                  </div>
                  <span className="flex items-center">
                    <Calendar className="h-3.5 w-3.5 mr-1 text-text-secondary" />
                    {post.publishedAt}
                  </span>
                </div>
              </div>
            </Link>
          ))}
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
