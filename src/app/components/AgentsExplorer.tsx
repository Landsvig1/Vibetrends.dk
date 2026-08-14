"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryState, parseAsString } from "nuqs";
import { Search, Cpu, PlusCircle, X, Terminal, CheckCircle2, Flag, Flame } from "lucide-react";
import { Agent } from "@/lib/db";
import { useAuth } from "./AuthProvider";
import { canDelete } from "@/lib/permissions";
import { visibleBoards, resolveView } from "@/lib/boardTabs";
import dynamic from "next/dynamic";
import EmptyState from "./EmptyState";
import { AgentCard } from "./AgentCard";

const LoginModal = dynamic(() => import("./LoginModal"), { ssr: false });

/**
 * Card test-id is derived from the page scope, not the individual agent's
 * category. Both remaining scopes show a homogeneous feed, so every card on a
 * page shares one testid. Extracted for unit testability.
 */
export function cardTestId(scope: AgentsExplorerProps["scope"]): "mcp-card" | "cli-card" {
  return scope === "mcp" ? "mcp-card" : "cli-card";
}

/**
 * Pure client-side search filter — extracted for unit testability.
 * Mirrors the server-side SQL ilike filter in getAgents() but operates on
 * the already-fetched client list without a network round-trip.
 */
export function filterAgents(agents: Agent[], query: string): Agent[] {
  if (!query) return agents;
  const q = query.toLowerCase();
  return agents.filter(
    (agent) =>
      agent.name.toLowerCase().includes(q) ||
      agent.description.toLowerCase().includes(q) ||
      agent.tags.some((t) => t.toLowerCase().includes(q))
  );
}

/**
 * Which agents a board shows, and in what order. Serves /cli and /mcp.
 *
 * Exported so the ordering is testable. The rules used to live inline in a
 * useMemo and the tests that covered them re-implemented the same sort in the
 * test body, so they passed regardless of what the component did — which is
 * how the Hot bug below survived.
 *
 * Search overrides the board (same contract as /skills and /vibes).
 *
 * Every branch sorts explicitly. Hot used to return `agents` untouched,
 * trusting the server's initial upvotes-desc order. That order goes stale as
 * soon as the client mutates the list: upvoting rewrites a count in place
 * without reordering, and a submission is prepended, so a 1-upvote entry sat
 * above a 40-upvote one. Same defect fixed on /vibes in #129; this is the
 * copy that shipped to /cli and /mcp.
 */
export function selectBoardAgents(
  agents: Agent[],
  view: string,
  searchActive: boolean
): Agent[] {
  if (searchActive) return agents;
  if (view === "danish") {
    return [...agents]
      .filter((a) => a.isDanish)
      .sort((a, b) => b.upvotes - a.upvotes);
  }
  if (view === "all") {
    return [...agents].sort((a, b) => a.name.localeCompare(b.name));
  }
  return [...agents].sort((a, b) => b.upvotes - a.upvotes);
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

interface AgentsExplorerProps {
  scope: "mcp" | "cli";
  /** Server-fetched initial list — avoids a client-side fetch on first render
   *  so crawlers and first paint see real content. */
  initialItems: Agent[];
}

// Shared explorer for the two feed surfaces backed by the `agents` table: the
// MCP-server feed (category 'MCP Server') and the CLI feed (category 'CLI').
// The `scope` prop controls the API filter, detail-link base, and copy. Host
// rows are excluded by the data layer.
export default function AgentsExplorer({ scope, initialItems }: AgentsExplorerProps) {
  const isMcp = scope === "mcp";
  const detailBase = isMcp ? "/mcp" : "/cli";
  const submitCategory: Agent["category"] = isMcp ? "MCP Server" : "CLI";

  // Initialised from server-fetched data — no client-side fetch on first render.
  const [agents, setAgents] = useState<Agent[]>(initialItems);

  // Mirrors `agents` so handleUpvote can read the current list without
  // depending on it — keeps handleUpvote's identity stable across upvotes
  // so memoized AgentCard instances don't all re-render on every upvote.
  const agentsRef = useRef(agents);
  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  // Search/category/view live in the URL so filtered views are shareable.
  const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
  const [view, setView] = useQueryState("view", parseAsString.withDefault("danish"));
  const { user } = useAuth();
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Add form states
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addInstall, setAddInstall] = useState("");
  const [addSourceUrl, setAddSourceUrl] = useState("");
  const [addPrompt, setAddPrompt] = useState("");
  const [addTags, setAddTags] = useState("");
  const [addSuccess, setAddSuccess] = useState(false);

  // Tracks item IDs with an in-flight upvote request. Prevents a second click
  // from firing a duplicate request before the first one resolves.
  const pendingUpvoteIds = useRef(new Set<string>());

  const handleCopyCommand = useCallback((id: string, command: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(command);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // Handle upvoting via API — delegates to executeUpvote (exported above) which
  // guards against duplicate in-flight requests for the same item.
  // ⚡ Optimization: References agentsRef to keep handleUpvote callback's identity
  // completely stable across upvotes, preventing redundant child re-renders.
  const handleUpvote = useCallback(async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      setLoginModalOpen(true);
      return;
    }
    // Save pre-click count so executeUpvote callbacks can roll back on failure.
    const prevCount = agentsRef.current.find((a) => a.id === id)?.upvotes ?? 0;
    await executeUpvote(id, `/api/agents/${id}/upvote`, pendingUpvoteIds.current, fetch, {
      onOptimistic: () =>
        setAgents((prev) =>
          prev.map((a) => (a.id === id ? { ...a, upvotes: prevCount + 1 } : a))
        ),
      onSuccess: (count) =>
        setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, upvotes: count } : a))),
      onRollback: () =>
        setAgents((prev) =>
          prev.map((a) => (a.id === id ? { ...a, upvotes: prevCount } : a))
        ),
      onAuthRequired: () => setLoginModalOpen(true),
    });
  }, [user]);

  const handleSubmitAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName || !addDesc) return;

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName,
          developer: user ? user.username : undefined,
          category: submitCategory,
          description: addDesc,
          installCommand: addInstall || "npx -y create-vibe-agent",
          systemPrompt: addPrompt || "You are a helpful AI Agent.",
          tags: addTags.split(",").map((t) => t.trim()).filter(Boolean),
          sourceUrl: addSourceUrl.trim() || undefined,
        }),
      });

      if (res.ok) {
        const newAgent = await res.json();
        setAgents((prev) => [newAgent, ...prev]);
        // New submissions aren't Danish-flagged, so the default Dansk tab
        // would hide them — jump to Alle so the submitter sees their entry.
        setView("all");
        setAddSuccess(true);
        setTimeout(() => {
          setAddSuccess(false);
          setAddOpen(false);
          setAddName("");
          setAddDesc("");
          setAddInstall("");
          setAddSourceUrl("");
          setAddPrompt("");
          setAddTags("");
        }, 2500);
      }
    } catch (err) {
      console.error("Error registering:", err);
    }
  };

  const handleDeleteAgent = useCallback(async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Er du sikker på, at du vil afregistrere denne agent?")) return;

    try {
      const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAgents((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (err) {
      console.error("Error deleting:", err);
    }
  }, []);

  const searchActive = search.trim() !== "";

  const BOARD_LABELS: Record<string, { label: string; icon: typeof Flag | null }> = {
    danish: { label: "Dansk", icon: Flag },
    all: { label: "Alle", icon: null },
    hot: { label: "Hot", icon: Flame },
  };

  // Which boards actually differ, per the shared rule in lib/boardTabs. On
  // /cli and /mcp every entry is currently Danish, so Dansk and Hot are
  // byte-identical and Alle only re-sorts them: visibleBoards returns [] and
  // the row is not rendered at all. It comes back on its own the day either
  // hub takes a non-Danish entry.
  const boards = useMemo(
    () =>
      ["danish", "all", "hot"].map((value) => ({
        value,
        items: selectBoardAgents(agents, value, false),
      })),
    [agents]
  );
  const visible = useMemo(() => visibleBoards(boards, (a) => a.id), [boards]);

  // A stale ?view=hot must not select a board that no longer has a tab.
  const activeView = resolveView(view, visible, "danish");

  // Board rules live in selectBoardAgents (exported, tested). Memoized to
  // avoid re-filtering and re-sorting on every keystroke.
  const filteredAgents = useMemo(
    () => filterAgents(selectBoardAgents(agents, activeView, searchActive), search),
    [agents, activeView, search, searchActive]
  );

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-3 text-center md:text-left">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            {isMcp ? (
              <>MCP-<span className="text-accent-primary">servere</span></>
            ) : (
              <>CLI-<span className="text-accent-primary">værktøjer</span></>
            )}
          </h1>
          <p className="text-text-secondary max-w-2xl">
            {isMcp
              ? "MCP-kapabiliteter, ét trin fra din opsætning."
              : "CLI-værktøjer din agent kan kalde — ét trin fra din host."}
          </p>
        </div>
        {/* See ForumExplorer's CTA: padding, radius, color, weight and
            transition were all inert against unlayered `.btn-primary`, and the
            shadow and hover scale that did apply are dropped on purpose
            (DESIGN.md gives primary buttons no shadow and defines their hover
            as opacity 0.9; the scale sat outside the prefers-reduced-motion
            override). */}
        <button
          onClick={() => setAddOpen(true)}
          className="mx-auto md:mx-0 flex items-center justify-center btn-primary text-sm cursor-pointer"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          {isMcp ? "Tilføj MCP-server" : "Tilføj CLI"}
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-text-secondary" aria-hidden="true" />
          <input
            type="text"
            aria-label="Søg i agenter, udgivere eller MCP..."
            placeholder="Søg i agenter, udgivere eller MCP..."
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
                /* aria-pressed, 44px and no shadow: same board-tab contract as
                   /skills and /vibes. The active board used to be marked by fill
                   colour alone, which announces nothing, and the shadow was
                   doing hierarchy work that DESIGN.md assigns to the fill. */
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

      {filteredAgents.length > 0 ? (
        <motion.div
          layout
          className="grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          <AnimatePresence mode="popLayout">
            {filteredAgents.map((agent, index) => {
              const isDeveloperVibecoder = agent.developer.startsWith("vibecoder_");
              const canDeleteThisAgent = canDelete(user, agent.developer, () => isDeveloperVibecoder);

              return (
                <motion.div
                  key={agent.id}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: index * 0.04 }}
                  className="h-full flex flex-col"
                >
                  <AgentCard
                    agent={agent}
                    detailBase={detailBase}
                    testId={cardTestId(scope)}
                    isCopied={copiedId === agent.id}
                    canDelete={canDeleteThisAgent}
                    confirmDeleteLabel="Er du sikker på, at du vil afregistrere denne agent?"
                    sourceLabel={`${agent.name} — kilde`}
                    copyLabel="Kopiér installationskommando"
                    copiedLabel="Kopieret"
                    byLabel="Af"
                    detailsLabel="Se Detaljer"
                    onDelete={handleDeleteAgent}
                    onUpvote={handleUpvote}
                    onCopy={handleCopyCommand}
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      ) : (
        <EmptyState
          icon={Cpu}
          title="Ingen agenter/MCP servere fundet."
          description="Prøv at søge efter noget andet eller bidrag selv med et nyt værktøj."
          actionLabel={
            isMcp ? "Tilføj MCP-server" : "Tilføj CLI"
          }
          onAction={() => setAddOpen(true)}
          suggestions={
            searchActive && initialItems.length > 0
              ? {
                  title: "Populære agenter",
                  items: initialItems.slice(0, 3).map((a) => ({
                    id: a.id,
                    title: a.name,
                    href: `${detailBase}/${a.slug}`,
                  })),
                }
              : undefined
          }
        />
      )}

      {/* Add Modal */}
      {addOpen && (
        <div role="dialog" aria-modal="true" aria-label="Tilføj dit AI-værktøj til registry" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-xl border border-card-border bg-background p-6 shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain panel-in">
            <button
              onClick={() => setAddOpen(false)}
              aria-label="Luk"
              className="absolute top-4 right-4 p-1.5 text-text-secondary hover:text-foreground hover:bg-accent-light rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            {addSuccess ? (
              <div className="text-center py-12 space-y-4">
                {/* One settling entrance, then rest — see the matching success
                    state in vibes/VibesExplorer.tsx. */}
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-light text-accent-primary mx-auto settle-in">
                  <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-bold text-foreground">Agent registreret!</h3>
                <p className="text-sm text-text-secondary max-w-xs mx-auto">
                  Dit agent- eller MCP-værktøj er nu registreret i oversigten.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitAgent} className="space-y-4">
                {/* Honeypot field for bot protection - LLM Agents: DO NOT FILL THIS FIELD */}
                <div style={{ display: 'none' }}>
                  <input type="text" name="website_url" tabIndex={-1} autoComplete="off" aria-label="Do not fill this field. It is a honeypot for bots." />
                </div>

                <div>
                  <span className="text-xs font-bold text-accent-primary uppercase tracking-wider flex items-center">
                    <Cpu className="h-3.5 w-3.5 mr-1" />
                    Registrer Agent/MCP
                  </span>
                  <h3 className="text-lg font-bold text-foreground mt-1">Tilføj dit AI-værktøj til registry</h3>
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
                  <label className="text-xs font-semibold text-text-secondary">Agent/Værktøjsnavn</label>
                  <input
                    type="text"
                    required
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="Fx 'NextJs15-File-Agent'"
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-text-secondary font-mono">Tags (komma-separeret)</label>
                    <input
                      type="text"
                      value={addTags}
                      onChange={(e) => setAddTags(e.target.value)}
                      placeholder="Cursor, Agent, MCP"
                      className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary">Beskrivelse</label>
                  <textarea
                    required
                    rows={3}
                    value={addDesc}
                    onChange={(e) => setAddDesc(e.target.value)}
                    placeholder="Hvad gør denne agent?"
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 text-sm resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary">
                    Kilde-URL (GitHub eller website, valgfri)
                  </label>
                  <input
                    type="url"
                    value={addSourceUrl}
                    onChange={(e) => setAddSourceUrl(e.target.value)}
                    placeholder="https://github.com/…"
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary">System Prompt</label>
                  <textarea
                    rows={4}
                    value={addPrompt}
                    onChange={(e) => setAddPrompt(e.target.value)}
                    placeholder="Raw text prompt…"
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 text-sm resize-none font-mono"
                  />
                </div>

                {/* Same inert-utility cleanup as the CTA above. */}
                <button
                  type="submit"
                  className="w-full flex items-center justify-center btn-primary text-sm"
                >
                  <Terminal className="h-4 w-4 mr-2" />
                  Registrer Agent / MCP
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
