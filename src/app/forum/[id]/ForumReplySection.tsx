"use client";

import { useState } from "react";
import { Trash2, Send, MessageSquare } from "lucide-react";
import { ForumThread } from "@/lib/db";
import { useAuth } from "@/app/components/AuthProvider";
import dynamic from "next/dynamic";

const LoginModal = dynamic(() => import("@/app/components/LoginModal"), { ssr: false });

export default function ForumReplySection({ initialThread }: { initialThread: ForumThread }) {
  const [thread, setThread] = useState<ForumThread>(initialThread);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const { user } = useAuth();

  const handleAddReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/forum/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: thread.id,
          author: user ? user.username : undefined,
          content: replyContent,
        }),
      });

      if (res.ok) {
        const updatedThread = await res.json();
        setThread(updatedThread);
        setReplyContent("");
      }
    } catch (err) {
      console.error("Error adding reply:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    if (!confirm("Er du sikker på, at du vil slette dette svar?")) return;

    try {
      const res = await fetch(`/api/forum?threadId=${thread.id}&replyId=${replyId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setThread(prev => ({
          ...prev,
          replies: prev.replies.filter(r => r.id !== replyId)
        }));
      }
    } catch (err) {
      console.error("Error deleting reply:", err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center">
          <MessageSquare className="h-4 w-4 mr-2" />
          Svar ({thread.replies.length})
        </h3>
        
        {thread.replies.length > 0 ? (
          <div className="space-y-4">
            {thread.replies.map((reply) => (
              <div key={reply.id} className="rounded-xl bg-slate-950/50 border border-white/5 p-5 space-y-4 relative group/reply animate-in slide-in-from-bottom-2 duration-300">
                {user && (reply.author === user.username || reply.author.startsWith("vibecoder_")) && (
                  <button
                    onClick={() => handleDeleteReply(reply.id)}
                    className="absolute top-4 right-4 flex items-center justify-center p-2 rounded-lg bg-slate-900 border border-white/5 hover:bg-red-500/10 hover:border-red-500/20 text-slate-500 hover:text-red-400 transition-all opacity-0 group-hover/reply:opacity-100"
                    title="Slet svar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                
                <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap pr-8">
                  {reply.content}
                </p>
                
                <div className="flex items-center space-x-3 text-[10px] sm:text-xs text-slate-500 pt-2 border-t border-white/5">
                  <div className="flex items-center space-x-1.5">
                    <div className="h-5 w-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase">
                      {reply.author[0]}
                    </div>
                    <span className="font-bold text-slate-400">@{reply.author}</span>
                  </div>
                  <span>&middot;</span>
                  <span>{new Date(reply.createdAt).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 rounded-xl border border-white/5 bg-slate-900/10">
            <p className="text-slate-500 text-sm italic">Ingen svar endnu. Vær den første til at svare!</p>
          </div>
        )}
      </div>

      {/* Reply Input Form */}
      <form onSubmit={handleAddReply} className="space-y-4 pt-4">
        <div className="relative">
          <textarea
            required
            rows={4}
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Skriv dit svar..."
            className="w-full px-5 py-4 rounded-xl bg-slate-900/80 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 text-sm resize-none shadow-inner"
          />
        </div>

        {!user && (
          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-300/80 text-xs leading-relaxed flex items-start gap-3">
             <div className="h-5 w-5 rounded-full bg-amber-500/10 flex-shrink-0 flex items-center justify-center text-amber-400 font-bold">!</div>
             <div className="space-y-1">
                <p><strong>Gæste-tilstand:</strong> Du er ikke logget ind. Dit svar vil blive udgivet under et tilfældigt gæstenavn.</p>
                <button
                  type="button"
                  onClick={() => setLoginModalOpen(true)}
                  className="text-emerald-400 hover:text-emerald-300 font-bold underline transition-colors"
                >
                  Log ind for at bruge dit eget navn
                </button>
             </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Sender..." : "Indsend svar"}
          <Send className="h-4 w-4 ml-2" />
        </button>
      </form>

      {loginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
    </div>
  );
}
