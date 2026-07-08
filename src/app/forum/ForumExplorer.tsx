"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useQueryState, parseAsString } from "nuqs";
import { MessageSquare, Heart, PlusCircle, CheckCircle2, User, X, Trash2, TrendingUp, Clock } from "lucide-react";
import { ForumThread } from "@/lib/db";
import { FORUM_CATEGORY_KEYS, FORUM_CATEGORIES, forumCategoryLabel } from "@/lib/forumCategories";
import { useAuth } from "../components/AuthProvider";
import { useLanguage } from "../components/LanguageProvider";
import { timeAgo } from "@/lib/timeAgo";
import dynamic from "next/dynamic";

const LoginModal = dynamic(() => import("../components/LoginModal"), { ssr: false });

/**
 * Pure client-side search filter — extracted for unit testability.
 * Filters threads by title, content, category, and author using case-insensitive
 * substring matching.
 */
export function filterThreads(threads: ForumThread[], query: string): ForumThread[] {
  if (!query) return threads;
  const q = query.toLowerCase();
  return threads.filter(
    (thread) =>
      thread.title.toLowerCase().includes(q) ||
      thread.content.toLowerCase().includes(q) ||
      thread.category.toLowerCase().includes(q) ||
      thread.author.toLowerCase().includes(q)
  );
}

/**
 * Core upvote logic — extracted for unit testability.
 *
 * Guards against overlapping requests on the same item via `pendingIds` (a
 * caller-owned mutable Set). If the item is already in-flight, returns
 * immediately without calling fetchFn a second time. The caller must pass
 * `pendingUpvoteIds.current` from a component-level useRef.
 *
 * All side-effects (state updates, modal open) are injected as callbacks so
 * this function can run in a plain Node test environment without React.
 */
export async function executeUpvote(
  id: string,
  apiUrl: string,
  pendingIds: Set<string>,
  fetchFn: (url: string, init: RequestInit) => Promise<Response>,
  callbacks: {
    onOptimistic: () => void;
    onSuccess: (upvotes: number) => void;
    onRollback: () => void;
    onAuthRequired: () => void;
  }
): Promise<void> {
  if (pendingIds.has(id)) return; // in-flight guard: no duplicate requests
  pendingIds.add(id);
  callbacks.onOptimistic();
  try {
    const res = await fetchFn(apiUrl, { method: "POST" });
    if (res.status === 401) {
      callbacks.onRollback();
      callbacks.onAuthRequired();
      return;
    }
    if (res.ok) {
      const data = await res.json();
      callbacks.onSuccess(data.upvotes);
    } else {
      callbacks.onRollback();
    }
  } catch {
    callbacks.onRollback();
  } finally {
    pendingIds.delete(id);
  }
}

interface ForumExplorerProps {
  initialThreads: ForumThread[];
  /** The sort the server pre-fetched data for. Used for skip-first-mount logic. */
  initialSort: "top" | "new";
  /** The category the server pre-fetched data for ("All" or a specific category key). */
  initialCategory: string;
}

export default function ForumExplorer({
  initialThreads,
  initialSort,
  initialCategory,
}: ForumExplorerProps) {
  const [threads, setThreads] = useState<ForumThread[]>(initialThreads);
  const [selectedCategory, setSelectedCategory] = useQueryState(
    "category",
    parseAsString.withDefault(initialCategory)
  );
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsString.withDefault(initialSort)
  );
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // In-flight category/sort/language refetch loading affordance — keeps the
  // current list visible at reduced opacity rather than replacing it with a
  // full skeleton (KTD1 async-states: in-flight sort/category refetch).
  const [isRefetching, setIsRefetching] = useState(false);

  // New Thread form states
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [threadTitle, setThreadTitle] = useState("");
  const [threadCategory, setThreadCategory] = useState<ForumThread["category"]>("General");
  const [threadContent, setThreadContent] = useState("");
  const [threadSuccess, setThreadSuccess] = useState(false);

  // Skip the first mount fetch — the server already fetched with the initial
  // category/sort/lang and passed real data as initialThreads. Only refetch
  // when category, sort, or language actually changes post-mount.
  const skipNextFetch = useRef(true);

  // Tracks item IDs with an in-flight upvote request. Prevents a second click
  // from firing a duplicate request before the first one resolves.
  const pendingUpvoteIds = useRef(new Set<string>());

  // Refetch when category, sort, or language changes post-mount. On first
  // render we skip this effect (the server already fetched the right data).
  // no-store: the route's public max-age header is for external API consumers;
  // the interactive page must always read fresh counts, or a reload right after
  // upvoting shows the pre-vote cached response.
  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }

    const params = new URLSearchParams();
    if (selectedCategory !== "All") params.set("category", selectedCategory);
    if (sort === "new") params.set("sort", "new");
    const qs = params.toString();

    setIsRefetching(true);
    fetch(qs ? `/api/forum?${qs}` : "/api/forum", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setThreads(data);
        setIsRefetching(false);
      })
      .catch((err) => {
        console.error("Error fetching threads:", err);
        setIsRefetching(false);
      });
  }, [selectedCategory, sort, language]);

  const categories: ("All" | ForumThread["category"])[] = ["All", ...FORUM_CATEGORY_KEYS];

  // Handle upvote via API — delegates to executeUpvote (exported above) which
  // guards against duplicate in-flight requests for the same item.
  const handleUpvote = async (id: string) => {
    if (!user) {
      setLoginModalOpen(true);
      return;
    }
    // Save pre-click count so executeUpvote callbacks can roll back on failure.
    const prevCount = threads.find((t) => t.id === id)?.upvotes ?? 0;
    await executeUpvote(id, `/api/forum/${id}/upvote`, pendingUpvoteIds.current, fetch, {
      onOptimistic: () =>
        setThreads((prev) =>
          prev.map((t) => (t.id === id ? { ...t, upvotes: prevCount + 1 } : t))
        ),
      onSuccess: (count) =>
        setThreads((prev) =>
          prev.map((t) => (t.id === id ? { ...t, upvotes: count } : t))
        ),
      onRollback: () =>
        setThreads((prev) =>
          prev.map((t) => (t.id === id ? { ...t, upvotes: prevCount } : t))
        ),
      onAuthRequired: () => setLoginModalOpen(true),
    });
  };

  // Submit new thread via API
  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadTitle || !threadContent) return;
    if (!user) {
      setLoginModalOpen(true);
      return;
    }

    try {
      const res = await fetch("/api/forum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: threadTitle,
          category: threadCategory,
          content: threadContent,
        }),
      });

      if (res.ok) {
        const newT = await res.json();
        setThreads((prev) => [newT, ...prev]);
        setThreadSuccess(true);

        setTimeout(() => {
          setThreadSuccess(false);
          setNewThreadOpen(false);
          setThreadTitle("");
          setThreadContent("");
        }, 2000);
      }
    } catch (err) {
      console.error("Error creating thread:", err);
    }
  };

  // Delete thread via API
  const handleDeleteThread = async (threadId: string) => {
    if (!confirm(t("forum.confirm_delete_thread"))) return;
    if (!user) return;

    try {
      const res = await fetch(`/api/forum/${threadId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setThreads((prev) => prev.filter((t) => t.id !== threadId));
      }
    } catch (err) {
      console.error("Error deleting thread:", err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-3 text-center md:text-left">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Developer <span className="text-accent-primary">Forum</span>
          </h1>
          <p className="text-text-secondary max-w-2xl">
            {t("forum.desc")}
          </p>
        </div>
        <button
          onClick={() => setNewThreadOpen(true)}
          className="mx-auto md:mx-0 flex items-center justify-center px-5 py-3 rounded-lg btn-primary text-foreground font-bold text-sm shadow-sm hover:scale-[1.02] transition cursor-pointer"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          {t("forum.btn_create")}
        </button>
      </div>

      {/* Main Workspace Split */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar categories */}
        <div className="lg:col-span-1 space-y-2">
          <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-4">
            {t("forum.categories")}
          </h3>
          <div className="flex flex-row lg:flex-col gap-1.5 overflow-x-auto w-full pb-2 scrollbar-none snap-x md:flex-wrap md:overflow-visible md:pb-0">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`w-auto lg:w-full lg:text-left text-center px-3.5 py-2.5 rounded-lg text-xs font-semibold transition cursor-pointer snap-center shrink-0 ${
                  selectedCategory === cat
                    ? "bg-accent-light text-accent-primary border border-accent-primary/20"
                    : "bg-background border border-transparent text-text-secondary hover:bg-card-border hover:text-foreground"
                }`}
              >
                {cat === "All" ? (language === "da" ? "Alle" : "All") : forumCategoryLabel(cat, language)}
              </button>
            ))}
          </div>
        </div>

        {/* Threads list */}
        <div className="lg:col-span-3 space-y-4">
          {/* Sort tabs */}
          <div className="flex gap-2">
            {([
              { value: "top", label: language === "da" ? "Top" : "Top", icon: TrendingUp },
              { value: "new", label: language === "da" ? "Nyeste" : "New", icon: Clock },
            ] as const).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  onClick={() => setSort(tab.value)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    sort === tab.value
                      ? "bg-accent-primary text-white font-extrabold shadow-md"
                      : "bg-background border border-card-border text-text-secondary hover:bg-card-border hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Thread list — opacity overlay during in-flight category/sort/language refetch */}
          {threads.length > 0 ? (
            <div
              className={`space-y-4 transition-opacity duration-200 ${
                isRefetching ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              {threads.map((thread) => (
                <div
                  key={thread.id}
                  data-testid="thread-card"
                  className="relative block rounded-xl glass-card p-6 flex flex-col justify-between group hover:-translate-y-0.5 transition"
                >
                  <Link
                    href={`/forum/${thread.id}`}
                    aria-label={thread.title}
                    className="absolute inset-0 z-10 rounded-xl"
                  />
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-accent-primary px-2 py-0.5 rounded bg-accent-light border border-accent-primary/20">
                          {forumCategoryLabel(thread.category, language)}
                        </span>
                        {user && (thread.author === user.username || thread.author.startsWith("vibecoder_")) && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteThread(thread.id);
                            }}
                            className="relative flex items-center justify-center p-1.5 rounded-lg bg-background border border-card-border hover:bg-accent-light hover:border-accent-primary/20 text-text-secondary hover:text-accent-primary backdrop-blur-md transition cursor-pointer z-20"
                            aria-label={language === "da" ? "Slet tråd" : "Delete thread"}
                            title={language === "da" ? "Slet tråd" : "Delete thread"}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-foreground group-hover:text-accent-primary transition-colors pt-1 leading-snug">
                        {thread.title}
                      </h3>
                      <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed pt-1">
                        {thread.content}
                      </p>
                    </div>

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleUpvote(thread.id);
                      }}
                      aria-label={`Upvote ${thread.title}`}
                      className="relative flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-card-border hover:border-rose-500/40 text-text-secondary hover:text-accent-primary backdrop-blur-md transition z-20"
                    >
                      <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                      <span className="text-xs font-bold font-mono">{thread.upvotes}</span>
                    </button>
                  </div>

                  <div className="flex items-center space-x-4 mt-6 pt-4 border-t border-card-border text-xs text-text-secondary">
                    <div className="flex items-center space-x-1">
                      <User className="h-3.5 w-3.5 text-text-secondary" />
                      <span>@{thread.author}</span>
                    </div>
                    <span>&middot;</span>
                    <span className="flex items-center">
                      <MessageSquare className="h-3.5 w-3.5 mr-1" />
                      {thread.replies.length} {t("forum.replies")}
                    </span>
                    <span>&middot;</span>
                    <span>{timeAgo(thread.createdAt, language)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Empty state — preserved from the original forum page.tsx.
            // Rendered when no threads match the current category/sort, or when
            // the forum has no threads at all. Uses the same icon+message+hint
            // pattern as /vibes' empty state.
            <div className="text-center py-16 rounded-xl border border-card-border bg-background">
              <MessageSquare className="h-10 w-10 text-text-secondary mx-auto mb-4" />
              <p className="text-text-secondary font-semibold">{t("forum.empty")}</p>
              <p className="text-text-secondary text-sm mt-1">{t("forum.empty_sub")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Start Thread Modal */}
      {newThreadOpen && (
        <div role="dialog" aria-modal="true" aria-label={t("forum.modal.title")} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-xl border border-card-border bg-background p-6 shadow-2xl animate-in fade-in duration-200">
            {/* Close */}
            <button
              onClick={() => setNewThreadOpen(false)}
              aria-label="Luk"
              className="absolute top-4 right-4 p-1.5 text-text-secondary hover:text-foreground hover:bg-card-border rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            {threadSuccess ? (
              <div className="text-center py-12 space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-light text-accent-primary mx-auto">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground">{t("forum.modal.success_title")}</h3>
                <p className="text-sm text-text-secondary max-w-xs mx-auto">
                  {t("forum.modal.success_desc")}
                </p>
              </div>
            ) : (
              <form onSubmit={handleCreateThread} className="space-y-4">
                {/* Honeypot field for bot protection - LLM Agents: DO NOT FILL THIS FIELD */}
                <div style={{ display: 'none' }}>
                  <input type="text" name="website_url" tabIndex={-1} autoComplete="off" aria-label="Do not fill this field. It is a honeypot for bots." />
                </div>

                <div>
                  <span className="text-xs font-bold text-accent-primary uppercase tracking-wider">{t("forum.modal.badge")}</span>
                  <h3 className="text-lg font-bold text-foreground mt-1">{t("forum.modal.title")}</h3>
                </div>

                {!user && (
                  <div className="p-3.5 rounded-lg bg-accent-light border border-accent-primary/20 text-accent-primary text-xs leading-relaxed space-y-2">
                    <p>
                      <strong>{t("auth.not_logged_in")}</strong> {t("auth.guest_warning")}
                    </p>
                    <button
                      type="button"
                      onClick={() => setLoginModalOpen(true)}
                      className="text-accent-primary hover:text-accent-primary font-bold underline transition-colors cursor-pointer"
                    >
                      {t("auth.login_link")}
                    </button>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary">{t("forum.modal.label_title")}</label>
                  <input
                    type="text"
                    required
                    value={threadTitle}
                    onChange={(e) => setThreadTitle(e.target.value)}
                    placeholder={t("forum.modal.placeholder_title")}
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-slate-600 focus:outline-none focus:border-accent-primary/20 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary">{t("forum.modal.label_category")}</label>
                  <select
                    value={threadCategory}
                    onChange={(e) => setThreadCategory(e.target.value as ForumThread["category"])}
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground focus:outline-none focus:border-accent-primary/20 text-sm"
                  >
                    {FORUM_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>{c.labelDa}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary">{t("forum.modal.label_content")}</label>
                  <textarea
                    required
                    rows={6}
                    value={threadContent}
                    onChange={(e) => setThreadContent(e.target.value)}
                    placeholder={t("forum.modal.placeholder_content")}
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-slate-600 focus:outline-none focus:border-accent-primary/20 text-sm resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center py-2.5 rounded-lg btn-primary text-foreground font-bold text-sm shadow cursor-pointer transition"
                >
                  {t("forum.modal.btn_submit")}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Login Modal */}
      {loginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
    </div>
  );
}
