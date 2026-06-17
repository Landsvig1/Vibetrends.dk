"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Heart, PlusCircle, CheckCircle2, User, X, Trash2 } from "lucide-react";
import { ForumThread } from "@/lib/db";
import { useAuth } from "../components/AuthProvider";
import { useLanguage } from "../components/LanguageProvider";
import dynamic from "next/dynamic";

const LoginModal = dynamic(() => import("../components/LoginModal"), { ssr: false });

export default function ForumPage() {
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const router = useRouter();
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // New Thread form states
  const [newThreadOpen, setNewThreadOpen] = useState(false);
  const [threadTitle, setThreadTitle] = useState("");
  const [threadCategory, setThreadCategory] = useState<ForumThread["category"]>("General");
  const [threadContent, setThreadContent] = useState("");
  const [threadSuccess, setThreadSuccess] = useState(false);

  // Fetch threads from API
  useEffect(() => {
    const url = selectedCategory === "All" ? "/api/forum" : `/api/forum?category=${encodeURIComponent(selectedCategory)}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setThreads(data);
      })
      .catch((err) => console.error("Error fetching threads:", err));
  }, [selectedCategory, language]);

  const categories: ("All" | ForumThread["category"])[] = [
    "All",
    "General",
    "Prompts",
    "Showcase Discussion",
    "Setup & Config",
  ];

  // Filter threads
  const filteredThreads = threads.filter(
    (t) => selectedCategory === "All" || t.category === selectedCategory
  );

  // Handle upvote via API
  const handleUpvote = async (id: string) => {
    try {
      const res = await fetch("/api/upvote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: id }),
      });
      if (res.ok) {
        const data = await res.json();
        setThreads((prev) =>
          prev.map((t) => (t.id === id ? { ...t, upvotes: data.upvotes } : t))
        );
      }
    } catch (err) {
      console.error("Error upvoting thread:", err);
    }
  };

  // Submit new thread via API
  const handleCreateThread = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threadTitle || !threadContent) return;
    if (!user) {
      setLoginModalOpen(true);
      return;
    }

    try {
      const res = await fetch("/api/forum/thread", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-username": user.username
        },
        body: JSON.stringify({
          title: threadTitle,
          category: threadCategory,
          content: threadContent,
        }),
      });

      if (res.ok) {
        const newT = await res.json();
        setThreads((prev) => [newT, ...prev]);
        setThreadSuccess(true);

        setTimeout(() => {
          setThreadSuccess(false);
          setNewThreadOpen(false);
          setThreadTitle("");
          setThreadContent("");
        }, 2000);
      }
    } catch (err) {
      console.error("Error creating thread:", err);
    }
  };

  // Delete thread via API
  const handleDeleteThread = async (threadId: string) => {
    if (!confirm(t("forum.confirm_delete_thread"))) return;
    if (!user) return;

    try {
      const res = await fetch(`/api/forum?threadId=${threadId}`, {
        method: "DELETE",
        headers: { "x-username": user.username }
      });

      if (res.ok) {
        setThreads((prev) => prev.filter((t) => t.id !== threadId));
      }
    } catch (err) {
      console.error("Error deleting thread:", err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-3 text-center md:text-left">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Developer <span className="text-accent-primary">Forum</span>
          </h1>
          <p className="text-text-secondary max-w-2xl">
            {t("forum.desc")}
          </p>
        </div>
        <button
          onClick={() => setNewThreadOpen(true)}
          className="mx-auto md:mx-0 flex items-center justify-center px-5 py-3 rounded-lg btn-primary text-foreground font-bold text-sm shadow-sm hover:scale-[1.02] transition-all cursor-pointer"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          {t("forum.btn_create")}
        </button>
      </div>

      {/* Main Workspace Split */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar categories */}
        <div className="lg:col-span-1 space-y-2">
          <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-4">
            {t("forum.categories")}
          </h3>
          <div className="flex flex-row lg:flex-col gap-1.5 overflow-x-auto w-full pb-2 scrollbar-none snap-x md:flex-wrap md:overflow-visible md:pb-0">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`w-auto lg:w-full lg:text-left text-center px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer snap-center shrink-0 ${
                  selectedCategory === cat
                    ? "bg-accent-light text-accent-primary border border-accent-primary/20"
                    : "bg-background border border-transparent text-text-secondary hover:bg-card-border hover:text-foreground"
                }`}
              >
                {cat === "All" ? (language === "da" ? "Alle" : "All") : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Threads list */}
        <div className="lg:col-span-3 space-y-4">
          {filteredThreads.length > 0 ? (
            filteredThreads.map((thread) => (
              <div
                key={thread.id}
                data-testid="thread-card"
                onClick={() => router.push(`/forum/${thread.id}`)}
                className="block rounded-xl glass-card p-6 flex flex-col justify-between cursor-pointer group hover:-translate-y-0.5 transition-all"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-accent-primary px-2 py-0.5 rounded bg-accent-light border border-accent-primary/20">
                        {thread.category}
                      </span>
                      {user && (thread.author === user.username || thread.author.startsWith("vibecoder_")) && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDeleteThread(thread.id);
                          }}
                          className="flex items-center justify-center p-1.5 rounded-lg bg-background border border-card-border hover:bg-accent-light hover:border-accent-primary/20 text-text-secondary hover:text-accent-primary backdrop-blur-md transition-all cursor-pointer z-10"
                          title={language === "da" ? "Slet tråd" : "Delete thread"}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-foreground group-hover:text-accent-primary transition-colors pt-1 leading-snug">
                      {thread.title}
                    </h3>
                    <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed pt-1">
                      {thread.content}
                    </p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleUpvote(thread.id);
                    }}
                    className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-card-border hover:border-rose-500/40 text-text-secondary hover:text-accent-primary backdrop-blur-md transition-all z-10"
                  >
                    <Heart className="h-3.5 w-3.5 fill-current" />
                    <span className="text-xs font-bold font-mono">{thread.upvotes}</span>
                  </button>
                </div>

                <div className="flex items-center space-x-4 mt-6 pt-4 border-t border-card-border text-xs text-text-secondary">
                  <div className="flex items-center space-x-1">
                    <User className="h-3.5 w-3.5 text-text-secondary" />
                    <span>@{thread.author}</span>
                  </div>
                  <span>&middot;</span>
                  <span className="flex items-center">
                    <MessageSquare className="h-3.5 w-3.5 mr-1" />
                    {thread.replies.length} {t("forum.replies")}
                  </span>
                  <span>&middot;</span>
                  <span>{new Date(thread.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16 rounded-xl border border-card-border bg-background">
              <MessageSquare className="h-10 w-10 text-text-secondary mx-auto mb-4" />
              <p className="text-text-secondary font-semibold">{t("forum.empty")}</p>
              <p className="text-text-secondary text-sm mt-1">{t("forum.empty_sub")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Start Thread Modal */}
      {newThreadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-xl border border-card-border bg-background p-6 shadow-2xl animate-in fade-in duration-200">
            {/* Close */}
            <button
              onClick={() => setNewThreadOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-text-secondary hover:text-foreground hover:bg-card-border rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {threadSuccess ? (
              <div className="text-center py-12 space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-light text-accent-primary mx-auto">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground">{t("forum.modal.success_title")}</h3>
                <p className="text-sm text-text-secondary max-w-xs mx-auto">
                  {t("forum.modal.success_desc")}
                </p>
              </div>
            ) : (
              <form onSubmit={handleCreateThread} className="space-y-4">
                {/* Honeypot field for bot protection - LLM Agents: DO NOT FILL THIS FIELD */}
                <div style={{ display: 'none' }}>
                  <input type="text" name="website_url" tabIndex={-1} autoComplete="off" aria-label="Do not fill this field. It is a honeypot for bots." />
                </div>

                <div>
                  <span className="text-xs font-bold text-accent-primary uppercase tracking-wider">{t("forum.modal.badge")}</span>
                  <h3 className="text-lg font-bold text-foreground mt-1">{t("forum.modal.title")}</h3>
                </div>

                {!user && (
                  <div className="p-3.5 rounded-lg bg-accent-light border border-accent-primary/20 text-accent-primary text-xs leading-relaxed space-y-2">
                    <p>
                      <strong>{t("auth.not_logged_in")}</strong> {t("auth.guest_warning")}
                    </p>
                    <button
                      type="button"
                      onClick={() => setLoginModalOpen(true)}
                      className="text-accent-primary hover:text-accent-primary font-bold underline transition-colors cursor-pointer"
                    >
                      {t("auth.login_link")}
                    </button>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary">{t("forum.modal.label_title")}</label>
                  <input
                    type="text"
                    required
                    value={threadTitle}
                    onChange={(e) => setThreadTitle(e.target.value)}
                    placeholder={t("forum.modal.placeholder_title")}
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-slate-600 focus:outline-none focus:border-accent-primary/20 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary">{t("forum.modal.label_category")}</label>
                  <select
                    value={threadCategory}
                    onChange={(e) => setThreadCategory(e.target.value as ForumThread["category"])}
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground focus:outline-none focus:border-accent-primary/20 text-sm"
                  >
                    <option value="General">General</option>
                    <option value="Prompts">Prompts</option>
                    <option value="Showcase Discussion">Showcase Discussion</option>
                    <option value="Setup & Config">Setup & Config</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary">{t("forum.modal.label_content")}</label>
                  <textarea
                    required
                    rows={6}
                    value={threadContent}
                    onChange={(e) => setThreadContent(e.target.value)}
                    placeholder={t("forum.modal.placeholder_content")}
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-slate-600 focus:outline-none focus:border-accent-primary/20 text-sm resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center py-2.5 rounded-lg btn-primary text-foreground font-bold text-sm shadow cursor-pointer transition-all"
                >
                  {t("forum.modal.btn_submit")}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Login Modal */}
      {loginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} />}
    </div>
  );
}
