"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryState, parseAsString } from "nuqs";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Briefcase,
  PlusCircle,
  CheckCircle2,
  X,
  Flag,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { Skill } from "@/lib/db";
import { SKILL_CATEGORIES, SKILL_CATEGORY_SLUGS } from "@/lib/skillCategories";
import { TopicIcon } from "../components/TopicIcon";
import { SkillCard } from "../components/SkillCard";
import { useAuth } from "../components/AuthProvider";
import { useLanguage } from "../components/LanguageProvider";
import dynamic from "next/dynamic";
import EmptyState from "../components/EmptyState";

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
  initialViewSkills: Skill[];
}

export default function SkillsExplorer({
  initialAllSkills,
  initialViewSkills,
}: SkillsExplorerProps) {
  // Full catalog — drives search and per-topic counts.
  const [allSkills, setAllSkills] = useState<Skill[]>(initialAllSkills);
  // View-specific board — danish/hot/trending grid.
  const [viewSkills, setViewSkills] = useState<Skill[]>(initialViewSkills);
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [view, setView] = useQueryState(
    "view",
    parseAsString.withDefault("danish")
  );
  const { user } = useAuth();
  const { language, t } = useLanguage();

  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // In-flight view/language refetch loading affordance — keeps the current
  // grid visible at reduced opacity rather than replacing it with a skeleton.
  const [isRefetchingAll, setIsRefetchingAll] = useState(false);
  const [isRefetchingView, setIsRefetchingView] = useState(false);
  const isRefetching = isRefetchingAll || isRefetchingView;

  // Form states
  const [subTitle, setSubTitle] = useState("");
  const [subDesc, setSubDesc] = useState("");
  const [subCat, setSubCat] = useState<string>(SKILL_CATEGORY_SLUGS[0]);
  const [subTags, setSubTags] = useState("");
  const [subUrl, setSubUrl] = useState("");

  // Skip the first mount fetches — the server already fetched with the initial
  // lang/view and passed real data as initialAllSkills / initialViewSkills.
  // Only refetch when language or view actually changes post-mount.
  const skipAllSkillsFetch = useRef(true);
  const skipViewSkillsFetch = useRef(true);

  // Tracks item IDs with an in-flight upvote request. Prevents a second click
  // from firing a duplicate request before the first one resolves.
  const pendingUpvoteIds = useRef(new Set<string>());

  // Refetch full catalog when language changes post-mount.
  useEffect(() => {
    if (skipAllSkillsFetch.current) {
      skipAllSkillsFetch.current = false;
      return;
    }
    // no-store: the route's public max-age header is for external API
    // consumers; the interactive page must always read fresh counts, or a
    // reload right after upvoting shows the pre-vote cached response.
    setIsRefetchingAll(true);
    fetch("/api/skills", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setAllSkills(data);
        setIsRefetchingAll(false);
      })
      .catch((err) => {
        console.error("Error fetching skills:", err);
        setIsRefetchingAll(false);
      });
  }, [language]);

  // Refetch view-specific board when view or language changes post-mount.
  useEffect(() => {
    const isFirstMount = skipViewSkillsFetch.current;
    skipViewSkillsFetch.current = false;
    const isBoardView = view === "danish" || view === "hot" || view === "trending";
    if (isFirstMount || !isBoardView) {
      return;
    }

    setIsRefetchingView(true);
    fetch(`/api/skills?view=${view}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setViewSkills(data);
        setIsRefetchingView(false);
      })
      .catch((err) => {
        console.error("Error fetching skills:", err);
        setIsRefetchingView(false);
      });
  }, [view, language]);

  // Per-topic counts from the full catalog (not the filtered board).
  const counts = SKILL_CATEGORIES.reduce<Record<string, number>>((acc, topic) => {
    acc[topic.slug] = allSkills.filter((s) => s.category === topic.slug).length;
    return acc;
  }, {});

  const searchActive = search.trim() !== "";

  // Search overrides the view. Otherwise danish/hot/trending render their
  // board and "all" shows the topic cards.
  const gridSkills = searchActive
    ? filterSkills(allSkills, search)
    : view === "danish" || view === "hot" || view === "trending"
      ? viewSkills
      : [];
  const showTopicCards = !searchActive && view === "all";

  const viewTabs: {
    value: string;
    label: string;
    icon: typeof Flag | null;
  }[] = [
    {
      value: "danish",
      label: language === "da" ? "Dansk" : "Danish",
      icon: Flag,
    },
    { value: "all", label: language === "da" ? "Emner" : "Topics", icon: null },
    {
      value: "trending",
      label: language === "da" ? "Trender" : "Trending",
      icon: TrendingUp,
    },
  ];

  // Handle upvoting via API — delegates to executeUpvote (exported above) which
  // guards against duplicate in-flight requests for the same item.
  const handleUpvote = useCallback(async (id: string) => {
    if (!user) {
      setLoginModalOpen(true);
      return;
    }
    // Save pre-click count so executeUpvote callbacks can roll back on failure.
    const prevCount =
      allSkills.find((s) => s.id === id)?.upvotes ??
      viewSkills.find((s) => s.id === id)?.upvotes ??
      0;
    const optimistic = (list: Skill[]) =>
      list.map((s) => (s.id === id ? { ...s, upvotes: prevCount + 1 } : s));
    const restore = (list: Skill[]) =>
      list.map((s) => (s.id === id ? { ...s, upvotes: prevCount } : s));
    const applyCount = (list: Skill[], count: number) =>
      list.map((s) => (s.id === id ? { ...s, upvotes: count } : s));
    await executeUpvote(id, `/api/skills/${id}/upvote`, pendingUpvoteIds.current, fetch, {
      onOptimistic: () => { setAllSkills(optimistic); setViewSkills(optimistic); },
      onSuccess: (count) => {
        setAllSkills((prev) => applyCount(prev, count));
        setViewSkills((prev) => applyCount(prev, count));
      },
      onRollback: () => { setAllSkills(restore); setViewSkills(restore); },
      onAuthRequired: () => setLoginModalOpen(true),
    });
  }, [user, allSkills, viewSkills]);

  // Admin-only delete — RLS has no owner-delete policy for skills, so this
  // only ever succeeds for public.is_admin() callers.
  const handleDeleteSkill = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t("skills.confirm_delete"))) return;

    try {
      const res = await fetch(`/api/skills/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAllSkills((prev) => prev.filter((s) => s.id !== id));
        setViewSkills((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (err) {
      console.error("Error deleting skill:", err);
    }
  }, [t]);

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
          setSubmitOpen(false);
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
            Skills{" "}
            <span className="text-accent-primary">
              {language === "da" ? "Bibliotek" : "Library"}
            </span>
          </h1>
          <p className="text-text-secondary max-w-2xl">{t("skills.desc")}</p>
        </div>
        <button
          onClick={() => (user ? setSubmitOpen(true) : setLoginModalOpen(true))}
          className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <PlusCircle className="h-5 w-5" />
          {t("skills.btn_share")}
        </button>
      </div>

      {/* Search + view tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-text-secondary"
            aria-hidden="true"
          />
          <input
            type="text"
            aria-label={t("skills.search")}
            placeholder={t("skills.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 focus:ring-1 focus:ring-accent-primary/30 transition text-sm"
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
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Topic cards (default "all" view) */}
      {showTopicCards && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {SKILL_CATEGORIES.map((topic) => (
            <Link
              key={topic.slug}
              href={`/skills/topic/${topic.slug}`}
              className="group relative rounded-xl glass-card p-6 flex flex-col gap-4 hover:-translate-y-0.5 transition"
            >
              <div className="flex items-center justify-between">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: `${topic.accent}1a`,
                    color: topic.accent,
                  }}
                >
                  <TopicIcon name={topic.icon} className="h-5 w-5" />
                </div>
                <span className="text-xs font-mono text-text-secondary">
                  {counts[topic.slug] ?? 0}
                </span>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-foreground group-hover:text-accent-primary transition-colors">
                  {language === "da" ? topic.labelDa : topic.labelEn}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {language === "da" ? topic.descDa : topic.descEn}
                </p>
              </div>
              <span className="inline-flex items-center text-xs font-semibold text-accent-primary mt-auto">
                {language === "da" ? "Udforsk" : "Explore"}
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Skill grid (search / Dansk / Trending) — opacity overlay during refetch */}
      {!showTopicCards &&
        (gridSkills.length > 0 ? (
          <motion.div
            layout
            className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-opacity duration-200 ${
              isRefetching ? "opacity-50 pointer-events-none" : ""
            }`}
          >
            <AnimatePresence mode="popLayout">
              {gridSkills.map((skill, index) => (
                <motion.div
                  key={skill.id}
                  layout
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2, delay: index * 0.04 }}
                >
                  <SkillCard
                    skill={skill}
                    githubLabel={t("skills.github")}
                    connectLabel={t("skills.connect")}
                    onUpvote={handleUpvote}
                    onDelete={user?.isAdmin ? handleDeleteSkill : undefined}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <EmptyState
            icon={Briefcase}
            title={t("skills.empty")}
            description={t("skills.empty_sub")}
            actionLabel={t("skills.btn_share")}
            onAction={() => (user ? setSubmitOpen(true) : setLoginModalOpen(true))}
            suggestions={
              searchActive && initialAllSkills.length > 0
                ? {
                    title: language === "da" ? "Trender lige nu" : "Trending now",
                    items: initialAllSkills.slice(0, 3).map((s) => ({
                      id: s.id,
                      title: s.title,
                      href: `/skills/${s.id}`,
                    })),
                  }
                : undefined
            }
          />
        ))}

      {/* Submit Modal */}
      {submitOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("skills.modal.title")}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-xl rounded-xl border border-card-border bg-background p-6 shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain animate-in fade-in duration-200">
            {/* Close */}
            <button
              onClick={() => setSubmitOpen(false)}
              aria-label="Luk"
              className="absolute top-4 right-4 p-1.5 text-text-secondary hover:text-foreground hover:bg-card-border rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            {submitSuccess ? (
              <div className="text-center py-8 space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-light text-accent-primary mx-auto">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground">
                  {t("skills.modal.success_title")}
                </h3>
                <p className="text-sm text-text-secondary max-w-xs mx-auto">
                  {t("skills.modal.success_desc")}
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
                    {t("skills.modal.title")}
                  </h3>
                  <p className="text-sm text-text-secondary mt-1">
                    {t("skills.modal.desc")}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-text-secondary">
                      {t("skills.modal.label_title")}
                    </label>
                    <input
                      required
                      value={subTitle}
                      onChange={(e) => setSubTitle(e.target.value)}
                      placeholder={t("skills.modal.placeholder_title")}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/30 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-text-secondary">
                        {t("skills.modal.label_category")}
                      </label>
                      <select
                        value={subCat}
                        onChange={(e) => setSubCat(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground focus:outline-none focus:border-accent-primary/30 text-sm"
                      >
                        {SKILL_CATEGORIES.map((topic) => (
                          <option key={topic.slug} value={topic.slug}>
                            {language === "da" ? topic.labelDa : topic.labelEn}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-text-secondary">
                        {t("skills.modal.label_github")}
                      </label>
                      <input
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
                    <label className="text-xs font-semibold text-text-secondary">
                      {t("skills.modal.label_desc")}
                    </label>
                    <textarea
                      rows={3}
                      value={subDesc}
                      onChange={(e) => setSubDesc(e.target.value)}
                      placeholder={t("skills.modal.placeholder_desc")}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/30 text-sm resize-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-text-secondary">
                      {t("skills.modal.label_tags")}
                    </label>
                    <input
                      value={subTags}
                      onChange={(e) => setSubTags(e.target.value)}
                      placeholder={t("skills.modal.placeholder_tags")}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/30 text-sm"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="submit"
                    className="flex items-center justify-center px-6 py-2.5 rounded-lg btn-primary text-sm"
                  >
                    {t("skills.modal.btn_submit")}
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
