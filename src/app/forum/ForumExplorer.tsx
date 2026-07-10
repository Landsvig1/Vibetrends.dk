"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryState, parseAsString } from "nuqs";
import { MessageSquare, Heart, PlusCircle, CheckCircle2, User, X, Trash2, TrendingUp, Clock, Flag, Search } from "lucide-react";
import { ForumThread } from "@/lib/db";
import { FORUM_CATEGORY_KEYS, FORUM_CATEGORIES, forumCategoryLabel } from "@/lib/forumCategories";
import { useAuth } from "../components/AuthProvider";
import { useLanguage } from "../components/LanguageProvider";
import { timeAgo } from "@/lib/timeAgo";
import dynamic from "next/dynamic";
import EmptyState from "../components/EmptyState";

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
  /** The view the server pre-fetched data for. Used for skip-first-mount logic. */
  initialView: "danish" | "top" | "new";
  /** The category the server pre-fetched data for ("All" or a specific category key). */
  initialCategory: string;
}

export default function ForumExplorer({
  initialThreads,
  initialView,
  initialCategory,
}: ForumExplorerProps) {
  const [threads, setThreads] = useState<ForumThread[]>(initialThreads);
  const [selectedCategory, setSelectedCategory] = useQueryState(
    "category",
    parseAsString.withDefault(initialCategory)
  );
  const [view, setView] = useQueryState(
    "view",
    parseAsString.withDefault(initialView)
  );
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
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
  // category/view/lang and passed real data as initialThreads. Only refetch
  // when category, view, or language actually changes post-mount.
  const skipNextFetch = useRef(true);

  // Tracks item IDs with an in-flight upvote request. Prevents a second click
  // from firing a duplicate request before the first one resolves.
  const pendingUpvoteIds = useRef(new Set<string>());

  // getThreads/api/forum only understand top/new — Dansk is a client-side
  // filter/sort layered on the 'top'-sorted base list (see viewThreads below).
  const serverSort = view === "new" ? "new" : "top";

  // Refetch when category, view, or language changes post-mount. On first
  // render we skip this effect (the server already fetched the right data).
  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }

    const params = new URLSearchParams();
    if (selectedCategory !== "All") params.set("category", selectedCategory);
    if (serverSort === "new") params.set("sort", "new");
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
  }, [selectedCategory, serverSort, language]);

  const categories: ("All" | ForumThread["category"])[] = ["All", ...FORUM_CATEGORY_KEYS];

  const searchActive = search.trim() !== "";

  // Dansk filters the server-fetched (category-scoped, 'top'-sorted) list to
  // Danish contributors, Denmark-specific threads first — same pattern as
  // VibesExplorer/AgentsExplorer. Top/Nyeste are already sorted server-side.
  const viewThreads =
    view === "danish"
      ? [...threads]
          .filter((t) => t.isDanish)
          .sort((a, b) => Number(b.denmarkSpecific) - Number(a.denmarkSpecific) || b.upvotes - a.upvotes)
      : threads;

  const filteredThreads = filterThreads(viewThreads, search);

  const viewTabs: { value: string; label: string; icon: typeof Flag | typeof TrendingUp | typeof Clock }[] = [
    { value: "danish", label: language === "da" ? "Dansk" : "Danish", icon: Flag },
    { value: "top", label: "Top", icon: TrendingUp },
    { value: "new", label: language === "da" ? "Nyeste" : "New", icon: Clock },
  ];

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
        // New threads aren't Danish-flagged, so the default Dansk tab would
        // hide them — jump to Top so the author sees their thread.
        if (view === "danish") setView("top");
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
        <div className="lg:col-span-1 space-y-6">
          <div className="space-y-2">
            <h3 className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] mb-4">
              {t("forum.categories")}
            </h3>
            <div className="flex flex-row lg:flex-col gap-1.5 overflow-x-auto w-full pb-2 scrollbar-none snap-x md:flex-wrap md:overflow-visible md:pb-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`w-auto lg:w-full lg:text-left text-center px-3.5 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer snap-center shrink-0 ${
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

          {/* Community Info Box (Reddit-style) */}
          <div className="hidden lg:block rounded-xl border border-card-border bg-card-bg/30 p-5 space-y-4">
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-foreground">About Community</h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                {language === "da"
                  ? "Velkommen til Danmarks AI-forum. Del din viden, stil spørgsmål og netværk med andre vibe coders."
                  : "Welcome to Denmark's AI forum. Share knowledge, ask questions and network with other vibe coders."}
              </p>
            </div>
            <div className="pt-4 border-t border-card-border">
              <div className="flex justify-between text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                <span>Created</span>
                <span className="text-foreground">June 2024</span>
              </div>
            </div>
          </div>
        </div>

        {/* Threads list */}
        <div className="lg:col-span-3 space-y-4">
          {/* Search + View tabs */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-text-secondary" aria-hidden="true" />
              <input
                type="text"
                aria-label={language === "da" ? "Søg i forum..." : "Search forum..."}
                placeholder={language === "da" ? "Søg i forum..." : "Search forum..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-card-border text-foreground placeholder-slate-500 focus:outline-none focus:border-accent-primary/20 focus:ring-1 focus:ring-accent-primary/30 transition text-sm"
              />
            </div>

            <div className="flex gap-2">
              {viewTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setView(tab.value)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                      view === tab.value && !searchActive
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
          </div>

          {/* Thread list — opacity overlay during in-flight category/view/language refetch */}
          {filteredThreads.length > 0 ? (
            <motion.div
              layout
              className={`space-y-3 transition-opacity duration-200 ${
                isRefetching ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <AnimatePresence mode="popLayout">
                {filteredThreads.map((thread, index) => (
                  <motion.div
                    key={thread.id}
                    data-testid="thread-card"
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                    className="relative block rounded-xl border border-card-border bg-card-bg/20 hover:bg-card-bg/40 transition-all group overflow-hidden"
                  >
                    <Link
                      href={`/forum/${thread.id}`}
                      aria-label={thread.title}
                      className="absolute inset-0 z-10"
                    />

                    <div className="flex">
                      {/* Reddit-style Vote Column */}
                      <div className="hidden sm:flex flex-col items-center w-12 pt-4 bg-black/5 dark:bg-white/5 border-r border-card-border/50">
                        <motion.button
                          whileHover={{ scale: 1.2 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleUpvote(thread.id);
                          }}
                          className="p-1 text-text-secondary hover:text-accent-primary transition-colors z-20"
                        >
                          <TrendingUp className="h-5 w-5" />
                        </motion.button>
                        <span className="text-xs font-bold text-foreground my-1">{thread.upvotes}</span>
                      </div>

                      <div className="flex-1 p-4 sm:p-5 space-y-3">
                        <div className="flex items-center gap-2 text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                          <span className="text-accent-primary px-1.5 py-0.5 rounded bg-accent-light/50 border border-accent-primary/10">
                            {forumCategoryLabel(thread.category, language)}
                          </span>
                          <span>&middot;</span>
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            @{thread.author}
                          </span>
                          <span>&middot;</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeAgo(thread.createdAt, language)}
                          </span>

                          {user && (thread.author === user.username || thread.author.startsWith("vibecoder_")) && (
                            <motion.button
                              whileHover={{ scale: 1.1, color: "#ef4444" }}
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteThread(thread.id);
                              }}
                              className="ml-auto p-1 text-text-secondary transition-colors z-20"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </motion.button>
                          )}
                        </div>

                        <div className="space-y-1">
                          <h3 className="text-base sm:text-lg font-bold text-foreground group-hover:text-accent-primary transition-colors leading-snug">
                            {thread.title}
                          </h3>
                          <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed font-serif italic opacity-80">
                            {thread.content}
                          </p>
                        </div>

                        <div className="flex items-center space-x-4 pt-1 text-xs font-bold text-text-secondary">
                          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-card-border/30 hover:bg-card-border/50 transition-colors">
                            <MessageSquare className="h-3.5 w-3.5" />
                            <span>{thread.replies.length} {t("forum.replies")}</span>
                          </div>

                          <div className="sm:hidden flex items-center gap-1.5 px-2 py-1 rounded-md bg-card-border/30">
                            <TrendingUp className="h-3.5 w-3.5 text-accent-primary" />
                            <span>{thread.upvotes}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <EmptyState
              icon={MessageSquare}
              title={t("forum.empty")}
              description={t("forum.empty_sub")}
              actionLabel={t("forum.btn_create")}
              onAction={() => setNewThreadOpen(true)}
              suggestions={
                initialThreads.length > 0
                  ? {
                      title: language === "da" ? "Top diskussioner" : "Top discussions",
                      items: initialThreads.slice(0, 3).map((t) => ({
                        id: t.id,
                        title: t.title,
                        href: `/forum/${t.id}`,
                      })),
                    }
                  : undefined
              }
            />
          )}
        </div>
      </div>

      {/* Start Thread Modal */}
      {newThreadOpen && (
        <div role="dialog" aria-modal="true" aria-label={t("forum.modal.title")} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-xl border border-card-border bg-background p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
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
