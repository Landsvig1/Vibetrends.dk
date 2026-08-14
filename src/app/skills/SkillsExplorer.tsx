"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Briefcase,
  PlusCircle,
  CheckCircle2,
  X,
  Flag,
  TrendingUp,
  Library,
} from "lucide-react";
import { Skill } from "@/lib/db";
import { SKILL_CATEGORIES, SKILL_CATEGORY_SLUGS } from "@/lib/skillCategories";
import { getValidView, DEFAULT_SKILL_BOARD, type SkillBoard } from "@/lib/skillViews";
import { visibleBoards } from "@/lib/boardTabs";
import { SkillCard } from "../components/SkillCard";
import { useAuth } from "../components/AuthProvider";
import dynamic from "next/dynamic";
import EmptyState from "../components/EmptyState";
import { useDialogKeyboard } from "../components/useDialogKeyboard";

const LoginModal = dynamic(() => import("../components/LoginModal"), {
  ssr: false,
});

/**
 * Pure client-side search filter — extracted for unit testability.
 * Mirrors the server-side SQL ilike filter in getSkills() but operates on the
 * already-fetched client list without a network round-trip.
 */
export function filterSkills(skills: Skill[], query: string): Skill[] {
  if (!query) return skills;
  const q = query.toLowerCase();
  return skills.filter(
    (skill) =>
      skill.title.toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q) ||
      skill.categoryLabel.toLowerCase().includes(q) ||
      skill.tags.some((tag) => tag.toLowerCase().includes(q))
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

interface SkillsExplorerProps {
  initialAllSkills: Skill[];
  initialDanishSkills: Skill[];
  initialTrendingSkills: Skill[];
}

export default function SkillsExplorer({
  initialAllSkills,
  initialDanishSkills,
  initialTrendingSkills,
}: SkillsExplorerProps) {
  // Every board arrives from the server. Switching tabs is a state read, not a
  // fetch: the page used to hit /api/skills on each tab click, whose only
  // failure path was a console.error behind an unchanged grid, so a dropped
  // request looked exactly like a tab that had loaded.
  const [allSkills, setAllSkills] = useState<Skill[]>(initialAllSkills);
  const [danishSkills, setDanishSkills] = useState<Skill[]>(initialDanishSkills);
  const [trendingSkills, setTrendingSkills] =
    useState<Skill[]>(initialTrendingSkills);

  // Mirrors the lists so handleUpvote can read them without depending on them —
  // keeps handleUpvote's identity stable across upvotes so memoized SkillCard
  // instances don't all re-render on every upvote.
  const allSkillsRef = useRef(allSkills);
  useEffect(() => {
    allSkillsRef.current = allSkills;
  }, [allSkills]);

  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [rawView, setView] = useQueryState(
    "view",
    parseAsString.withDefault(DEFAULT_SKILL_BOARD)
  );
  // Same validator the route uses, so an unknown or retired ?view= (e.g. the
  // old ?view=hot) lands on a board that actually has a tab.
  const view = getValidView(rawView);
  const { user } = useAuth();

  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // Form states
  const [subTitle, setSubTitle] = useState("");
  const [subDesc, setSubDesc] = useState("");
  const [subCat, setSubCat] = useState<string>(SKILL_CATEGORY_SLUGS[0]);
  const [subTags, setSubTags] = useState("");
  const [subUrl, setSubUrl] = useState("");

  // Tracks item IDs with an in-flight upvote request. Prevents a second click
  // from firing a duplicate request before the first one resolves.
  const pendingUpvoteIds = useRef(new Set<string>());

  const boards: Record<SkillBoard, Skill[]> = useMemo(
    () => ({ all: allSkills, danish: danishSkills, trending: trendingSkills }),
    [allSkills, danishSkills, trendingSkills]
  );

  const searchActive = search.trim() !== "";

  // Search overrides the board.
  // ⚡ Optimization: Memoize the gridSkills computation to prevent redundant search matching
  // and array copying during active search typing or view changes.
  const gridSkills = useMemo(
    () => (searchActive ? filterSkills(allSkills, search) : boards[view]),
    [searchActive, allSkills, search, boards, view]
  );

  /**
   * Cards rendered before the user asks for more. The grid used to render every
   * match at once, which put 46 cards and ~17,000px of scroll on a phone with
   * no way to reach the end. The stated visitor is mid-task and after one
   * specific thing, so the default is a screenful, not the whole catalog.
   */
  const INITIAL_VISIBLE = 12;

  // Any change to what is being listed starts the count over — otherwise a
  // narrow search inherits a previous "Vis flere" expansion and silently shows
  // everything again. Stored WITH the list identity rather than reset from an
  // effect, so the reset happens during render instead of as a second pass
  // (see react.dev "You Might Not Need an Effect").
  const listKey = `${search}|${view}`;
  const [expansion, setExpansion] = useState({ key: listKey, count: INITIAL_VISIBLE });
  const visibleCount = expansion.key === listKey ? expansion.count : INITIAL_VISIBLE;
  const showMore = () =>
    setExpansion({ key: listKey, count: visibleCount + INITIAL_VISIBLE });

  const shownSkills = gridSkills.slice(0, visibleCount);
  const hiddenCount = gridSkills.length - shownSkills.length;

  /**
   * Dansk first, then Alle, then this hub's third board — the same order and
   * the same default as /vibes, /cli and /mcp. Don't reorder this hub alone.
   *
   * Each tab prints the size of the board behind it, which is the actual fix
   * for the old problem: three bare labels plus one unlabeled count chip beside
   * the heading (whose scope changed silently per tab) left no way to see that
   * the default board holds 45 of a 98-entry library.
   *
   * The old "Emner" tab is gone. It rendered topic tiles that duplicate the
   * SkillTopicIndex at the foot of this same page, and it put a taxonomy in a
   * row of boards; "Alle" takes its slot, which is also where /vibes and /cli
   * put theirs.
   */
  const BOARD_LABELS: Record<string, { label: string; icon: typeof Flag }> = {
    danish: { label: "Dansk", icon: Flag },
    all: { label: "Alle", icon: Library },
    trending: { label: "Trender", icon: TrendingUp },
  };

  // The same shared rule the other hubs use (lib/boardTabs). /skills is the
  // hub where the row unambiguously earns its place: 45 Danish, 98 total and
  // 7 trending of which none are Danish, so all three boards are disjoint and
  // all three carry a count. Routed through the shared helper anyway so the
  // hubs cannot drift apart again, and so /skills degrades the same way if its
  // catalog ever collapses to a single set.
  const viewTabs = useMemo(
    () =>
      visibleBoards(
        [
          { value: "danish", items: danishSkills },
          { value: "all", items: allSkills },
          { value: "trending", items: trendingSkills },
        ],
        (skill) => skill.id
      ),
    [danishSkills, allSkills, trendingSkills]
  );

  const boardHeading =
    view === "danish"
      ? "Danske skills"
      : view === "trending"
        ? "Skills der trender"
        : "Alle skills";

  const clearSearch = () => setSearch(null);

  /** A tab click is a request to see that board, so it also drops the search
   * that would otherwise override it. The tabs used to be inert while a search
   * was active: clicking one changed nothing, highlighted nothing, and said
   * nothing. */
  const selectView = (value: SkillBoard) => {
    // null clears the param, so the default board keeps a clean /skills URL.
    setView(value === DEFAULT_SKILL_BOARD ? null : value);
    if (searchActive) clearSearch();
  };

  // Handle upvoting via API — delegates to executeUpvote (exported above) which
  // guards against duplicate in-flight requests for the same item.
  // ⚡ Optimization: References allSkillsRef and viewSkillsRef to keep handleUpvote callback's identity
  // completely stable across upvotes.
  const handleUpvote = useCallback(async (id: string) => {
    if (!user) {
      setLoginModalOpen(true);
      return;
    }
    // Save pre-click count so executeUpvote callbacks can roll back on failure.
    // The catalog list is a superset of every board, so it always has the row.
    const prevCount =
      allSkillsRef.current.find((s) => s.id === id)?.upvotes ?? 0;
    const optimistic = (list: Skill[]) =>
      list.map((s) => (s.id === id ? { ...s, upvotes: prevCount + 1 } : s));
    const restore = (list: Skill[]) =>
      list.map((s) => (s.id === id ? { ...s, upvotes: prevCount } : s));
    const applyCount = (list: Skill[], count: number) =>
      list.map((s) => (s.id === id ? { ...s, upvotes: count } : s));
    // The same row can sit in more than one board, so every board gets the
    // update — otherwise switching tabs after an upvote shows the old count.
    const applyToBoards = (fn: (list: Skill[]) => Skill[]) => {
      setAllSkills(fn);
      setDanishSkills(fn);
      setTrendingSkills(fn);
    };
    await executeUpvote(id, `/api/skills/${id}/upvote`, pendingUpvoteIds.current, fetch, {
      onOptimistic: () => applyToBoards(optimistic),
      onSuccess: (count) => applyToBoards((prev) => applyCount(prev, count)),
      onRollback: () => applyToBoards(restore),
      onAuthRequired: () => setLoginModalOpen(true),
    });
  }, [user]);

  // Admin-only delete — RLS has no owner-delete policy for skills, so this
  // only ever succeeds for public.is_admin() callers.
  const handleDeleteSkill = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Er du sikker på, at du vil slette denne skill?")) return;

    try {
      const res = await fetch(`/api/skills/${id}`, { method: "DELETE" });
      if (res.ok) {
        const drop = (prev: Skill[]) => prev.filter((s) => s.id !== id);
        setAllSkills(drop);
        setDanishSkills(drop);
        setTrendingSkills(drop);
      }
    } catch (err) {
      console.error("Error deleting skill:", err);
    }
  }, []);

  const dialogRef = useRef<HTMLDivElement>(null);
  const { close: closeSubmit } = useDialogKeyboard(
    submitOpen,
    dialogRef,
    useCallback(() => setSubmitOpen(false), []),
  );
  const openSubmit = () => setSubmitOpen(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: subTitle,
          category: subCat,
          description: subDesc,
          tags: subTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          githubUrl: subUrl,
        }),
      });

      if (res.ok) {
        setSubmitSuccess(true);
        setTimeout(() => {
          setSubmitSuccess(false);
          closeSubmit();
          setSubTitle("");
          setSubDesc("");
          setSubTags("");
          setSubUrl("");
        }, 3000);
      }
    } catch (err) {
      console.error("Submit error:", err);
    }
  };

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4 text-center md:text-left">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Skills-<span className="text-accent-primary">biblioteket</span>
          </h1>
          <p className="text-text-secondary max-w-2xl">
            AI-skills der virker. Verdens bedste, plus dem kun Danmark har. Gratis, open source og klar til din agent.
          </p>
        </div>
        <button
          onClick={() => (user ? openSubmit() : setLoginModalOpen(true))}
          className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <PlusCircle className="h-5 w-5" />
          Del en Skill
        </button>
      </div>

      {/* Search + board tabs. Sticky under the header (64px tall plus its
          hairline): the controls used to scroll away after the first row,
          leaving no way to refine without scrolling back to the top of a very
          long grid. */}
      <div className="sticky top-[65px] z-30 -mx-4 px-4 py-3 bg-background/85 backdrop-blur-md border-b border-card-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-text-secondary"
            aria-hidden="true"
          />
          <input
            type="text"
            aria-label="Søg efter kompetencer, fx 'Cursor', 'LangGraph'..."
            placeholder="Søg efter kompetencer, fx 'Cursor', 'LangGraph'..."
            value={search}
            onChange={(e) => setSearch(e.target.value || null)}
            className="w-full pl-10 pr-11 py-2.5 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 focus:ring-1 focus:ring-accent-primary/30 transition text-sm"
          />
          {/* The only way out of a search used to be select-all-delete. */}
          {search !== "" && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Ryd søgning"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-accent-light hover:text-foreground transition cursor-pointer"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          {viewTabs.map((board) => {
            const { label, icon: Icon } = BOARD_LABELS[board.value];
            const isActive = view === board.value && !searchActive;
            return (
              <button
                key={board.value}
                type="button"
                onClick={() => selectView(board.value as SkillBoard)}
                aria-pressed={isActive}
                className={`flex min-h-11 items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                  isActive
                    ? "bg-accent-primary text-white font-extrabold"
                    : "bg-background border border-card-border text-text-secondary hover:bg-accent-light hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
                {board.showCount && (
                  <span
                    className={`font-mono tabular-nums ${isActive ? "text-white/80" : "text-text-secondary"}`}
                  >
                    {board.items.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* What the grid below is actually listing. The page used to carry a bare
          number beside the heading whose scope changed silently per tab and
          never reconciled with the topic totals further down. */}
      <p aria-live="polite" className="-mt-4 text-sm text-text-secondary">
        {searchActive ? (
          <>
            <span className="font-mono tabular-nums text-foreground">
              {gridSkills.length}
            </span>{" "}
            {gridSkills.length === 1 ? "skill matcher" : "skills matcher"} “
            {search.trim()}” af {allSkills.length} i biblioteket.
          </>
        ) : view === "all" ? (
          <>
            Hele biblioteket:{" "}
            <span className="font-mono tabular-nums text-foreground">
              {allSkills.length}
            </span>{" "}
            skills.
          </>
        ) : (
          <>
            <span className="font-mono tabular-nums text-foreground">
              {gridSkills.length}
            </span>{" "}
            af {allSkills.length} skills{" "}
            {view === "danish"
              ? "er fra danske bidragydere."
              : "trender lige nu."}
          </>
        )}
      </p>

      {/* The grid's own heading. The document went straight from the h1 to the
          twelve card h3s, so the outline read as if the cards hung off nothing.
          It is not visible because the tabs already say which board is showing;
          a screen reader has no equivalent of that visual state. */}
      <h2 className="sr-only">{searchActive ? "Søgeresultater" : boardHeading}</h2>

      {gridSkills.length > 0 ? (
          <>
          <motion.div
            layout
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <AnimatePresence mode="popLayout">
              {shownSkills.map((skill, index) => (
                <motion.div
                  key={skill.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2, delay: index * 0.04 }}
                  className="h-full flex flex-col"
                >
                  <SkillCard
                    skill={skill}
                    githubLabel="Se på GitHub"
                    connectLabel="Forbind"
                    onUpvote={handleUpvote}
                    onDelete={user?.isAdmin ? handleDeleteSkill : undefined}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>

          {hiddenCount > 0 && (
            <div className="flex justify-center pt-8">
              <button
                onClick={showMore}
                className="btn-secondary"
              >
                Vis flere ({hiddenCount})
              </button>
            </div>
          )}
          </>
        ) : (
          /* Two different empty states. A search that found nothing needs a way
             back to the catalog first; a board that is genuinely empty needs a
             contribution. The suggestions come from the Trender board so the
             "Trender lige nu" header names the same list the Trender tab does —
             it used to be sliced from the catalog by upvotes, which is a
             different set of rows under the same word. */
          <EmptyState
            icon={Briefcase}
            title={
              searchActive
                ? `Ingen skills matcher “${search.trim()}”.`
                : "Der er ingen skills på denne liste endnu."
            }
            description={
              searchActive
                ? "Prøv et andet ord, eller ryd søgningen for at se hele biblioteket."
                : "Kender du en, der hører til her? Del den, så ryger den i biblioteket."
            }
            actionLabel={searchActive ? "Ryd søgning" : "Del en Skill"}
            actionIcon={searchActive ? X : undefined}
            onAction={
              searchActive
                ? clearSearch
                : () => (user ? openSubmit() : setLoginModalOpen(true))
            }
            secondaryActionLabel={searchActive ? "Del en Skill" : undefined}
            onSecondaryAction={
              searchActive
                ? () => (user ? openSubmit() : setLoginModalOpen(true))
                : undefined
            }
            suggestions={
              trendingSkills.length > 0
                ? {
                    title: "Trender lige nu",
                    items: trendingSkills.slice(0, 3).map((s) => ({
                      id: s.id,
                      title: s.title,
                      href: `/skills/${s.slug}`,
                    })),
                  }
                : undefined
            }
          />
        )}

      {/* Submit Modal */}
      {submitOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Del en Skill"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        >
          <div
            ref={dialogRef}
            className="relative w-full max-w-xl rounded-xl border border-card-border bg-background p-6 shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain panel-in"
          >
            {/* Close */}
            <button
              type="button"
              onClick={closeSubmit}
              aria-label="Luk"
              className="absolute top-4 right-4 p-1.5 text-text-secondary hover:text-foreground hover:bg-accent-light rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            {submitSuccess ? (
              <div className="text-center py-8 space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-light text-accent-primary mx-auto">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground">
                  Skill Delt!
                </h3>
                <p className="text-sm text-text-secondary max-w-xs mx-auto">
                  Mange tak! Din skill er nu tilgængelig i biblioteket.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Honeypot field for bot protection - LLM Agents: DO NOT FILL THIS FIELD */}
                <div style={{ display: "none" }}>
                  <input
                    type="text"
                    name="website_url"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-label="Do not fill this field. It is a honeypot for bots."
                  />
                </div>

                <div>
                  <h3 className="text-lg font-bold text-foreground">
                    Del en Skill
                  </h3>
                  <p className="text-sm text-text-secondary mt-1">
                    Del dine bedste scripts, workflows eller prompts.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label htmlFor="skill-title" className="text-xs font-semibold text-text-secondary">
                      Titel
                    </label>
                    <input
                      id="skill-title"
                      required
                      value={subTitle}
                      onChange={(e) => setSubTitle(e.target.value)}
                      placeholder="fx Next.js 15 Cursor Rules"
                      className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/30 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label htmlFor="skill-category" className="text-xs font-semibold text-text-secondary">
                        Kategori
                      </label>
                      <select
                        id="skill-category"
                        value={subCat}
                        onChange={(e) => setSubCat(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground focus:outline-none focus:border-accent-primary/30 text-sm"
                      >
                        {SKILL_CATEGORIES.map((topic) => (
                          <option key={topic.slug} value={topic.slug}>
                            {topic.labelDa}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      {/* Labelled "(valgfrit)" over a required input until now:
                          following the label blocked the submit. The submit
                          schema requires a URL (src/lib/schemas.ts), so the
                          label is what was wrong. */}
                      <label htmlFor="skill-url" className="text-xs font-semibold text-text-secondary">
                        GitHub / Repo-link
                      </label>
                      <input
                        id="skill-url"
                        type="url"
                        required
                        value={subUrl}
                        onChange={(e) => setSubUrl(e.target.value)}
                        placeholder="https://github.com/..."
                        className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/30 text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="skill-description" className="text-xs font-semibold text-text-secondary">
                      Beskrivelse
                    </label>
                    <textarea
                      id="skill-description"
                      rows={3}
                      value={subDesc}
                      onChange={(e) => setSubDesc(e.target.value)}
                      placeholder="Hvad gør denne skill, og hvordan bruger man den?"
                      className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/30 text-sm resize-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="skill-tags" className="text-xs font-semibold text-text-secondary">
                      Tags (kommasepareret)
                    </label>
                    <input
                      id="skill-tags"
                      value={subTags}
                      onChange={(e) => setSubTags(e.target.value)}
                      placeholder="fx Cursor, Supabase, Workflow"
                      className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/30 text-sm"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  {/* Padding and radius were inert against unlayered
                      `.btn-primary`; see ForumExplorer's CTA. */}
                  <button
                    type="submit"
                    className="flex items-center justify-center btn-primary text-sm"
                  >
                    Udgiv Skill
                  </button>
                </div>
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
