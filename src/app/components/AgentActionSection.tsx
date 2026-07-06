"use client";

import { useState } from "react";
import { Heart, Trash2, Terminal } from "lucide-react";
import { Agent } from "@/lib/db";
import { useAuth } from "@/app/components/AuthProvider";
import { useLanguage } from "@/app/components/LanguageProvider";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const LoginModal = dynamic(() => import("@/app/components/LoginModal"), { ssr: false });

export default function AgentActionSection({ agent: initialAgent, backHref = "/agents" }: { agent: Agent; backHref?: string }) {
  const [agent, setAgent] = useState<Agent>(initialAgent);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const router = useRouter();

  const handleCopyCommand = (command: string, type: "prompt") => {
    navigator.clipboard.writeText(command);
    setCopiedId(type);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUpvote = async () => {
    if (!user) {
      setLoginModalOpen(true);
      return;
    }
    try {
      const res = await fetch(`/api/agents/${agent.id}/upvote`, { method: "POST" });
      if (res.status === 401) {
        // Session expired since page load — silently dropping the click made
        // the button look broken, so surface the login modal instead.
        setLoginModalOpen(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setAgent(prev => ({ ...prev, upvotes: data.upvotes }));
      }
    } catch (err) {
      console.error("Error upvoting agent:", err);
    }
  };

  const handleDeleteAgent = async () => {
    if (!confirm(t("agents.confirm_delete"))) return;

    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.push(backHref);
      }
    } catch (err) {
      console.error("Error deleting agent:", err);
    }
  };

  return (
    <div className="space-y-6 sticky top-24">
      <div className="p-6 rounded-2xl glass-panel border border-card-border space-y-6 shadow-xl">
        <div className="grid grid-cols-1 gap-3">
           <button
             onClick={handleUpvote}
             className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-accent-primary font-bold hover:bg-rose-500/20 transition active:scale-[0.98] cursor-pointer"
           >
             <Heart className="h-4 w-4 fill-current" />
             {language === "da" ? "Upvote Agent" : "Upvote Agent"}
           </button>
           
           <button
             onClick={() => handleCopyCommand(agent.systemPrompt, "prompt")}
             className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-violet-600/10 border border-accent-primary/20 text-accent-primary font-bold hover:bg-violet-600/20 transition active:scale-[0.98] cursor-pointer"
           >
             <Terminal className="h-4 w-4" />
             {copiedId === "prompt" ? t("agents.detail.prompt_copied") : t("agents.detail.copy_prompt")}
           </button>
        </div>

        {user && (agent.developer === user.username || agent.developer.startsWith("vibecoder_")) && (
          <div className="pt-4 border-t border-card-border">
            <button
              onClick={handleDeleteAgent}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent-light border border-accent-primary/20 text-accent-primary/70 hover:text-accent-primary hover:bg-accent-light transition text-xs font-bold cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {language === "da" ? "Afregistrer Agent" : "Unregister Agent"}
            </button>
          </div>
        )}
      </div>

      {loginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
    </div>
  );
}
