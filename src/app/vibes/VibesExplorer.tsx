"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { Search, Code, PlusCircle, CheckCircle2, Sparkles, X, Flag, Flame } from "lucide-react";
import { ShowcaseProject } from "@/lib/db";
import { parseGithubRepoUrl } from "@/lib/github";
import { canDelete } from "@/lib/permissions";
import { useAuth } from "../components/AuthProvider";
import { ProjectCard } from "../components/ProjectCard";
import dynamic from "next/dynamic";
import EmptyState from "../components/EmptyState";

const LoginModal = dynamic(() => import("../components/LoginModal"), { ssr: false });

/**
 * Pure client-side search filter — extracted for unit testability.
 * Mirrors the server-side filter in getProjects() but operates on the
 * already-fetched client list without a network round-trip.
 *
 * Author is matched because the search field promises it ("Søg i projekter,
 * redskaber eller forfattere..."). It previously did not, so a visitor
 * searching a builder's handle got the empty state — and with `tools` null on
 * every live row, that left title/description as the only field of the three
 * named that actually did anything. Keep this list and getProjects() in sync.
 */
export function filterProjects(projects: ShowcaseProject[], query: string): ShowcaseProject[] {
  // Trimmed, so this agrees with the component's `searchActive` test
  // (`search.trim() !== ""`). They used to disagree: a whitespace-only query
  // was "not searching" to the component but a literal filter on spaces here,
  // which matched nothing. The result was the empty state, with its suggestion
  // list suppressed (it is gated on searchActive) and the board tab still lit
  // as active — no results, no explanation, and no way back except deleting
  // the invisible spaces.
  const q = query.trim().toLowerCase();
  if (!q) return projects;
  return projects.filter(
    (project) =>
      project.title.toLowerCase().includes(q) ||
      project.description.toLowerCase().includes(q) ||
      project.author.toLowerCase().includes(q) ||
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

/**
 * Comma-separated tools input → the `tools` array.
 *
 * Capped and truncated here rather than left to the server: projectSchema
 * rejects >10 tools or any tool over 50 chars with a 400, and a rejected
 * submission is a worse outcome than a quietly trimmed one for a field the
 * visitor is filling freehand.
 */
export const MAX_TOOLS = 10;
export const MAX_TOOL_LENGTH = 50;
export function parseToolsInput(raw: string): string[] {
  return raw
    .split(",")
    .map((tool) => tool.trim().slice(0, MAX_TOOL_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_TOOLS);
}

/**
 * Blank-line-separated prompts textarea → the `prompts` array.
 *
 * One block per prompt, which is what the detail page already renders as
 * "Step 1..N". Blank-line splitting (rather than one line per prompt) is what
 * lets a prompt be more than one line long, and prompts usually are.
 *
 * Mirrors projectSchema's limits for the same reason as parseToolsInput.
 */
export const MAX_PROMPTS = 20;
export const MAX_PROMPT_LENGTH = 2000;
export function parsePromptsInput(raw: string): string[] {
  return raw
    .split(/\n\s*\n/)
    .map((prompt) => prompt.trim().slice(0, MAX_PROMPT_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_PROMPTS);
}

interface VibesExplorerProps {
  initialProjects: ShowcaseProject[];
}

export default function VibesExplorer({ initialProjects }: VibesExplorerProps) {
  const [projects, setProjects] = useState<ShowcaseProject[]>(initialProjects);

  // Mirrors `projects` so handleUpvote can read the current list without
  // depending on it — keeps handleUpvote's identity stable across upvotes
  // so memoized ProjectCard instances don't all re-render on every upvote.
  const projectsRef = useRef(projects);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [view, setView] = useQueryState("view", parseAsString.withDefault("danish"));
  const [submitParam, setSubmitParam] = useQueryState("submit", parseAsString.withDefault(""));
  const { user } = useAuth();
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // Submit modal states
  const [submitOpen, setSubmitOpen] = useState(false);
  const [subTitle, setSubTitle] = useState("");
  const [subDesc, setSubDesc] = useState("");
  const [subDemo, setSubDemo] = useState("");
  const [subGithub, setSubGithub] = useState("");
  const [subTools, setSubTools] = useState("");
  const [subPrompts, setSubPrompts] = useState("");
  const [subSuccess, setSubSuccess] = useState(false);
  // A failed POST used to do nothing at all: `if (res.ok)` had no else, so a
  // validation error or a dropped request left the form sitting there looking
  // untouched and the visitor clicking submit again.
  const [subError, setSubError] = useState<string | null>(null);
  const [githubFetching, setGithubFetching] = useState(false);
  const subGithubRef = useRef(subGithub);
  const lastFetchedGithubUrl = useRef<string | null>(null);
  useEffect(() => {
    subGithubRef.current = subGithub;
  }, [subGithub]);

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

  // Search overrides the view (same contract as the /skills, /cli, and /mcp
  // tabs). The base fetch is already upvotes-desc (sort=top), which
  // IS the Hot order; Dansk filters to Danish contributors, ranked by
  // upvotes; Alle is the full catalog alphabetically.
  // ⚡ Optimization: Memoize the filtered and sorted projects list to prevent redundant
  // recreation, sorting, and filtering on every single render/keystroke.
  const filteredProjects = useMemo(() => {
    const viewProjects = searchActive
      ? projects
      : view === "danish"
        ? [...projects]
            .filter((p) => p.isDanish)
            .sort((a, b) => b.upvotes - a.upvotes)
        : view === "all"
          ? [...projects].sort((a, b) => a.title.localeCompare(b.title))
          : projects;

    return filterProjects(viewProjects, search);
  }, [projects, view, search, searchActive]);

  const viewTabs: {
    value: string;
    label: string;
    icon: typeof Flag | typeof Flame | null;
  }[] = [
    { value: "danish", label: "Dansk", icon: Flag },
    { value: "all", label: "Alle", icon: null },
    { value: "hot", label: "Hot", icon: Flame },
  ];

  // Handle upvoting via API — delegates to executeUpvote (exported above) which
  // guards against duplicate in-flight requests for the same item.
  // ⚡ Optimization: References projectsRef to keep handleUpvote callback's identity
  // completely stable across upvotes, preventing redundant child re-renders.
  const handleUpvote = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      setLoginModalOpen(true);
      return;
    }
    // Save pre-click count so executeUpvote callbacks can roll back on failure.
    const prevCount = projectsRef.current.find((p) => p.id === id)?.upvotes ?? 0;
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
  }, [user]);

  // Submit project handler
  const handleSubmitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subTitle || !subDesc) return;
    setSubError(null);

    const finalAuthor = user ? user.username : undefined;

    try {
      const res = await fetch("/api/vibes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: subTitle,
          author: finalAuthor,
          description: subDesc,
          tools: parseToolsInput(subTools),
          prompts: parsePromptsInput(subPrompts),
          demoUrl: subDemo || "https://vibetrends.dk",
          githubUrl: subGithub || undefined,
        }),
      });

      if (!res.ok) {
        setSubError(
          res.status === 401
            ? "Du skal være logget ind for at udgive et projekt."
            : "Projektet kunne ikke udgives. Tjek felterne og prøv igen."
        );
        return;
      }

      const newProj = await res.json();
      setProjects((prev) => [newProj, ...prev]);
      // createProject never sets is_danish (the column defaults false), so
      // the default Dansk board filters the submitter's own entry straight
      // back out. Jump to Alle so the confirmation ("Andre kan se og stemme
      // på dit projekt med det samme") is actually true on screen. This is
      // load-bearing: without it the page's primary CTA appears to succeed
      // and produces nothing the submitter can find.
      setView("all");
      setSubSuccess(true);

      setTimeout(() => {
        setSubSuccess(false);
        setSubmitOpen(false);
        setSubTitle("");
        setSubDesc("");
        setSubDemo("");
        setSubGithub("");
        setSubTools("");
        setSubPrompts("");
        lastFetchedGithubUrl.current = null;
      }, 2500);
    } catch (err) {
      console.error("Error submitting project:", err);
      setSubError("Projektet kunne ikke udgives. Prøv igen.");
    }
  };

  // Delete project handler
  // Reference-stabilized using useCallback to prevent redundant child re-renders.
  const handleDeleteProject = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Er du sikker på, at du vil slette dette projekt?")) return;

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
  }, []);

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-3 text-center md:text-left">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Vibes fra <span className="text-accent-primary">fællesskabet</span>
          </h1>
          <p className="text-text-secondary max-w-2xl">
            Se hvad andre bygger med AI. Bliv inspireret, og vis dit eget frem.
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
          onClick={() => setSubmitOpen(true)}
          className="mx-auto md:mx-0 flex items-center justify-center btn-primary text-sm cursor-pointer"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Indsend dit projekt
        </button>
      </div>

      {/* Search Bar + Sort tabs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="relative max-w-md w-full mx-auto md:mx-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-text-secondary" aria-hidden="true" />
          <input
            type="text"
            aria-label="Søg i projekter, redskaber eller forfattere..."
            placeholder="Søg i projekter, redskaber eller forfattere..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 focus:ring-1 focus:ring-accent-primary/30 transition text-sm"
          />
        </div>

        <div className="flex gap-2 justify-center md:justify-end">
          {viewTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              /* aria-pressed, 44px and no shadow: same board-tab contract as
                 /skills and /cli. The active board used to be marked by fill
                 colour alone, which announces nothing, and the shadow was
                 doing hierarchy work that DESIGN.md assigns to the fill. */
              <button
                key={tab.value}
                type="button"
                aria-pressed={view === tab.value && !searchActive}
                onClick={() => setView(tab.value)}
                className={`flex min-h-11 items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                  view === tab.value && !searchActive
                    ? "bg-accent-primary text-white font-extrabold"
                    : "bg-background border border-card-border text-text-secondary hover:bg-accent-light hover:text-foreground"
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project, index) => {
            const canDeleteProject = canDelete(user, project.author, (a) => a === "Dig (Vibe Coder)" || a === "Anonym");
            return (
              <ProjectCard
                key={project.id}
                project={project}
                isPriority={index < 2}
                canDelete={canDeleteProject}
                confirmDeleteLabel="Er du sikker på, at du vil slette dette projekt?"
                demoLabel="Se live"
                onDelete={handleDeleteProject}
                onUpvote={handleUpvote}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Code}
          title="Ingen projekter fundet."
          description="Søg efter et andet emne eller tilføj dit eget projekt."
          actionLabel="Indsend dit projekt"
          onAction={() => setSubmitOpen(true)}
          suggestions={
            searchActive && initialProjects.length > 0
              ? {
                  title: "Mest populære",
                  items: initialProjects.slice(0, 3).map((p) => ({
                    id: p.id,
                    title: p.title,
                    href: `/vibes/${p.slug}`,
                  })),
                }
              : undefined
          }
        />
      )}

      {/* Submission Modal */}
      {submitOpen && (
        <div role="dialog" aria-modal="true" aria-label="Udgiv dit vibe-kodede produkt" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-xl border border-card-border bg-background p-6 shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain panel-in">
            {/* Close */}
            <button
              onClick={() => setSubmitOpen(false)}
              aria-label="Luk"
              className="absolute top-4 right-4 p-1.5 text-text-secondary hover:text-foreground hover:bg-accent-light rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            {subSuccess ? (
              <div className="text-center py-12 space-y-4">
                {/* One settling entrance, then rest. This was a perpetual
                    bouncing icon: that easing reads dated, and an infinite
                    loop on a confirmation keeps demanding attention long
                    after the moment it is confirming has passed. */}
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-light text-accent-primary mx-auto settle-in">
                  <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Projektet er udgivet!</h3>
                <p className="text-sm text-text-secondary max-w-xs mx-auto">
                  Tillykke, dit projekt er nu tilføjet til det lokale showcase! Andre kan se og stemme på dit projekt med det samme.
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
                    Vis dit projekt frem
                  </span>
                  <h3 className="text-lg font-bold text-foreground mt-1">Udgiv dit vibe-kodede produkt</h3>
                </div>

                {/* Every label here carries htmlFor against an id, matching the
                    /skills submit form. They were bare <label>s wrapping
                    nothing, so none of them was associated with its field:
                    clicking a label did not focus the input and a screen
                    reader announced the inputs unnamed. */}
                <div className="space-y-1">
                  <label htmlFor="vibe-github" className="text-xs font-semibold text-text-secondary">
                    GitHub URL (valgfri: udfylder navn/beskrivelse automatisk)
                    {githubFetching && <span className="ml-2 text-text-secondary normal-case font-normal">Henter repo-info...</span>}
                  </label>
                  <input
                    id="vibe-github"
                    type="url"
                    value={subGithub}
                    onChange={(e) => setSubGithub(e.target.value)}
                    onBlur={handleGithubBlur}
                    placeholder="https://github.com/dit-navn/dit-projekt"
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="vibe-title" className="text-xs font-semibold text-text-secondary">Projekt Navn</label>
                  <input
                    id="vibe-title"
                    type="text"
                    required
                    value={subTitle}
                    onChange={(e) => setSubTitle(e.target.value)}
                    placeholder="Fx 'Simply.com DNS Dashboard'"
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="vibe-desc" className="text-xs font-semibold text-text-secondary">Beskrivelse</label>
                  <textarea
                    id="vibe-desc"
                    required
                    rows={3}
                    value={subDesc}
                    onChange={(e) => setSubDesc(e.target.value)}
                    placeholder="Hvad kan projektet og hvorfor byggede du det?"
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 text-sm resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="vibe-demo" className="text-xs font-semibold text-text-secondary">Demo Link</label>
                  <input
                    id="vibe-demo"
                    type="url"
                    value={subDemo}
                    onChange={(e) => setSubDemo(e.target.value)}
                    placeholder="https://mit-projekt.vercel.app"
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 text-sm"
                  />
                </div>

                {/* Tools and prompts are the two fields the detail page is
                    built around — "Teknologier & Værktøjer" and "Core Prompts
                    Anvendt" — and this form used to post `tools: []` and
                    `prompts: []` hardcoded with no input for either. Every one
                    of the 15 live rows therefore has both null, so both
                    sections render on no project and the detail page collapses
                    to a screenshot and one paragraph. The prompts in
                    particular are the actual evidence of vibe coding, which is
                    the thing this catalog exists to show. */}
                <div className="space-y-1">
                  <label htmlFor="vibe-tools" className="text-xs font-semibold text-text-secondary">
                    Værktøjer (valgfri, kommasepareret)
                  </label>
                  <input
                    id="vibe-tools"
                    type="text"
                    value={subTools}
                    onChange={(e) => setSubTools(e.target.value)}
                    placeholder="Fx Claude Code, Next.js, Supabase"
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="vibe-prompts" className="text-xs font-semibold text-text-secondary">
                    Prompts (valgfri)
                  </label>
                  <textarea
                    id="vibe-prompts"
                    rows={5}
                    value={subPrompts}
                    onChange={(e) => setSubPrompts(e.target.value)}
                    placeholder={"De prompts du byggede projektet med. Adskil hver prompt med en tom linje.\n\nByg en dashboard-side der viser...\n\nTilføj en filterrække øverst som..."}
                    aria-describedby="vibe-prompts-hint"
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 text-sm font-mono resize-none"
                  />
                  <p id="vibe-prompts-hint" className="text-xs text-text-secondary">
                    Én prompt pr. afsnit. De vises som Step 1, 2, 3 på projektets side.
                  </p>
                </div>

                {/* Tinted block, same shape as LoginModal's message and as the
                    success state above. Red is used because the meaning here
                    is genuinely semantic, which is the one exception
                    DESIGN.md's Single Ink Rule allows. red-700 rather than
                    LoginModal's red-500: red-500 on warm paper is about 3.5:1,
                    under the 4.5:1 body-text floor. */}
                {subError && (
                  <p
                    role="alert"
                    className="p-3 rounded-lg bg-red-700/10 text-red-700 text-xs font-medium text-center"
                  >
                    {subError}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full flex items-center justify-center btn-primary text-sm cursor-pointer"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Udgiv til Showcase
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
