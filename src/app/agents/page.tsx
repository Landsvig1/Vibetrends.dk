"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, Heart, Cpu, Copy, CheckCircle, PlusCircle, X, Trash2, Terminal, Code, Globe, CheckCircle2 } from "lucide-react";
import { Agent } from "@/lib/db";
import { useAuth } from "../components/AuthProvider";
import dynamic from "next/dynamic";

const LoginModal = dynamic(() => import("../components/LoginModal"), { ssr: false });

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const { user } = useAuth();
  const router = useRouter();
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Add agent form states
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCategory, setAddCategory] = useState<Agent["category"]>("DevTools");
  const [addDesc, setAddDesc] = useState("");
  const [addInstall, setAddInstall] = useState("");
  const [addPrompt, setAddPrompt] = useState("");
  const [addTags, setAddTags] = useState("");
  const [addSuccess, setAddSuccess] = useState(false);

  // Fetch agents from API
  useEffect(() => {
    fetch("/api/agents")
      .then((res) => res.json())
      .then((data) => setAgents(data))
      .catch((err) => console.error("Error fetching agents:", err));
  }, []);

  const handleCopyCommand = (id: string, command: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(command);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUpvote = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch("/api/upvote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: id }),
      });
      if (res.ok) {
        const data = await res.json();
        setAgents((prev) =>
          prev.map((a) => (a.id === id ? { ...a, upvotes: data.upvotes } : a))
        );
      }
    } catch (err) {
      console.error("Error upvoting agent:", err);
    }
  };

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
          category: addCategory,
          description: addDesc,
          installCommand: addInstall || "npx -y create-vibe-agent",
          systemPrompt: addPrompt || "You are a helpful AI Agent.",
          tags: addTags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });

      if (res.ok) {
        const newAgent = await res.json();
        setAgents((prev) => [newAgent, ...prev]);
        setAddSuccess(true);
        setTimeout(() => {
          setAddSuccess(false);
          setAddOpen(false);
          setAddName("");
          setAddDesc("");
          setAddInstall("");
          setAddPrompt("");
          setAddTags("");
        }, 2500);
      }
    } catch (err) {
      console.error("Error registering agent:", err);
    }
  };

  const handleDeleteAgent = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Er du sikker på, at du vil afregistrere denne agent?")) return;

    try {
      const res = await fetch(`/api/agents?agentId=${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAgents((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (err) {
      console.error("Error deleting agent:", err);
    }
  };

  const categories = ["All", "DevTools", "Writing", "Browsing", "MCP Server"];
  const categoryIcons = {
    "DevTools": <Terminal className="h-4 w-4" />,
    "Writing": <Code className="h-4 w-4" />,
    "Browsing": <Globe className="h-4 w-4" />,
    "MCP Server": <Cpu className="h-4 w-4" />
  };

  const filteredAgents = agents.filter((agent) => {
    const matchesCategory = selectedCategory === "All" || agent.category === selectedCategory;
    const matchesSearch =
      agent.name.toLowerCase().includes(search.toLowerCase()) ||
      agent.description.toLowerCase().includes(search.toLowerCase()) ||
      agent.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-3 text-center md:text-left">
          <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
            Agent & <span className="text-cyan-400">MCP Marketplace</span>
          </h1>
          <p className="text-slate-400 max-w-2xl">
            Find færdigbyggede systemprompts, custom GPT configs og Model Context Protocol (MCP) servere. Hent dem og kobl dem direkte til dine AI-agenter.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="mx-auto md:mx-0 flex items-center justify-center px-5 py-3 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold text-sm shadow-lg shadow-violet-600/10 hover:scale-[1.02] transition-all cursor-pointer"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          Registrer Agent/MCP
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-500" />
          <input
            type="text"
            placeholder="Søg i agenter, udgivere eller MCP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-900/80 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedCategory === cat
                  ? "bg-cyan-500 text-slate-950 font-extrabold shadow-md shadow-cyan-500/20"
                  : "bg-white/5 border border-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Agent Grid */}
      {filteredAgents.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredAgents.map((agent) => (
            <div
              key={agent.id}
              data-testid="agent-card"
              onClick={() => router.push(`/agents/${agent.id}`)}
              className="rounded-xl glass-card p-6 flex flex-col justify-between space-y-6 cursor-pointer group hover:-translate-y-0.5 transition-all"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold rounded bg-violet-950/60 text-violet-300 border border-violet-500/25 uppercase">
                        {categoryIcons[agent.category as keyof typeof categoryIcons]}
                        {agent.category}
                      </div>
                      {user && (agent.developer === user.username || agent.developer.startsWith("vibecoder_")) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteAgent(agent.id, e); }}
                          className="flex items-center justify-center p-1.5 rounded-lg bg-slate-950/70 border border-white/10 hover:bg-red-500/20 hover:border-red-500/40 text-slate-300 hover:text-red-400 backdrop-blur-md transition-all cursor-pointer z-10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors leading-tight pt-1">
                      {agent.name}
                    </h3>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); handleUpvote(agent.id, e); }}
                    className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950/70 border border-white/5 hover:border-rose-500/40 text-slate-300 hover:text-rose-400 backdrop-blur-md transition-all z-10"
                  >
                    <Heart className="h-3.5 w-3.5 fill-current" />
                    <span className="text-xs font-bold font-mono">{agent.upvotes}</span>
                  </button>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed line-clamp-3">
                  {agent.description}
                </p>

                <div className="flex items-center justify-between rounded-lg bg-slate-950 border border-white/10 p-3 font-mono text-[10px] text-cyan-300 relative group/install">
                  <span className="truncate pr-8">{agent.installCommand}</span>
                  <button
                    onClick={(e) => handleCopyCommand(agent.id, agent.installCommand, e)}
                    className="absolute right-2 p-1.5 rounded bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-colors z-10"
                  >
                    {copiedId === agent.id ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {agent.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-[10px] rounded-md bg-white/5 text-slate-400 border border-white/5 font-mono">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/5 text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                <span>By {agent.developer}</span>
                <span className="text-cyan-400 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                  Se Detaljer <span className="text-xs">&rarr;</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 rounded-xl border border-white/5 bg-slate-900/20">
          <Cpu className="h-10 w-10 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 font-semibold">Ingen agenter/MCP servere fundet.</p>
        </div>
      )}

      {/* Add Agent / MCP Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-xl border border-white/10 bg-slate-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in duration-200">
            <button
              onClick={() => setAddOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {addSuccess ? (
              <div className="text-center py-12 space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 mx-auto">
                  <CheckCircle2 className="h-6 w-6 animate-bounce" />
                </div>
                <h3 className="text-lg font-bold text-white">Agent registreret!</h3>
                <p className="text-sm text-slate-300 max-w-xs mx-auto">
                  Dit agent- eller MCP-værktøj er nu registreret i oversigten.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitAgent} className="space-y-4">
                <div>
                  <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center">
                    <Cpu className="h-3.5 w-3.5 mr-1" />
                    Registrer Agent/MCP
                  </span>
                  <h3 className="text-lg font-bold text-white mt-1">Tilføj dit AI-værktøj til registry</h3>
                </div>

                {!user && (
                  <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed space-y-2">
                    <p>
                      <strong>Du er ikke logget ind.</strong> Hvis du fortsætter, vil dit værktøj blive udgivet under et tilfældigt gæstenavn.
                    </p>
                    <button
                      type="button"
                      onClick={() => setLoginModalOpen(true)}
                      className="text-cyan-400 hover:text-cyan-300 font-bold underline transition-colors cursor-pointer"
                    >
                      Log ind med E-mail, Google eller GitHub
                    </button>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Agent/Værktøjsnavn</label>
                  <input
                    type="text"
                    required
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="Fx 'NextJs15-File-Agent'"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Kategori</label>
                    <select
                      value={addCategory}
                      onChange={(e) => setAddCategory(e.target.value as Agent["category"])}
                      className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-white/10 text-white focus:outline-none focus:border-cyan-500/50 text-sm"
                    >
                      <option value="DevTools">DevTools</option>
                      <option value="Writing">Writing</option>
                      <option value="Browsing">Browsing</option>
                      <option value="MCP Server">MCP Server</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300 font-mono">Tags (komma-separeret)</label>
                    <input
                      type="text"
                      value={addTags}
                      onChange={(e) => setAddTags(e.target.value)}
                      placeholder="Cursor, Agent, MCP"
                      className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Beskrivelse</label>
                  <textarea
                    required
                    rows={3}
                    value={addDesc}
                    onChange={(e) => setAddDesc(e.target.value)}
                    placeholder="Hvad gør denne agent?"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 text-sm resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">System Prompt</label>
                  <textarea
                    rows={4}
                    value={addPrompt}
                    onChange={(e) => setAddPrompt(e.target.value)}
                    placeholder="Raw text prompt..."
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 text-sm resize-none font-mono"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold text-sm shadow shadow-violet-600/10 cursor-pointer transition-all"
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
