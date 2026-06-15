"use client";

import { useState } from "react";
import { Copy, CheckCircle, Heart, Trash2, Terminal } from "lucide-react";
import { Agent } from "@/lib/db";
import { useAuth } from "@/app/components/AuthProvider";
import { useRouter } from "next/navigation";

export default function AgentActionSection({ agent: initialAgent }: { agent: Agent }) {
  const [agent, setAgent] = useState<Agent>(initialAgent);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();

  const handleCopyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedId("install");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUpvote = async () => {
    try {
      const res = await fetch("/api/upvote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setAgent(prev => ({ ...prev, upvotes: data.upvotes }));
      }
    } catch (err) {
      console.error("Error upvoting agent:", err);
    }
  };

  const handleDeleteAgent = async () => {
    if (!confirm("Er du sikker på, at du vil afregistrere denne agent?")) return;

    try {
      const res = await fetch(`/api/agents?agentId=${agent.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.push("/agents");
      }
    } catch (err) {
      console.error("Error deleting agent:", err);
    }
  };

  return (
    <div className="space-y-6 sticky top-24">
      <div className="p-6 rounded-2xl glass-panel border border-white/10 space-y-6 shadow-xl">
        <div className="space-y-2">
           <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Hurtig Installation</h4>
           <div className="flex items-center justify-between rounded-xl bg-slate-950 border border-white/5 p-4 font-mono text-xs text-cyan-300 shadow-inner group">
              <span className="truncate pr-4">{agent.installCommand}</span>
              <button
                onClick={() => handleCopyCommand(agent.installCommand)}
                className="p-2 rounded-lg bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
              >
                {copiedId === "install" ? (
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
           </div>
        </div>

        <div className="grid grid-cols-1 gap-3 pt-2">
           <button
             onClick={handleUpvote}
             className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold hover:bg-rose-500/20 transition-all active:scale-[0.98]"
           >
             <Heart className="h-4 w-4 fill-current" />
             Upvote Agent
           </button>
           
           <button
             onClick={() => handleCopyCommand(agent.systemPrompt)}
             className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-violet-600/10 border border-violet-500/20 text-violet-300 font-bold hover:bg-violet-600/20 transition-all active:scale-[0.98]"
           >
             <Terminal className="h-4 w-4" />
             Kopier Prompt
           </button>
        </div>

        {user && (agent.developer === user.username || agent.developer.startsWith("vibecoder_")) && (
          <div className="pt-4 border-t border-white/5">
            <button
              onClick={handleDeleteAgent}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/5 border border-red-500/10 text-red-500/70 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs font-bold"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Afregistrer Agent
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
