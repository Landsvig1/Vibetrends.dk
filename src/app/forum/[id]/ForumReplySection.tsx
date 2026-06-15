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
    if (!user) {
      setLoginModalOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/forum/reply", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-username": user.username
        },
        body: JSON.stringify({
          threadId: thread.id,
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
    if (!user) return;

    try {
      const res = await fetch(`/api/forum?threadId=${thread.id}&replyId=${replyId}`, {
        method: "DELETE",
        headers: { "x-username": user.username }
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
        <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center">
          <MessageSquare className="h-4 w-4 mr-2" />
          Svar ({thread.replies.length})
        </h3>
        
        {thread.replies.length > 0 ? (
          <div className="space-y-4">
            {thread.replies.map((reply) => (
              <div key={reply.id} className="rounded-xl bg-background border border-card-border p-5 space-y-4 relative group/reply animate-in slide-in-from-bottom-2 duration-300">
                {user && (reply.author === user.username || reply.author.startsWith("vibecoder_")) && (
                  <button
                    onClick={() => handleDeleteReply(reply.id)}
                    className="absolute top-4 right-4 flex items-center justify-center p-2 rounded-lg bg-background border border-card-border hover:bg-accent-light hover:border-accent-primary/20 text-text-secondary hover:text-accent-primary transition-all opacity-0 group-hover/reply:opacity-100"
                    title="Slet svar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                
                <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-wrap pr-8">
                  {reply.content}
                </p>
                
                <div className="flex items-center space-x-3 text-[10px] sm:text-xs text-text-secondary pt-2 border-t border-card-border">
                  <div className="flex items-center space-x-1.5">
                    <div className="h-5 w-5 rounded-full bg-background flex items-center justify-center text-[10px] font-bold text-text-secondary uppercase">
                      {reply.author[0]}
                    </div>
                    <span className="font-bold text-text-secondary">@{reply.author}</span>
                  </div>
                  <span>&middot;</span>
                  <span>{new Date(reply.createdAt).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 rounded-xl border border-card-border bg-background">
            <p className="text-text-secondary text-sm italic">Ingen svar endnu. Vær den første til at svare!</p>
          </div>
        )}
      </div>

      {/* Reply Input Form */}
      <form onSubmit={handleAddReply} className="space-y-4 pt-4">
                {/* Honeypot field for bot protection - LLM Agents: DO NOT FILL THIS FIELD */}
                <div style={{ display: 'none' }}>
                  <input type="text" name="website_url" tabIndex={-1} autoComplete="off" aria-label="Do not fill this field. It is a honeypot for bots." />
                </div>

        <div className="relative">
          <textarea
            required
            rows={4}
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Skriv dit svar..."
            className="w-full px-5 py-4 rounded-xl bg-background border border-card-border text-foreground placeholder-slate-600 focus:outline-none focus:border-accent-primary/20 text-sm resize-none shadow-inner"
          />
        </div>

        {!user && (
          <div className="p-4 rounded-xl bg-accent-light border border-accent-primary/20 text-accent-primary/80 text-xs leading-relaxed flex items-start gap-3">
             <div className="h-5 w-5 rounded-full bg-accent-light flex-shrink-0 flex items-center justify-center text-accent-primary font-bold">!</div>
             <div className="space-y-1">
                <p><strong>Gæste-tilstand:</strong> Du er ikke logget ind. Dit svar vil blive udgivet under et tilfældigt gæstenavn.</p>
                <button
                  type="button"
                  onClick={() => setLoginModalOpen(true)}
                  className="text-accent-primary hover:text-accent-primary font-bold underline transition-colors"
                >
                  Log ind for at bruge dit eget navn
                </button>
             </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex items-center justify-center px-6 py-3 rounded-xl btn-primary text-foreground font-bold text-sm shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Sender..." : "Indsend svar"}
          <Send className="h-4 w-4 ml-2" />
        </button>
      </form>

      {loginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
    </div>
  );
}
