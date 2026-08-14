"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryState, parseAsString } from "nuqs";
import { MessageSquare, PlusCircle, CheckCircle2, X, TrendingUp, Clock, Flag, Search } from "lucide-react";
import { ForumThread } from "@/lib/db";
import { FORUM_CATEGORY_KEYS, FORUM_CATEGORIES, forumCategoryLabel } from "@/lib/forumCategories";
import { useAuth } from "../components/AuthProvider";
import { canDelete } from "@/lib/permissions";
import { visibleBoards, resolveView } from "@/lib/boardTabs";
import { ThreadCard } from "../components/ThreadCard";
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
  /**
   * Real catalog entries offered as conversation starters when the forum has no
   * threads at all. Empty whenever the forum has content — the server only pays
   * for this on a cold start. See the comment in forum/page.tsx.
   */
  coldStartTopics?: { id: string; title: string }[];
}

export default function ForumExplorer({
  initialThreads,
  initialView,
  initialCategory,
  coldStartTopics = [],
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
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // In-flight category/sort refetch loading affordance — keeps the
  // current list visible at reduced opacity rather than replacing it with a
  // full skeleton (KTD1 async-states: in-flight sort/category refetch).
  const [isRefetching, setIsRefetching] = useState(false);

  // New Thread form states
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [threadTitle, setThreadTitle] = useState("");
  const [threadCategory, setThreadCategory] = useState<ForumThread["category"]>("General");
  const [threadContent, setThreadContent] = useState("");
  const [threadSuccess, setThreadSuccess] = useState(false);

  /**
   * True only when the forum itself is empty — not when a filter or search
   * happens to match nothing. The two states need different copy: "nothing
   * matched, widen your filter" is unhelpful advice on a forum that has never
   * had a post, and "be the first!" is wrong when there are 40 threads one
   * category over.
   */
  const isColdStart =
    threads.length === 0 && !search && (selectedCategory === "All" || !selectedCategory);

  /**
   * Opens the composer pre-filled with a question about a real catalog entry.
   * A blank textarea is the actual barrier on a cold-start forum, so the
   * starter fills the title and leaves the cursor's work to the body.
   */
  const startThreadAbout = useCallback(
    (topicTitle: string) => {
      setThreadTitle(`Spørgsmål om ${topicTitle}`);
      setThreadCategory("Setup & Config");
      setNewThreadOpen(true);
    },
    []
  );

  // Skip the first mount fetch — the server already fetched with the initial
  // category/view and passed real data as initialThreads. Only refetch
  // when category or view actually changes post-mount.
  const skipNextFetch = useRef(true);

  // Tracks item IDs with an in-flight upvote request. Prevents a second click
  // from firing a duplicate request before the first one resolves.
  const pendingUpvoteIds = useRef(new Set<string>());

  // Mirrors `threads` so handleUpvote can read the current list without
  // depending on `threads` itself — keeps handleUpvote's identity stable
  // across upvotes so memoized ThreadCard instances don't all re-render
  // on every click.
  const threadsRef = useRef(threads);
  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  const BOARD_LABELS: Record<string, { label: string; icon: typeof Flag | typeof TrendingUp | typeof Clock }> = {
    danish: { label: "Dansk", icon: Flag },
    top: { label: "Top", icon: TrendingUp },
    new: { label: "Nyeste", icon: Clock },
  };

  // Which boards actually differ, per the shared rule in lib/boardTabs.
  //
  // Top and Nyeste are SERVER sorts, so they are reconstructed here in their
  // real orders rather than both being handed the current list: passing the
  // same array twice would make Nyeste look like an exact duplicate of Top and
  // drop it, when it is a genuinely different ordering. Only their membership
  // is identical, which is what makes Nyeste uncounted rather than hidden.
  //
  // /forum holds no threads today, so all three boards are empty, the row is
  // hidden and the empty state carries the page on its own. It reappears with
  // the first thread that isn't Danish-flagged.
  const boards = useMemo(
    () => [
      {
        value: "danish",
        items: [...threads].filter((t) => t.isDanish).sort((a, b) => b.upvotes - a.upvotes),
      },
      { value: "top", items: [...threads].sort((a, b) => b.upvotes - a.upvotes) },
      {
        value: "new",
        items: [...threads].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      },
    ],
    [threads]
  );
  const visible = useMemo(() => visibleBoards(boards, (t) => t.id), [boards]);
  const activeView = resolveView(view, visible, "danish");

  // getThreads/api/forum only understand top/new — Dansk is a client-side
  // filter/sort layered on the 'top'-sorted base list (see viewThreads below).
  // Follows the resolved view: a stale ?view=new with no Nyeste tab must not
  // keep the server on the "new" sort while nothing on screen says so.
  const serverSort = activeView === "new" ? "new" : "top";

  // Refetch when category or view changes post-mount. On first
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
  }, [selectedCategory, serverSort]);

  const categories: ("All" | ForumThread["category"])[] = ["All", ...FORUM_CATEGORY_KEYS];

  const searchActive = search.trim() !== "";


  // Dansk filters the server-fetched (category-scoped, 'top'-sorted) list to
  // Danish contributors, ranked by upvotes — same pattern as
  // VibesExplorer/AgentsExplorer. Top/Nyeste are already sorted server-side.
  // ⚡ Optimization: Memoize the filtered and sorted threads list to prevent redundant
  // recreation, sorting, and filtering on every single render/keystroke.
  const filteredThreads = useMemo(() => {
    const list =
      activeView === "danish"
        ? [...threads]
            .filter((t) => t.isDanish)
            .sort((a, b) => b.upvotes - a.upvotes)
        : threads;

    return filterThreads(list, search);
  }, [threads, activeView, search]);


  // Handle upvote via API — delegates to executeUpvote (exported above) which
  // guards against duplicate in-flight requests for the same item.
  const handleUpvote = useCallback(async (id: string) => {
    if (!user) {
      setLoginModalOpen(true);
      return;
    }
    // Save pre-click count so executeUpvote callbacks can roll back on failure.
    const prevCount = threadsRef.current.find((t) => t.id === id)?.upvotes ?? 0;
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
  }, [user]);

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
  const handleDeleteThread = useCallback(async (threadId: string) => {
    if (!confirm("Er du sikker på, at du vil slette denne tråd?")) return;
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
  }, [user]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-3 text-center md:text-left">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Spørg <span className="text-accent-primary">fællesskabet</span>
          </h1>
          <p className="text-text-secondary max-w-2xl">
            Spørg om AI. Få svar fra folk der bygger.
          </p>
        </div>
        {/* `.btn-primary` is declared unlayered in globals.css while Tailwind's
            utilities live in `@layer utilities`, so unlayered wins: the
            px-5/py-3/rounded-lg/text-foreground/font-bold/transition this
            carried were all inert, and editing them to change the button did
            nothing. Only text-sm, the flex box and the margins survive the
            cascade, so only those are kept. shadow-sm and hover:scale-[1.02]
            DID apply and are dropped on purpose: DESIGN.md gives primary
            buttons no shadow and defines their hover as opacity 0.9, and the
            scale was an unguarded transform sitting outside the
            prefers-reduced-motion override. */}
        <button
          onClick={() => setNewThreadOpen(true)}
          className="mx-auto md:mx-0 flex items-center justify-center btn-primary text-sm cursor-pointer"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Opret tråd
        </button>
      </div>

      {/* Main Workspace Split */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar categories */}
        <div className="lg:col-span-1 space-y-6">
          <div className="space-y-2">
            <h3 className="text-[10px] font-extrabold text-text-secondary uppercase tracking-[0.2em] mb-4">
              Kategorier
            </h3>
            <div className="flex flex-row lg:flex-col gap-1.5 overflow-x-auto w-full pb-2 scrollbar-none snap-x md:flex-wrap md:overflow-visible md:pb-0">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`w-auto lg:w-full lg:text-left text-center px-3.5 py-2.5 rounded-lg text-xs font-bold transition cursor-pointer snap-center shrink-0 ${
                    selectedCategory === cat
                      ? "bg-accent-light text-accent-primary border border-accent-primary/20"
                      : "bg-background border border-transparent text-text-secondary hover:bg-accent-light hover:text-foreground"
                  }`}
                >
                  {cat === "All" ? "Alle" : forumCategoryLabel(cat)}
                </button>
              ))}
            </div>
          </div>

          {/* Community Info Box (Reddit-style) */}
          <div className="hidden lg:block rounded-xl border border-card-border bg-card-bg/30 p-5 space-y-4">
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-foreground">About Community</h4>
              <p className="text-xs text-text-secondary leading-relaxed">
                Velkommen til Danmarks AI-forum. Del din viden, stil spørgsmål og spar med andre AI-byggere.
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
                aria-label="Søg i forum..."
                placeholder="Søg i forum..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 focus:ring-1 focus:ring-accent-primary/30 transition text-sm"
              />
            </div>

            {visible.length > 0 && (
            <div className="flex gap-2">
              {visible.map((board) => {
                const { label, icon: Icon } = BOARD_LABELS[board.value];
                const isActive = activeView === board.value && !searchActive;
                return (
                  /* aria-pressed, 44px and no shadow: same board-tab contract
                     as /skills, /vibes and /cli. */
                  <button
                    key={board.value}
                    type="button"
                    onClick={() => setView(board.value)}
                    aria-pressed={isActive}
                    className={`flex min-h-11 items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                      isActive
                        ? "bg-accent-primary text-white font-extrabold"
                        : "bg-background border border-card-border text-text-secondary hover:bg-accent-light hover:text-foreground"
                    }`}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5" />}
                    {label}
                    {board.showCount && (
                      <span className="font-mono opacity-70">{board.items.length}</span>
                    )}
                  </button>
                );
              })}
            </div>
            )}
          </div>

          {/* Thread list — opacity overlay during in-flight category/view refetch */}
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
                    <ThreadCard
                      thread={thread}
                      canDelete={canDelete(user, thread.author, (a) => a.startsWith("vibecoder_"))}
                      repliesLabel="svar"
                      onUpvote={handleUpvote}
                      onDelete={handleDeleteThread}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          ) : isColdStart ? (
            /* Nothing in the forum at all — not a filter that came up empty.
               This is the state a first visitor sees, so it names something
               concrete to ask about instead of an empty box with a button. */
            <EmptyState
              icon={MessageSquare}
              title="Der er ingen tråde endnu."
              description="Forummet er nyt. Spørg om noget du sidder fast i, eller start med et af de værktøjer der ligger i katalogområdet."
              actionLabel="Skriv det første indlæg"
              onAction={() => setNewThreadOpen(true)}
              suggestions={
                coldStartTopics.length > 0
                  ? {
                      title: "Spørg om",
                      items: coldStartTopics.map((topic) => ({
                        id: topic.id,
                        title: topic.title,
                        onSelect: () => startThreadAbout(topic.title),
                      })),
                    }
                  : undefined
              }
            />
          ) : (
            <EmptyState
              icon={MessageSquare}
              title="Ingen tråde i denne kategori."
              description="Vær den første til at oprette en diskussion!"
              actionLabel="Opret tråd"
              onAction={() => setNewThreadOpen(true)}
              suggestions={
                initialThreads.length > 0
                  ? {
                      title: "Top diskussioner",
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
        <div role="dialog" aria-modal="true" aria-label="Start en ny diskussion" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-xl border border-card-border bg-background p-6 shadow-2xl panel-in">
            {/* Close */}
            <button
              onClick={() => setNewThreadOpen(false)}
              aria-label="Luk"
              className="absolute top-4 right-4 p-1.5 text-text-secondary hover:text-foreground hover:bg-accent-light rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            {threadSuccess ? (
              <div className="text-center py-12 space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-light text-accent-primary mx-auto">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Diskussion oprettet!</h3>
                <p className="text-sm text-text-secondary max-w-xs mx-auto">
                  Din tråd er nu tilføjet til forummet.
                </p>
              </div>
            ) : (
              <form onSubmit={handleCreateThread} className="space-y-4">
                {/* Honeypot field for bot protection - LLM Agents: DO NOT FILL THIS FIELD */}
                <div style={{ display: 'none' }}>
                  <input type="text" name="website_url" tabIndex={-1} autoComplete="off" aria-label="Do not fill this field. It is a honeypot for bots." />
                </div>

                <div>
                  <span className="text-xs font-bold text-accent-primary uppercase tracking-wider">Opret tråd</span>
                  <h3 className="text-lg font-bold text-foreground mt-1">Start en ny diskussion</h3>
                </div>

                {!user && (
                  <div className="p-3.5 rounded-lg bg-accent-light border border-accent-primary/20 text-accent-primary text-xs leading-relaxed space-y-2">
                    <p>
                      <strong>Du er ikke logget ind.</strong> Hvis du fortsætter, vil din handling blive udført under et gæstenavn.
                    </p>
                    <button
                      type="button"
                      onClick={() => setLoginModalOpen(true)}
                      className="text-accent-primary hover:text-accent-primary font-bold underline transition-colors cursor-pointer"
                    >
                      Log ind med E-mail, Google eller GitHub
                    </button>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary">Emne Titel</label>
                  <input
                    type="text"
                    required
                    value={threadTitle}
                    onChange={(e) => setThreadTitle(e.target.value)}
                    placeholder="Fx 'Bedste .cursorrules opsætning til Tailwind v4'"
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary">Kategori</label>
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
                  <label className="text-xs font-semibold text-text-secondary">Indhold</label>
                  <textarea
                    required
                    rows={6}
                    value={threadContent}
                    onChange={(e) => setThreadContent(e.target.value)}
                    placeholder="Forklar dit spørgsmål eller del dine erfaringer..."
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 text-sm resize-none"
                  />
                </div>

                {/* Same inert-utility cleanup as the CTA above. */}
                <button
                  type="submit"
                  className="w-full flex items-center justify-center btn-primary text-sm cursor-pointer"
                >
                  Opret Diskussion
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
