"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search, Heart, ExternalLink, Code, Sparkles, PlusCircle, CheckCircle2, X, Trash2 } from "lucide-react";
import { ShowcaseProject } from "@/lib/db";
import { useAuth } from "../components/AuthProvider";
import { useLanguage } from "../components/LanguageProvider";
import { jsonLdScript } from "@/lib/jsonLd";

export default function ShowcasePage() {
  const [projects, setProjects] = useState<ShowcaseProject[]>([]);
  const [search, setSearch] = useState("");
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const router = useRouter();
  
  // Submit modal states
  const [submitOpen, setSubmitOpen] = useState(false);
  const [subTitle, setSubTitle] = useState("");
  const [subDesc, setSubDesc] = useState("");
  const [subTools, setSubTools] = useState("");
  const [subPrompts, setSubPrompts] = useState("");
  const [subDemo, setSubDemo] = useState("");
  const [subSuccess, setSubSuccess] = useState(false);

  // Fetch projects from API
  useEffect(() => {
    fetch("/api/showcase")
      .then((res) => res.json())
      .then((data) => setProjects(data))
      .catch((err) => console.error("Error fetching projects:", err));
  }, [language]);

  // Filter projects by search
  const filteredProjects = projects.filter((project) => {
    const q = search.toLowerCase();
    return (
      project.title.toLowerCase().includes(q) ||
      project.description.toLowerCase().includes(q) ||
      project.tools.some((t) => t.toLowerCase().includes(q))
    );
  });

  // Handle upvoting via API
  const handleUpvote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch("/api/upvote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id }),
      });
      if (res.ok) {
        const data = await res.json();
        setProjects((prev) =>
          prev.map((proj) =>
            proj.id === id ? { ...proj, upvotes: data.upvotes } : proj
          )
        );
      }
    } catch (err) {
      console.error("Upvote error:", err);
    }
  };

  // Submit project handler
  const handleSubmitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subTitle || !subDesc) return;

    const finalAuthor = user ? user.username : undefined;

    try {
      const res = await fetch("/api/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: subTitle,
          author: finalAuthor,
          description: subDesc,
          tools: subTools.split(",").map((t) => t.trim()).filter(Boolean),
          prompts: subPrompts.split("\n").map((p) => p.trim()).filter(Boolean),
          demoUrl: subDemo || "https://vibetrends.dk",
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
          setSubTools("");
          setSubPrompts("");
          setSubDemo("");
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
      const res = await fetch(`/api/showcase?projectId=${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error("Error deleting project:", err);
    }
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Vibe Coding Project Showcase",
    "description": "Showcase af innovative softwareprojekter og værktøjer bygget ved hjælp af AI.",
    "numberOfItems": filteredProjects.length,
    "itemListElement": filteredProjects.map((project, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": "SoftwareApplication",
        "name": project.title,
        "description": project.description,
        "applicationCategory": "DeveloperApplication",
        "author": {
          "@type": "Person",
          "name": project.author
        },
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD"
        }
      }
    }))
  };

  return (
    <div className="space-y-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
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

      {/* Search Bar */}
      <div className="relative max-w-md mx-auto md:mx-0">
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

      {/* Grid of Projects */}
      {filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project, index) => (
            <div
              key={project.id}
              data-testid="project-card"
              role="link"
              tabIndex={0}
              aria-label={project.title}
              onClick={() => router.push(`/showcase/${project.id}`)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  router.push(`/showcase/${project.id}`);
                }
              }}
              className="rounded-xl glass-card overflow-hidden flex flex-col justify-between group cursor-pointer"
            >
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
                    onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id, e); }}
                    aria-label={t("showcase.detail.confirm_delete")}
                    className="absolute top-4 left-4 flex items-center justify-center p-1.5 rounded-lg bg-background border border-card-border hover:bg-accent-light hover:border-accent-primary/20 text-text-secondary hover:text-accent-primary backdrop-blur-md transition cursor-pointer z-10"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}

                <button
                  onClick={(e) => { e.stopPropagation(); handleUpvote(project.id, e); }}
                  aria-label={`Upvote ${project.title}`}
                  className="absolute top-4 right-4 flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-card-border hover:bg-rose-500/20 hover:border-rose-500/40 text-foreground hover:text-accent-primary backdrop-blur-md transition cursor-pointer z-10"
                >
                  <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  <span className="text-xs font-bold font-mono">{project.upvotes}</span>
                </button>
              </div>

              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-foreground group-hover:text-accent-primary transition-colors leading-tight">
                    {project.title}
                  </h3>
                  <p className="text-xs text-text-secondary">{t("showcase.by")}: {project.author}</p>
                  <p className="text-sm text-text-secondary line-clamp-3 pt-1">
                    {project.description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-2">
                  {project.tools.slice(0, 3).map((tool) => (
                    <span key={tool} className="px-2 py-0.5 text-xs rounded bg-background text-text-secondary border border-card-border">
                      {tool}
                    </span>
                  ))}
                  {project.tools.length > 3 && (
                    <span className="px-2 py-0.5 text-xs rounded bg-background text-text-secondary border border-card-border">
                      +{project.tools.length - 3}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-card-border gap-2">
                  <div
                    className="flex-1 flex items-center justify-center space-x-1.5 py-2 rounded-lg bg-violet-600/10 border border-accent-primary/20 group-hover:bg-violet-600/20 text-accent-primary text-xs font-semibold transition-colors"
                  >
                    <Code className="h-3.5 w-3.5" />
                    <span>{t("showcase.details")}</span>
                  </div>

                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-background border border-card-border hover:bg-card-border text-foreground transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </div>
                </div>
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-text-secondary">{t("showcase.modal.label_tech")}</label>
                    <input
                      type="text"
                      value={subTools}
                      onChange={(e) => setSubTools(e.target.value)}
                      placeholder={t("showcase.modal.placeholder_tech")}
                      className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-slate-600 focus:outline-none focus:border-accent-primary/20 text-sm"
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
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-text-secondary flex items-center justify-between">
                    <span>{t("showcase.modal.label_prompts")}</span>
                    <span className="text-[10px] text-text-secondary font-normal">Valgfri</span>
                  </label>
                  <textarea
                    rows={3}
                    value={subPrompts}
                    onChange={(e) => setSubPrompts(e.target.value)}
                    placeholder={t("showcase.modal.placeholder_prompts")}
                    className="w-full px-3.5 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-slate-600 focus:outline-none focus:border-accent-primary/20 text-sm resize-none"
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
    </div>
  );
}
