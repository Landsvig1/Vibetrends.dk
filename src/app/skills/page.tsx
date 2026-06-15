"use client";

import { useState, useEffect } from "react";
import { Search, Star, Briefcase, Mail, CheckCircle2, X } from "lucide-react";
import { db, Skill } from "@/lib/db";
import { useAuth } from "../components/AuthProvider";

export default function SkillsPage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [bookingSkill, setBookingSkill] = useState<Skill | null>(null);
  const { user } = useAuth();
  const [bookingEmail, setBookingEmail] = useState("");
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingSuccess, setBookingSuccess] = useState(false);

  useEffect(() => {
    if (user?.email) {
      setTimeout(() => setBookingEmail(user.email), 0);
    }
  }, [user]);

  // Filter skills client-side for instant search response
  const filteredSkills = db.skills.filter((skill) => {
    const matchesSearch =
      skill.title.toLowerCase().includes(search.toLowerCase()) ||
      skill.description.toLowerCase().includes(search.toLowerCase()) ||
      skill.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));

    const matchesCategory =
      selectedCategory === "All" || skill.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const categories = ["All", "Prompting", "Agents", "Automation", "Fullstack"];

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingEmail || !bookingMessage || !bookingSkill) return;

    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: bookingEmail,
          skillId: bookingSkill.id,
          message: bookingMessage,
        }),
      });

      if (res.ok) {
        setBookingSuccess(true);
        setTimeout(() => {
          setBookingSuccess(false);
          setBookingSkill(null);
          setBookingEmail("");
          setBookingMessage("");
        }, 4000);
      }
    } catch (err) {
      console.error("Booking error:", err);
    }
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Freelance AI & Vibe Coding Services",
    "description": "Markedsplads for freelance AI-specialister og vibe-kodere i Danmark.",
    "numberOfItems": filteredSkills.length,
    "itemListElement": filteredSkills.map((skill, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": "Service",
        "name": skill.title,
        "description": skill.description,
        "provider": {
          "@type": "Person",
          "name": skill.vibeCoder,
          "jobTitle": skill.vibeCoderTitle,
        },
        "offers": {
          "@type": "Offer",
          "price": skill.price.replace("$", ""),
          "priceCurrency": "USD",
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": skill.rating,
          "reviewCount": skill.reviewsCount,
        }
      }
    }))
  };

  return (
    <div className="space-y-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Page Header */}
      <div className="space-y-4 text-center md:text-left">
        <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">
          Skills <span className="text-cyan-400">Marketplace</span>
        </h1>
        <p className="text-slate-400 max-w-2xl">
          Find og hyr freelance AI-specialister og vibe coders til at bygge dine workflows, konfigurere dine agenter eller optimere din Cursor-opsætning.
        </p>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-500" />
          <input
            type="text"
            placeholder="Søg efter kompetencer, fx 'Cursor', 'LangGraph'..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-900/80 border border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 transition-all text-sm"
          />
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                selectedCategory === category
                  ? "bg-cyan-500 text-slate-950 font-extrabold shadow-md shadow-cyan-500/20"
                  : "bg-white/5 border border-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              }`}
            >
              {category}
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
                    <span className="px-2 py-0.5 text-xs rounded bg-violet-950/60 text-violet-300 border border-violet-500/20">
                      {skill.category}
                    </span>
                    <h3 className="text-lg font-bold text-white mt-2 leading-tight">
                      {skill.title}
                    </h3>
                  </div>
                  <span className="text-xl font-bold text-emerald-400 font-mono">
                    {skill.price}
                  </span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {skill.description}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {skill.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-xs rounded-md bg-white/5 text-slate-300 border border-white/5">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-sm font-semibold text-white">{skill.vibeCoder}</span>
                    <div className="flex items-center text-amber-400 text-xs">
                      <Star className="h-3.5 w-3.5 fill-amber-400 mr-0.5" />
                      <span className="font-bold">{skill.rating}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{skill.vibeCoderTitle}</p>
                </div>
                
                <button
                  onClick={() => setBookingSkill(skill)}
                  className="px-4 py-2 text-xs font-semibold rounded bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white shadow shadow-violet-600/10 hover:scale-[1.02] transition-all cursor-pointer"
                >
                  Book Vibe Coder
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 rounded-xl border border-white/5 bg-slate-900/20">
          <Briefcase className="h-10 w-10 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 font-semibold">Ingen kompetencer matcher din søgning.</p>
          <p className="text-slate-500 text-sm mt-1">Prøv at søge efter noget andet eller nulstil filtre.</p>
        </div>
      )}

      {/* Booking Modal */}
      {bookingSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-xl border border-white/10 bg-slate-900 p-6 shadow-2xl animate-in fade-in duration-200">
            {/* Close */}
            <button
              onClick={() => setBookingSkill(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {bookingSuccess ? (
              <div className="text-center py-8 space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 mx-auto">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-white">Forespørgsel Sendt!</h3>
                <p className="text-sm text-slate-300 max-w-xs mx-auto">
                  Din besked er leveret til <span className="font-semibold text-white">{bookingSkill.vibeCoder}</span>. Du modtager svar på din angivne mail indenfor kort tid.
                </p>
              </div>
            ) : (
              <form onSubmit={handleBookingSubmit} className="space-y-4">
                <div>
                  <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Book Vibe Coder</span>
                  <h3 className="text-lg font-bold text-white mt-1">{bookingSkill.title}</h3>
                  <p className="text-xs text-slate-400 mt-1">Leveres af: {bookingSkill.vibeCoder} ({bookingSkill.price})</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Din E-mail</label>
                  <input
                    type="email"
                    required
                    value={bookingEmail}
                    onChange={(e) => setBookingEmail(e.target.value)}
                    placeholder="eksempel@firma.dk"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Projektbeskrivelse</label>
                  <textarea
                    required
                    rows={4}
                    value={bookingMessage}
                    onChange={(e) => setBookingMessage(e.target.value)}
                    placeholder="Beskriv hvad du har brug for hjælp til, og din tidsramme..."
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-white/10 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 text-sm resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white font-bold text-sm shadow shadow-violet-600/10 cursor-pointer transition-all"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Send Forespørgsel
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
