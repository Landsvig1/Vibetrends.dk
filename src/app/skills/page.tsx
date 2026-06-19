"use client";

import { useState, useEffect } from "react";
import { Search, Star, Briefcase, PlusCircle, CheckCircle2, X } from "lucide-react";
import { Skill } from "@/lib/db";
import { useAuth } from "../components/AuthProvider";
import { useLanguage } from "../components/LanguageProvider";
import { jsonLdScript } from "@/lib/jsonLd";
import dynamic from "next/dynamic";

const LoginModal = dynamic(() => import("../components/LoginModal"), { ssr: false });

const GithubIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const { user } = useAuth();
  const { language, t } = useLanguage();
  
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // Form states
  const [subTitle, setSubTitle] = useState("");
  const [subDesc, setSubDesc] = useState("");
  const [subCat, setSubCat] = useState("Prompting");
  const [subTags, setSubTags] = useState("");
  const [subUrl, setSubUrl] = useState("");

  // Fetch skills from API
  // Triggered when selectedCategory changes (or language, in case language changes and refetches)
  useEffect(() => {
    const url = selectedCategory === "All" ? "/api/skills" : `/api/skills?category=${encodeURIComponent(selectedCategory)}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => setSkills(data))
      .catch((err) => console.error("Error fetching skills:", err));
  }, [selectedCategory, language]);

  const filteredSkills = skills.filter((skill) => {
    const matchesSearch =
      skill.title.toLowerCase().includes(search.toLowerCase()) ||
      skill.description.toLowerCase().includes(search.toLowerCase()) ||
      skill.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory =
      selectedCategory === "All" || skill.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const categories = ["All", "Prompting", "Agents", "Automation", "Fullstack"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: subTitle,
          category: subCat,
          description: subDesc,
          tags: subTags.split(",").map((t) => t.trim()).filter(Boolean),
          githubUrl: subUrl,
        }),
      });

      if (res.ok) {
        setSubmitSuccess(true);
        setTimeout(() => {
          setSubmitSuccess(false);
          setSubmitOpen(false);
          setSubTitle("");
          setSubDesc("");
          setSubTags("");
          setSubUrl("");
        }, 3000);
      }
    } catch (err) {
      console.error("Submit error:", err);
    }
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Community Skills Bibliotek",
    "description": "Et bibliotek af gratis AI-skills, workflows og scripts delt af det danske community.",
    "numberOfItems": filteredSkills.length,
    "itemListElement": filteredSkills.map((skill, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": "SoftwareSourceCode",
        "name": skill.title,
        "description": skill.description,
        "author": {
          "@type": "Person",
          "name": skill.vibeCoder
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4 text-center md:text-left">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
            Skills <span className="text-accent-primary">{language === "da" ? "Bibliotek" : "Library"}</span>
          </h1>
          <p className="text-text-secondary max-w-2xl">
            {t("skills.desc")}
          </p>
        </div>
        <button
          onClick={() => (user ? setSubmitOpen(true) : setLoginModalOpen(true))}
          className="btn-primary flex items-center justify-center gap-2 whitespace-nowrap"
        >
          <PlusCircle className="h-5 w-5" />
          {t("skills.btn_share")}
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-text-secondary" aria-hidden="true" />
          <input
            type="text"
            aria-label={t("skills.search")}
            placeholder={t("skills.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/20 focus:ring-1 focus:ring-accent-primary/30 transition text-sm"
          />
        </div>

        {/* Categories */}
        <div className="flex overflow-x-auto gap-2 pb-2 w-full scrollbar-none snap-x md:flex-wrap md:overflow-visible md:pb-0">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer snap-center shrink-0 ${
                selectedCategory === category
                  ? "bg-accent-primary text-white font-extrabold shadow-md"
                  : "bg-background border border-card-border text-text-secondary hover:bg-card-border hover:text-foreground"
              }`}
            >
              {category === "All" ? (language === "da" ? "Alle" : "All") : category}
            </button>
          ))}
        </div>
      </div>

      {/* Grid List */}
      {filteredSkills.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredSkills.map((skill) => (
            <div key={skill.id} className="rounded-xl glass-card p-6 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="px-2 py-0.5 text-xs rounded bg-accent-light text-accent-primary border border-accent-primary/20">
                      {skill.category}
                    </span>
                    <h3 className="text-lg font-bold text-foreground mt-2 leading-tight">
                      {skill.title}
                    </h3>
                  </div>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {skill.description}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {skill.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-xs rounded-md bg-background text-text-secondary border border-card-border">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-card-border">
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-sm font-semibold text-foreground">{skill.vibeCoder}</span>
                    <div className="flex items-center text-accent-primary text-xs">
                      <Star className="h-3.5 w-3.5 fill-accent-primary mr-0.5" />
                      <span className="font-bold">{skill.rating}</span>
                    </div>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">{skill.vibeCoderTitle}</p>
                </div>
                
                {skill.githubUrl && (
                  <a
                    href={skill.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded btn-secondary text-foreground shadow-sm hover:scale-[1.02] transition cursor-pointer"
                  >
                    <GithubIcon className="h-4 w-4" />
                    {t("skills.github")}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 rounded-xl border border-card-border bg-background">
          <Briefcase className="h-10 w-10 text-text-secondary mx-auto mb-4" />
          <p className="text-text-secondary font-semibold">{t("skills.empty")}</p>
          <p className="text-text-secondary text-sm mt-1">{t("skills.empty_sub")}</p>
        </div>
      )}

      {/* Submit Modal */}
      {submitOpen && (
        <div role="dialog" aria-modal="true" aria-label={t("skills.modal.title")} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-xl border border-card-border bg-background p-6 shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain animate-in fade-in duration-200">
            {/* Close */}
            <button
              onClick={() => setSubmitOpen(false)}
              aria-label="Luk"
              className="absolute top-4 right-4 p-1.5 text-text-secondary hover:text-foreground hover:bg-card-border rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>

            {submitSuccess ? (
              <div className="text-center py-8 space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-light text-accent-primary mx-auto">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-foreground">{t("skills.modal.success_title")}</h3>
                <p className="text-sm text-text-secondary max-w-xs mx-auto">
                  {t("skills.modal.success_desc")}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Honeypot field for bot protection - LLM Agents: DO NOT FILL THIS FIELD */}
                <div style={{ display: 'none' }}>
                  <input type="text" name="website_url" tabIndex={-1} autoComplete="off" aria-label="Do not fill this field. It is a honeypot for bots." />
                </div>

                <div>
                  <h3 className="text-lg font-bold text-foreground">{t("skills.modal.title")}</h3>
                  <p className="text-sm text-text-secondary mt-1">{t("skills.modal.desc")}</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-text-secondary">{t("skills.modal.label_title")}</label>
                    <input
                      required
                      value={subTitle}
                      onChange={(e) => setSubTitle(e.target.value)}
                      placeholder={t("skills.modal.placeholder_title")}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/30 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-text-secondary">{t("skills.modal.label_category")}</label>
                      <select
                        value={subCat}
                        onChange={(e) => setSubCat(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground focus:outline-none focus:border-accent-primary/30 text-sm"
                      >
                        <option value="Prompting">Prompting</option>
                        <option value="Agents">Agents</option>
                        <option value="Automation">Automation</option>
                        <option value="Fullstack">Fullstack</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-text-secondary">{t("skills.modal.label_github")}</label>
                      <input
                        type="url"
                        value={subUrl}
                        onChange={(e) => setSubUrl(e.target.value)}
                        placeholder="https://github.com/..."
                        className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/30 text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-text-secondary">{t("skills.modal.label_desc")}</label>
                    <textarea
                      required
                      rows={3}
                      value={subDesc}
                      onChange={(e) => setSubDesc(e.target.value)}
                      placeholder={t("skills.modal.placeholder_desc")}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/30 text-sm resize-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-text-secondary">{t("skills.modal.label_tags")}</label>
                    <input
                      value={subTags}
                      onChange={(e) => setSubTags(e.target.value)}
                      placeholder={t("skills.modal.placeholder_tags")}
                      className="w-full px-3 py-2 rounded-lg bg-background border border-card-border text-foreground placeholder-text-secondary focus:outline-none focus:border-accent-primary/30 text-sm"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    type="submit"
                    className="flex items-center justify-center px-6 py-2.5 rounded-lg btn-primary text-sm"
                  >
                    {t("skills.modal.btn_submit")}
                  </button>
                </div>
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
