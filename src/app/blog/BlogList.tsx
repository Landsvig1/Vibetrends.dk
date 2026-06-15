"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, Clock, Calendar, User, Search } from "lucide-react";
import { BlogPost } from "@/lib/db";

export default function BlogList() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

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
  }, []);

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
        <BookOpen className="h-10 w-10 text-slate-600 animate-pulse mx-auto mb-4" />
        <p className="text-slate-400 font-semibold">Indlæser historier...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-500" />
          <input
            type="text"
            placeholder="Søg i artikler..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-900/80 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 transition-all text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedCategory === cat
                  ? "bg-violet-600 text-white font-extrabold shadow-md shadow-violet-500/20"
                  : "bg-white/5 border border-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              {cat}
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
              <div className="h-56 relative bg-slate-900 overflow-hidden">
                <Image
                  src={post.imageUrl}
                  alt={post.title}
                  fill
                  sizes="(max-w-7xl) 50vw, 100vw"
                  priority={index === 0}
                  className="object-cover opacity-70 group-hover:scale-105 transition-all duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>
              </div>

              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-violet-400">{post.category}</span>
                    <span className="flex items-center">
                      <Clock className="h-3.5 w-3.5 mr-1" />
                      {post.readTime}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white group-hover:text-cyan-300 transition-colors leading-snug">
                    {post.title}
                  </h3>
                  <p className="text-sm text-slate-300 line-clamp-3 leading-relaxed pt-1">
                    {post.excerpt}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-white/5 text-xs text-slate-400">
                  <div className="flex items-center space-x-1">
                    <User className="h-3.5 w-3.5 text-slate-500" />
                    <span>Af {post.author}</span>
                  </div>
                  <span className="flex items-center">
                    <Calendar className="h-3.5 w-3.5 mr-1 text-slate-500" />
                    {post.publishedAt}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 rounded-xl border border-white/5 bg-slate-900/20">
          <BookOpen className="h-10 w-10 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 font-semibold">Ingen artikler fundet.</p>
        </div>
      )}
    </div>
  );
}
