"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQueryState, parseAsString } from "nuqs";
import { Search, Heart, Code, Sparkles, PlusCircle, CheckCircle2, X, Trash2, ArrowUpRight, Clock, TrendingUp, ArrowDownAZ } from "lucide-react";
import { ShowcaseProject } from "@/lib/db";
import { parseGithubRepoUrl } from "@/lib/github";
import { useAuth } from "../components/AuthProvider";
import { useLanguage } from "../components/LanguageProvider";
import dynamic from "next/dynamic";

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

interface VibesExplorerProps {
  initialProjects: ShowcaseProject[];
}

export default function VibesExplorer({ initialProjects }: VibesExplorerProps) {
  const [projects, setProjects] = useState<ShowcaseProject[]>(initialProjects);
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [sort, setSort] = useQueryState("sort", parseAsString.withDefault("new"));
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

  // Refetch when language or sort changes post-mount. On first render we skip
  // this effect (the server already fetched the right data). After that, any
  // language/sort change triggers a fresh fetch from /api/vibes.
  // no-store: the route's public max-age header is for external API
  // consumers; the interactive page must always read fresh counts, or a
  // reload right after upvoting shows the pre-vote cached response.
  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }

    const params = new URLSearchParams();
    if (sort !== "new") params.set("sort", sort);
    const qs = params.toString();

    setIsRefetching(true);
    fetch(qs ? `/api/vibes?${qs}` : "/api/vibes", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        setProjects(data);
        setIsRefetching(false);
      })
      .catch((err) => {
        console.error("Error fetching projects:", err);
        setIsRefetching(false);
      });
  }, [language, sort]);

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

  // Client-side search filter on the current project list — no network request.
  const filteredProjects = filterProjects(projects, search);

  // Handle upvoting via API — optimistic increment with rollback on failure.
  const handleUpvote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      setLoginModalOpen(true);
      return;
    }

    // Save pre-click count so we can roll back on any failure.
    const prevCount = projects.find((p) => p.id === id)?.upvotes ?? 0;

    // Optimistic update: increment immediately for responsive feel.
    setProjects((prev) =>
      prev.map((proj) =>
        proj.id === id ? { ...proj, upvotes: prevCount + 1 } : proj
      )
    );

    try {
      const res = await fetch(`/api/vibes/${id}/upvote`, { method: "POST" });
      if (res.status === 401) {
        // Session expired since page load — roll back optimistic update and
        // surface login modal rather than leaving a silent miscount.
        setProjects((prev) =>
          prev.map((proj) =>
            proj.id === id ? { ...proj, upvotes: prevCount } : proj
          )
        );
        setLoginModalOpen(true);
        return;
      }
      if (res.ok) {
        // Replace optimistic count with the authoritative server count.
        const data = await res.json();
        setProjects((prev) =>
          prev.map((proj) =>
            proj.id === id ? { ...proj, upvotes: data.upvotes } : proj
          )
        );
      } else {
        // Non-OK, non-401: roll back the optimistic increment.
        setProjects((prev) =>
          prev.map((proj) =>
            proj.id === id ? { ...proj, upvotes: prevCount } : proj
          )
        );
      }
    } catch (err) {
      console.error("Upvote error:", err);
      // Network failure: roll back the optimistic increment so the displayed
      // count never permanently diverges from the server value.
      setProjects((prev) =>
        prev.map((proj) =>
          proj.id === id ? { ...proj, upvotes: prevCount } : proj
        )
      );
    }
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
          {([
            { value: "new", label: language === "da" ? "Nyeste" : "New", icon: Clock },
            { value: "top", label: language === "da" ? "Top" : "Top", icon: TrendingUp },
            { value: "az", label: "A–Z", icon: ArrowDownAZ },
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
                  the project detail page (same pattern as SkillCard); the
                  delete/upvote/visit controls sit above it at z-20. */}
              <Link
                href={`/vibes/${project.id}`}
                aria-label={project.title}
                className="absolute inset-0 z-10 rounded-xl"
              />
              <div className="h-44 relative bg-background overflow-hidden">
                <Image
                  src={project.imageUrl}
                  alt={project.title}
                  fill
                  sizes="(max-w-7xl) 33vw, 100vw"
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

                <a
                  href={project.demoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="relative z-20 flex items-center justify-center gap-2 py-3 rounded-lg btn-primary text-sm font-bold transition hover:scale-[1.02]"
                >
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  {t("showcase.visit")}
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 rounded-xl border border-card-border bg-background">
          <Code className="h-10 w-10 text-text-secondary mx-auto mb-4" />
          <p className="text-text-secondary font-semibold">{t("showcase.empty")}</p>
          <p className="text-text-secondary text-sm mt-1">{t("showcase.empty_sub")}</p>
        </div>
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
