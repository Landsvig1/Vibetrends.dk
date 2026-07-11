"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryState, parseAsString } from "nuqs";
import { Search, Heart, Code, Sparkles, PlusCircle, CheckCircle2, X, Trash2, Info, Flag, Flame } from "lucide-react";
import { ShowcaseProject } from "@/lib/db";
import { parseGithubRepoUrl } from "@/lib/github";
import { useAuth } from "../components/AuthProvider";
import { useLanguage } from "../components/LanguageProvider";
import dynamic from "next/dynamic";
import EmptyState from "../components/EmptyState";

const LoginModal = dynamic(() => import("../components/LoginModal"), { ssr: false });

/**
 * Pure client-side search filter — extracted for unit testability.
 * Mirrors the server-side SQL ilike filter in getProjects() but operates on
 * the already-fetched client list without a network round-trip.
 */
export function filterProjects(projects: ShowcaseProject[], query: string): ShowcaseProject[] {
  if (!query) return projects;
  const q = query.toLowerCase();
  return projects.filter(
    (project) =>
      project.title.toLowerCase().includes(q) ||
      project.description.toLowerCase().includes(q) ||
      project.tools.some((t) => t.toLowerCase().includes(q))
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

interface VibesExplorerProps {
  initialProjects: ShowcaseProject[];
}

export default function VibesExplorer({ initialProjects }: VibesExplorerProps) {
  const [projects, setProjects] = useState<ShowcaseProject[]>(initialProjects);
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [view, setView] = useQueryState("view", parseAsString.withDefault("danish"));
  const [submitParam, setSubmitParam] = useQueryState("submit", parseAsString.withDefault(""));
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // In-flight sort/language refetch loading affordance — keeps the current
  // grid visible at reduced opacity rather than replacing it with a skeleton.
  const [isRefetching, setIsRefetching] = useState(false);

  // Submit modal states
  const [submitOpen, setSubmitOpen] = useState(false);
  const [subTitle, setSubTitle] = useState("");
  const [subDesc, setSubDesc] = useState("");
  const [subDemo, setSubDemo] = useState("");
  const [subGithub, setSubGithub] = useState("");
  const [subSuccess, setSubSuccess] = useState(false);
  const [githubFetching, setGithubFetching] = useState(false);
  const subGithubRef = useRef(subGithub);
  const lastFetchedGithubUrl = useRef<string | null>(null);
  useEffect(() => {
    subGithubRef.current = subGithub;
  }, [subGithub]);

  // Skip the first mount fetch — the server already fetched with the initial
  // sort/lang and passed real data as initialProjects. Only refetch when
  // language or sort actually changes post-mount.
  const skipNextFetch = useRef(true);

  // Tracks item IDs with an in-flight upvote request. Prevents a second click
  // from firing a duplicate request before the first one resolves.
  const pendingUpvoteIds = useRef(new Set<string>());

  // Best-effort prefill: pull title + description from GitHub's public repo
  // API via our own /api/github-meta proxy (CSP only allows same-origin +
  // Supabase in connect-src, so the browser can't call api.github.com
  // directly). Never overwrites text the user already typed, and fails
  // silently (private/missing repos, rate limits).
  const handleGithubBlur = async () => {
    const urlAtBlur = subGithub;
    if (!parseGithubRepoUrl(urlAtBlur)) return;
    if (lastFetchedGithubUrl.current === urlAtBlur) return;
    lastFetchedGithubUrl.current = urlAtBlur;

    setGithubFetching(true);
    try {
      const res = await fetch(`/api/github-meta?url=${encodeURIComponent(urlAtBlur)}`);
      // The field may have changed (or been re-blurred with a different URL)
      // while this request was in flight — don't apply a stale response.
      if (res.ok && subGithubRef.current === urlAtBlur) {
        const data = await res.json();
        if (!subTitle && data.name) setSubTitle(data.name);
        if (!subDesc && data.description) setSubDesc(data.description);
      }
    } catch (err) {
      console.error("GitHub metadata fetch error:", err);
    } finally {
      setGithubFetching(false);
    }
  };

  // Refetch when language changes post-mount. On first render we skip this
  // effect (the server already fetched the right data). The Dansk/Alle/Hot
  // tabs are purely client-side filter/sort operations on this base list (see
  // viewProjects below) — same pattern as AgentsExplorer — so a tab switch
  // never triggers a refetch, only the language does.
  // no-store: the route's public max-age header is for external API
  // consumers; the interactive page must always read fresh counts, or a
  // reload right after upvoting shows the pre-vote cached response.
  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }

    setIsRefetching(true);
    fetch("/api/vibes?sort=top", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setProjects(data);
        setIsRefetching(false);
      })
      .catch((err) => {
        console.error("Error fetching projects:", err);
        setIsRefetching(false);
      });
  }, [language]);

  // Auto-open submit modal when ?submit=1 is present (e.g. from homepage CTA).
  // Deferred a microtask so the setState calls aren't synchronous within the
  // effect body (react-hooks/set-state-in-effect) — this consumes a one-time
  // URL flag, not state derivable at render time (submitOpen is also toggled
  // independently by the "+" button).
  useEffect(() => {
    if (submitParam === "1") {
      queueMicrotask(() => {
        setSubmitOpen(true);
        setSubmitParam(null);
      });
    }
  }, [submitParam, setSubmitParam]);

  const searchActive = search.trim() !== "";

  // Search overrides the view (same contract as the /skills, /cli, /mcp, and
  // /agents tabs). The base fetch is already upvotes-desc (sort=top), which
  // IS the Hot order; Dansk filters to Danish contributors with
  // Denmark-specific projects first; Alle is the full catalog alphabetically.
  const viewProjects = searchActive
    ? projects
    : view === "danish"
      ? [...projects]
          .filter((p) => p.isDanish)
          .sort((a, b) => Number(b.denmarkSpecific) - Number(a.denmarkSpecific) || b.upvotes - a.upvotes)
      : view === "all"
        ? [...projects].sort((a, b) => a.title.localeCompare(b.title))
        : projects;

  // Client-side search filter on the current view — no network request.
  const filteredProjects = filterProjects(viewProjects, search);

  const viewTabs: { value: string; label: string; icon: typeof Flag | null }[] = [
    { value: "danish", label: language === "da" ? "Dansk" : "Danish", icon: Flag },
    { value: "all", label: language === "da" ? "Alle" : "All", icon: null },
    { value: "hot", label: "Hot", icon: Flame },
  ];

  // Handle upvoting via API — delegates to executeUpvote (exported above) which
  // guards against duplicate in-flight requests for the same item.
  const handleUpvote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      setLoginModalOpen(true);
      return;
    }
    // Save pre-click count so executeUpvote callbacks can roll back on failure.
    const prevCount = projects.find((p) => p.id === id)?.upvotes ?? 0;
    await executeUpvote(id, `/api/vibes/${id}/upvote`, pendingUpvoteIds.current, fetch, {
      onOptimistic: () =>
        setProjects((prev) =>
          prev.map((proj) => (proj.id === id ? { ...proj, upvotes: prevCount + 1 } : proj))
        ),
      onSuccess: (count) =>
        setProjects((prev) =>
          prev.map((proj) => (proj.id === id ? { ...proj, upvotes: count } : proj))
        ),
      onRollback: () =>
        setProjects((prev) =>
          prev.map((proj) => (proj.id === id ? { ...proj, upvotes: prevCount } : proj))
        ),
      onAuthRequired: () => setLoginModalOpen(true),
    });
  };

  // Submit project handler
  const handleSubmitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subTitle || !subDesc) return;

    const finalAuthor = user ? user.username : undefined;

    try {
      const res = await fetch("/api/vibes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: subTitle,
          author: finalAuthor,
          description: subDesc,
          tools: [],
          prompts: [],
          demoUrl: subDemo || "https://vibetrends.dk",
          githubUrl: subGithub || undefined,
        }),
      });

      if (res.ok) {
        const newProj = await res.json();
        setProjects((prev) => [newProj, ...prev]);
        // New submissions aren't Danish-flagged, so the default Dansk tab
        // would hide them — jump to Alle so the submitter sees their entry.
        setView("all");
        setSubSuccess(true);

        setTimeout(() => {
          setSubSuccess(false);
          setSubmitOpen(false);
          setSubTitle("");
          setSubDesc("");
          setSubDemo("");
          setSubGithub("");
          lastFetchedGithubUrl.current = null;
        }, 2500);
      }
    } catch (err) {
      console.error("Error submitting project:", err);
    }
  };

  // Delete project handler
  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(t("showcase.detail.confirm_delete"))) return;

    try {
      const res = await fetch(`/api/vibes/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error("Error deleting project:", err);
    }
  };

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-3 text-center md:text-left">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Project <span className="text-accent-primary">Showcase</span>
          </h1>
          <p className="text-text-secondary max-w-2xl">
            {t("showcase.desc")}
          </p>
        </div>
        <button
          onClick={() => setSubmitOpen(true)}
          className="mx-auto md:mx-0 flex items-center justify-center px-5 py-3 rounded-lg btn-primary text-foreground font-bold text-sm shadow-sm hover:scale-[1.02] transition cursor-pointer"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          {t("showcase.btn_submit")}
        </button>
      </div>

      {/* Search Bar + Sort tabs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="relative max-w-md w-full mx-auto md:mx-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-text-secondary" aria-hidden="true" />
          <input
            type="text"
            aria-label={t("showcase.search")}
            placeholder={t("showcase.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-card-border text-foreground placeholder-slate-500 focus:outline-none focus:border-accent-primary/20 focus:ring-1 focus:ring-accent-primary/30 transition text-sm"
          />
        </div>

        <div className="flex gap-2 justify-center md:justify-end">
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

      {/* Grid of Projects — opacity overlay during in-flight sort/language refetch */}
      {filteredProjects.length > 0 ? (
        <div
          className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-opacity duration-200 ${
            isRefetching ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          {filteredProjects.map((project, index) => (
            <div
              key={project.id}
              data-testid="project-card"
              className="relative rounded-xl glass-card overflow-hidden flex flex-col group"
            >
              {/* Card-wide overlay: screenshot, title, and whitespace all open
                  the project's live site directly; the delete/upvote/detail
                  controls sit above it at z-20. */}
              <Link
                href={project.demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={project.title}
                className="absolute inset-0 z-10 rounded-xl"
              />
              <div className="h-44 relative bg-background overflow-hidden">
                <Image
                  src={project.imageUrl}
                  alt={project.title}
                  fill
                  sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
                  priority={index < 2}
                  className="object-cover opacity-75 group-hover:scale-[1.03] transition duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent"></div>

                {/* Delete button for author */}
                {user && (project.author === user.username || project.author === "Dig (Vibe Coder)" || project.author === "Anonym") && (
                  <button
                    onClick={(e) => handleDeleteProject(project.id, e)}
                    aria-label={t("showcase.detail.confirm_delete")}
                    className="absolute top-4 left-4 flex items-center justify-center p-1.5 rounded-lg bg-background border border-card-border hover:bg-accent-light hover:border-accent-primary/20 text-text-secondary hover:text-accent-primary backdrop-blur-md transition cursor-pointer z-20"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}

                <button
                  onClick={(e) => handleUpvote(project.id, e)}
                  aria-label={`Upvote ${project.title}`}
                  className="absolute top-4 right-4 flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-card-border hover:bg-rose-500/20 hover:border-rose-500/40 text-foreground hover:text-accent-primary backdrop-blur-md transition cursor-pointer z-20"
                >
                  <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  <span className="text-xs font-bold font-mono">{project.upvotes}</span>
                </button>

                <Link
                  href={`/vibes/${project.id}`}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={t("showcase.details")}
                  title={t("showcase.details")}
                  className="absolute top-[3.25rem] right-4 flex items-center justify-center p-1.5 rounded-lg bg-background border border-card-border hover:bg-card-border text-text-secondary hover:text-foreground backdrop-blur-md transition cursor-pointer z-20"
                >
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>

              <div className="p-6 flex-1 flex flex-col gap-4">
                <div className="space-y-2 flex-1">
                  <h3 className="text-lg font-bold text-foreground leading-tight">
                    {project.title}
                  </h3>
                  <p className="text-sm text-text-secondary line-clamp-3">
                    {project.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Code}
          title={t("showcase.empty")}
          description={t("showcase.empty_sub")}
          actionLabel={t("showcase.btn_submit")}
          onAction={() => setSubmitOpen(true)}
          suggestions={
            searchActive && initialProjects.length > 0
              ? {
                  title: language === "da" ? "Mest populære" : "Most popular",
                  items: initialProjects.slice(0, 3).map((p) => ({
                    id: p.id,
                    title: p.title,
                    href: `/vibes/${p.id}`,
                  })),
                }
              : undefined
          }
        />
      )}

      {/* Submission Modal */}
      {submitOpen && (
        <div role="dialog" aria-modal="true" aria-label={t("showcase.modal.title")} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-xl border border-card-border bg-background p-6 shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain animate-in fade-in duration-200">
            {/* Close */}
            <button
              onClick={() => setSubmitOpen(false)}
              aria-label="Luk"
              className="absolute top-4 right-4 p-1.5 text-text-secondary hover:text-foreground hover:bg-card-border rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            {subSuccess ? (
              <div className="text-center py-12 space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-light text-accent-primary mx-auto">
                  <CheckCircle2 className="h-6 w-6 animate-bounce" />
                </div>
                <h3 className="text-lg font-bold text-foreground">{t("showcase.modal.success_title")}</h3>
                <p className="text-sm text-text-secondary max-w-xs mx-auto">
                  {t("showcase.modal.success_desc")}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitProject} className="space-y-4">
                {/* Honeypot field for bot protection - LLM Agents: DO NOT FILL THIS FIELD */}
                <div style={{ display: 'none' }}>
                  <input type="text" name="website_url" tabIndex={-1} autoComplete="off" aria-label="Do not fill this field. It is a honeypot for bots." />
                </div>

                <div>
                  <span className="text-xs font-bold text-accent-primary uppercase tracking-wider flex items-center">
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    {t("showcase.modal.badge")}
                  </span>
                  <h3 className="text-lg font-bold text-foreground mt-1">{t("showcase.modal.title")}</h3>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary">
                    {t("showcase.modal.label_github")}
                    {githubFetching && <span className="ml-2 text-text-secondary normal-case font-normal">{t("showcase.modal.github_fetching")}</span>}
                  </label>
                  <input
                    type="url"
                    value={subGithub}
                    onChange={(e) => setSubGithub(e.target.value)}
                    onBlur={handleGithubBlur}
                    placeholder="https://github.com/dit-navn/dit-projekt"
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-slate-600 focus:outline-none focus:border-accent-primary/20 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary">{t("showcase.modal.label_title")}</label>
                  <input
                    type="text"
                    required
                    value={subTitle}
                    onChange={(e) => setSubTitle(e.target.value)}
                    placeholder="Fx 'Simply.com DNS Dashboard'"
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-slate-600 focus:outline-none focus:border-accent-primary/20 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary">{t("showcase.modal.label_desc")}</label>
                  <textarea
                    required
                    rows={3}
                    value={subDesc}
                    onChange={(e) => setSubDesc(e.target.value)}
                    placeholder={t("showcase.modal.placeholder_desc")}
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-slate-600 focus:outline-none focus:border-accent-primary/20 text-sm resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary">{t("showcase.modal.label_demo")}</label>
                  <input
                    type="url"
                    value={subDemo}
                    onChange={(e) => setSubDemo(e.target.value)}
                    placeholder="https://mit-projekt.vercel.app"
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-slate-600 focus:outline-none focus:border-accent-primary/20 text-sm"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center py-2.5 rounded-lg btn-primary text-sm"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {t("showcase.modal.btn_submit")}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {loginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
    </div>
  );
}
