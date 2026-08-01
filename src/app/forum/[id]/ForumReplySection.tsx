"use client";

import { useState, useCallback } from "react";
import { Send, MessageSquare } from "lucide-react";
import { ForumThread } from "@/lib/db";
import { useAuth } from "@/app/components/AuthProvider";
import { canDelete } from "@/lib/permissions";
import { ReplyCard } from "@/app/components/ReplyCard";
import dynamic from "next/dynamic";

const LoginModal = dynamic(() => import("@/app/components/LoginModal"), { ssr: false });

export default function ForumReplySection({ initialThread }: { initialThread: ForumThread }) {
  const [thread, setThread] = useState<ForumThread>(initialThread);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const { user } = useAuth();

  const handleUpvoteReply = useCallback(async (replyId: string) => {
    if (!user) {
      setLoginModalOpen(true);
      return;
    }
    try {
      const res = await fetch(`/api/forum/${thread.id}/replies/${replyId}/upvote`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setThread(prev => ({
          ...prev,
          replies: prev.replies.map(r =>
            r.id === replyId ? { ...r, upvotes: data.upvotes } : r
          ),
        }));
      }
    } catch (err) {
      console.error("Error upvoting reply:", err);
    }
  }, [user, thread.id]);

  const handleDeleteReply = useCallback(async (replyId: string) => {
    if (!confirm("Er du sikker på, at du vil slette dette svar?")) return;
    if (!user) return;

    try {
      const res = await fetch(`/api/forum/${thread.id}/replies/${replyId}`, {
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
  }, [user, thread.id]);

  const handleAddReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent || submitting) return;
    if (!user) {
      setLoginModalOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/forum/${thread.id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyContent }),
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

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center">
          <MessageSquare className="h-4 w-4 mr-2" />
          Svar ({thread.replies.length})
        </h3>
        
        {thread.replies.length > 0 ? (
          <div className="space-y-4">
            {thread.replies.map((reply) => {
              const userCanDelete = canDelete(user, reply.author, (a) => a.startsWith("vibecoder_"));
              return (
                <ReplyCard
                  key={reply.id}
                  reply={reply}
                  canDelete={userCanDelete}
                  onUpvote={handleUpvoteReply}
                  onDelete={handleDeleteReply}
                />
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 rounded-xl border border-card-border bg-background">
            <p className="text-text-secondary text-sm italic">Ingen svar endnu. Skriv det første svar nedenfor!</p>
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
            placeholder="Skriv dit svar her..."
            className="w-full px-5 py-4 rounded-xl bg-background border border-card-border text-foreground placeholder-slate-600 focus:outline-none focus:border-accent-primary/20 text-sm resize-none shadow-inner"
          />
        </div>

        {!user && (
          <div className="p-4 rounded-xl bg-accent-light border border-accent-primary/20 text-accent-primary/80 text-xs leading-relaxed flex items-start gap-3">
             <div className="h-5 w-5 rounded-full bg-accent-light flex-shrink-0 flex items-center justify-center text-accent-primary font-bold">!</div>
             <div className="space-y-1">
                <p><strong>Du er ikke logget ind.</strong> Hvis du fortsætter, vil din handling blive udført under et gæstenavn.</p>
                <button
                  type="button"
                  onClick={() => setLoginModalOpen(true)}
                  className="text-accent-primary hover:text-accent-primary font-bold underline transition-colors"
                >
                  Log ind med E-mail, Google eller GitHub
                </button>
             </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="flex items-center justify-center px-6 py-3 rounded-xl btn-primary text-foreground font-bold text-sm shadow-sm transition hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Sender…" : "Send Svar"}
          <Send className="h-4 w-4 ml-2" aria-hidden="true" />
        </button>
      </form>

      {loginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
    </div>
  );
}
