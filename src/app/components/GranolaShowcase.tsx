"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Users, Clipboard, ArrowDown, Play, RotateCcw, Check, Sparkles } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

// Types
interface NoteSection {
  heading: string;
  lines: string[];
}

interface Template {
  id: string;
  label: string;
  title: string;
  time: string;
  attendees: string;
  sections: NoteSection[];
}

// Data for Template Switcher
const TEMPLATE_DATA: Template[] = [
  {
    id: "discovery",
    label: "Customer discovery",
    title: "Upstart Health intro call",
    time: "Today 11:25 PM",
    attendees: "Jim, Michaela +5",
    sections: [
      { heading: "About them", lines: ["Digital healthcare startup raising Seed", "Expanding team from 8 to 22", "Pain point: manual charting takes doctors 2+ hrs/day"] },
      { heading: "Key takeaways", lines: ["Strong product-market fit in private clinics", "Ready to scale to public healthcare systems"] },
      { heading: "Decision-making insights", lines: ["Founder makes ultimate product choices", "Clinical director must approve security specs"] }
    ]
  },
  {
    id: "one-on-one",
    label: "1 on 1",
    title: "Casey <> Rahul 1 on 1",
    time: "Today 11:25 PM",
    attendees: "Rahul, Casey",
    sections: [
      { heading: "What's the latest", lines: ["Finished the billing integration refactor", "Struggling with Flaky Playwright tests in CI"] },
      { heading: "Feedback for them", lines: ["Great work landing the Turbopack migration early", "Encourage sharing research findings in weekly sync"] },
      { heading: "Next Milestone", lines: ["Refactor test suite by Friday", "Take two days off next week"] }
    ]
  },
  {
    id: "interview",
    label: "User Interview",
    title: "UX Researcher - Sarah Jenkins",
    time: "Yesterday 4:15 PM",
    attendees: "Sarah, Kasper, Line",
    sections: [
      { heading: "Background & Portfolio Review", lines: ["5 years at Figma leading editor research", "Strong bias for quantitative validation"] },
      { heading: "Technical Screener Tasks", lines: ["Passed: Designed research plan for mobile onboarding", "Clear communication and structured research framework"] },
      { heading: "Culture Fit", lines: ["Highly collaborative, eager to join early startup environment"] }
    ]
  },
  {
    id: "pitch",
    label: "Pitch",
    title: "Series A Deck Pitch - VibeFund Partners",
    time: "Friday 10:00 AM",
    attendees: "Christian, Kasper, Anders +3",
    sections: [
      { heading: "Our Value Proposition", lines: ["Making vibe coding collaborative for fast-paced teams", "Solving synchronization and code quality in multi-agent environments"] },
      { heading: "Market Validation & Traction", lines: ["60k+ active community builders", "35% MoM platform engagement growth"] }
    ]
  },
  {
    id: "standup",
    label: "Standup",
    title: "Daily Product Standup",
    time: "Today 9:30 AM",
    attendees: "Engineering & Design Team",
    sections: [
      { heading: "Completed Yesterday", lines: ["Deployed security scanning to MCP registry", "Merged Next.js 16 layouts fix"] },
      { heading: "Focus Areas Today", lines: ["Optimize LCP image loading in Showcase", "Implement Resend verification templates"] }
    ]
  }
];

// Helper styles for font namespaces
const serifStyle = { fontFamily: "'Instrument Serif', Georgia, serif" };
const sansStyle = { fontFamily: "'Plus Jakarta Sans', sans-serif" };

export default function GranolaShowcase() {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState<string>("discovery");
  
  // Simulation states for the Live Call Simulator
  const [simState, setSimState] = useState<"idle" | "calling" | "transcribing" | "completed">("idle");
  const [simText, setSimText] = useState<string>("");
  const [simNotes, setSimNotes] = useState<string[]>([]);
  
  const currentTemplate = TEMPLATE_DATA.find((t) => t.id === activeTab) || TEMPLATE_DATA[0];

  // Simulation effect
  useEffect(() => {
    if (simState !== "transcribing") return;

    const transcriptSentences = language === "da" ? [
      "Kasper: Så vi vil bygge et community for danske AI-byggere...",
      "Line: Ja, et sted med showcases, skills og et agent-kartotek.",
      "Kasper: Helt sikkert. Vi skal bruge lynhurtig Next.js og fed dark-mode styling.",
      "Line: Perfekt, lad os vibe-code det i aften!"
    ] : [
      "Kasper: So we want to build a community for Danish AI builders...",
      "Line: Yes, a place with showcases, skills, and an agent registry.",
      "Kasper: Absolutely. We need blazing fast Next.js and cool dark-mode styling.",
      "Line: Perfect, let's vibe-code it tonight!"
    ];

    const targetNotes = language === "da" ? [
      "Ide: Dansk AI-bygger & Vibe Coder community-hub",
      "Features: Projekter, skills, forum, blogs, agent-kartotek",
      "Tech stack: Next.js + Tailwind CSS 4 + Framer Motion"
    ] : [
      "Idea: Danish AI builder & Vibe Coder community hub",
      "Features: Projects, skills, forum, blogs, agent registry",
      "Tech stack: Next.js + Tailwind CSS 4 + Framer Motion"
    ];

    let sentenceIdx = 0;
    let charIdx = 0;
    let currentText = "";
    
    const textInterval = setInterval(() => {
      if (sentenceIdx >= transcriptSentences.length) {
        clearInterval(textInterval);
        
        // Stagger note generation
        let noteIdx = 0;
        const noteInterval = setInterval(() => {
          if (noteIdx >= targetNotes.length) {
            clearInterval(noteInterval);
            setSimState("completed");
          } else {
            setSimNotes(prev => [...prev, targetNotes[noteIdx]]);
            noteIdx++;
          }
        }, 800);
        
        return;
      }

      const currentSentence = transcriptSentences[sentenceIdx];
      if (charIdx < currentSentence.length) {
        currentText += currentSentence[charIdx];
        setSimText(currentText);
        charIdx++;
      } else {
        currentText += "\n";
        sentenceIdx++;
        charIdx = 0;
      }
    }, 40);

    return () => clearInterval(textInterval);
  }, [simState, language]);

  const startSimulation = () => {
    setSimText("");
    setSimNotes([]);
    setSimState("calling");
    
    setTimeout(() => {
      setSimState("transcribing");
    }, 1500);
  };

  const resetSimulation = () => {
    setSimText("");
    setSimNotes([]);
    setSimState("idle");
  };

  return (
    <div 
      style={sansStyle} 
      className="bg-[#FAF9F6] text-[#1E1E1E] rounded-3xl border border-[#E6E3DC] p-6 sm:p-12 lg:p-16 space-y-28 shadow-2xl relative overflow-hidden text-left"
    >
      {/* Visual noise / overlay subtle grain if desired, using soft linear gradient grids */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle, #1E1E1E 1px, transparent 1px)`,
          backgroundSize: "24px 24px"
        }}
      />

      {/* --- HERO SECTION --- */}
      <section className="relative grid grid-cols-1 lg:grid-cols-12 gap-12 items-center z-10">
        <div className="lg:col-span-6 space-y-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#2C4A26]/15 bg-[#F0F4EF] text-xs font-semibold text-[#2C4A26]">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{language === "da" ? "Genopbygget med 100% Granola-vibe" : "Rebuilt with 100% Granola vibe"}</span>
          </div>

          <h1 
            style={serifStyle} 
            className="text-5xl sm:text-6xl xl:text-7xl font-light leading-[1.02] tracking-tight text-[#1E1E1E]"
          >
            {language === "da" ? (
              <>AI-notesbogen til folk i <span className="italic">tætpakkede</span> møder</>
            ) : (
              <>The AI notepad for people in <span className="italic">back-to-back</span> meetings</>
            )}
          </h1>

          <p className="text-base sm:text-lg text-[#5A5A57] max-w-md leading-relaxed">
            {language === "da"
              ? "Notater, handlinger og hukommelse. Håndteret for dig, helt stille. Du forbliver til stede i mødet, mens AI ordner referatet."
              : "Notes, actions and memory. Handled for you, quietly. You stay present in the meeting while AI takes care of the notes."
            }
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <button 
              onClick={startSimulation}
              className="bg-[#2C4A26] hover:bg-[#1F361A] text-white rounded-full px-6 py-3.5 font-semibold text-sm transition-all shadow-md shadow-[#2C4A26]/10 flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <span>{language === "da" ? "Hent helt gratis" : "Download for free"}</span>
              <ArrowDown className="w-4 h-4" />
            </button>
            <p className="text-xs text-[#5A5A57]">
              {language === "da" ? "Til macOS, Windows, iPhone" : "For macOS, Windows, iPhone"}
            </p>
          </div>
        </div>

        {/* Hero Interactive Simulator Collage */}
        <div className="lg:col-span-6 w-full flex items-center justify-center">
          <div className="relative w-full max-w-md aspect-auto min-h-[380px] sm:aspect-[4/3] rounded-2xl border border-[#E6E3DC] bg-white shadow-xl overflow-hidden p-6 flex flex-col justify-between">
            
            {/* Window bar */}
            <div className="flex justify-between items-center pb-4 border-b border-[#FAF9F6]">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F]/80" />
              </div>
              <span className="text-[10px] font-mono text-[#5A5A57] opacity-60">live_meeting_sim.log</span>
              <div className="w-8" />
            </div>

            {/* Simulated Content Area */}
            <div className="flex-1 py-4 flex flex-col justify-between overflow-y-auto">
              
              {/* Simulator Screen 1: Idle state */}
              {simState === "idle" && (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-12 h-12 rounded-full bg-[#F0F4EF] flex items-center justify-center text-[#2C4A26]">
                    <Play className="w-5 h-5 fill-[#2C4A26]" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-sm text-[#1E1E1E]">
                      {language === "da" ? "Test Møde Simulator" : "Test Meeting Simulator"}
                    </p>
                    <p className="text-xs text-[#5A5A57]">
                      {language === "da" ? "Klik for at starte et simuleret online opkald" : "Click to start a simulated online call"}
                    </p>
                  </div>
                  <button 
                    onClick={startSimulation}
                    className="text-xs font-semibold px-4 py-2 border border-[#E6E3DC] rounded-full hover:bg-[#FAF9F6] transition-colors cursor-pointer"
                  >
                    {language === "da" ? "Start simulation" : "Start simulation"}
                  </button>
                </div>
              )}

              {/* Simulator Screen 2: Ringing state */}
              {simState === "calling" && (
                <div className="flex-1 flex flex-col items-center justify-center space-y-3">
                  <div className="flex gap-2.5">
                    <div className="w-10 h-10 rounded-full bg-card-border animate-pulse border border-[#E6E3DC] flex items-center justify-center text-xs font-bold">K</div>
                    <div className="w-10 h-10 rounded-full bg-card-border animate-pulse border border-[#E6E3DC] flex items-center justify-center text-xs font-bold">L</div>
                  </div>
                  <p className="text-xs font-mono text-[#5A5A57] animate-pulse">
                    {language === "da" ? "Forbinder lyd og transskribering..." : "Connecting audio and transcription..."}
                  </p>
                </div>
              )}

              {/* Simulator Screen 3: Live Transcribing & Notes */}
              {(simState === "transcribing" || simState === "completed") && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                  {/* Left: Raw Audio Transcription */}
                  <div className="border border-[#E6E3DC] rounded-xl p-3 bg-[#FAF9F6] flex flex-col h-full max-h-[180px]">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#5A5A57] mb-2 font-mono">
                      {language === "da" ? "Opkaldslyd (Rå tekst)" : "Call Audio (Raw text)"}
                    </p>
                    <pre className="text-[11px] font-mono whitespace-pre-wrap overflow-y-auto flex-1 text-[#1E1E1E] leading-relaxed">
                      {simText}
                    </pre>
                  </div>
                  
                  {/* Right: Organized Structured Notes */}
                  <div className="border border-[#2C4A26]/20 rounded-xl p-3 bg-white flex flex-col h-full max-h-[180px] shadow-sm">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#2C4A26] mb-2 flex items-center gap-1 font-mono">
                      <Sparkles className="w-3 h-3 text-[#2C4A26]" />
                      {language === "da" ? "Organiseret AI reference" : "Organized AI reference"}
                    </p>
                    <div className="flex-1 overflow-y-auto space-y-3">
                      {simNotes.map((note, idx) => (
                        <motion.div 
                          key={idx}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="flex items-start gap-1.5"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#2C4A26] mt-1 shrink-0" />
                          <p className="text-[11px] font-semibold text-[#1E1E1E] leading-snug">{note}</p>
                        </motion.div>
                      ))}
                      {simState === "transcribing" && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-card-border animate-ping" />
                          <div className="h-2 bg-card-border rounded-full w-2/3 animate-pulse" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Footer control bar */}
            {(simState === "transcribing" || simState === "completed") && (
              <div className="pt-2 border-t border-[#FAF9F6] flex justify-between items-center">
                <span className="text-[10px] text-[#5A5A57] font-semibold">
                  {simState === "transcribing" 
                    ? (language === "da" ? "🔴 Live transskribering..." : "🔴 Live transcribing...") 
                    : (language === "da" ? "✅ Analyse fuldført!" : "✅ Analysis completed!")
                  }
                </span>
                <button 
                  onClick={resetSimulation}
                  className="text-xs font-semibold text-[#2C4A26] hover:text-[#1F361A] flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  {language === "da" ? "Nulstil" : "Reset"}
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* --- TEMPLATE SWITCHER SECTION --- */}
      <section className="space-y-10 pt-16 border-t border-[#E6E3DC] relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Tabs Navigation */}
          <div className="lg:col-span-5 space-y-6">
            <div className="space-y-3">
              <h2 
                style={serifStyle} 
                className="text-4xl sm:text-5xl font-light leading-none text-[#1E1E1E]"
              >
                {language === "da" ? "Få notater i det format, dit team har brug for" : "Get notes in the format your team needs"}
              </h2>
              <p className="text-sm sm:text-base text-[#5A5A57] leading-relaxed">
                {language === "da" 
                  ? "Skift mellem skabeloner for at se strukturen ændre sig. Vores skabeloner trækker de vigtigste takeaways ud baseret på mødets kontekst."
                  : "Switch between templates to see the structure change. Our templates extract the key takeaways based on the meeting's context."
                }
              </p>
            </div>

            <div className="flex flex-row md:flex-col gap-2 items-start overflow-x-auto w-full pb-2 scrollbar-none snap-x" role="tablist">
              {TEMPLATE_DATA.map((tab) => {
                const isActive = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative px-5 py-3 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 outline-none select-none cursor-pointer flex items-center gap-2 border snap-center shrink-0 ${
                      isActive
                        ? "text-[#FAF9F6] border-transparent"
                        : "text-[#5A5A57] border-[#E6E3DC] hover:text-[#1E1E1E] hover:border-[#C0BFB8]"
                    }`}
                  >
                    {/* Active sliding indicator */}
                    {isActive && (
                      <motion.div
                        layoutId="activeIndicator"
                        className="absolute inset-0 bg-[#2C4A26] rounded-full -z-10 shadow-md shadow-[#2C4A26]/10"
                        transition={{ type: "spring", stiffness: 380, damping: 35 }}
                      />
                    )}
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card Mockup Editor */}
          <div className="lg:col-span-7 w-full">
            <div className="bg-white rounded-2xl overflow-hidden aspect-auto min-h-[380px] sm:aspect-[4/3] flex flex-col w-full border border-[#E6E3DC] shadow-xl relative">
              
              {/* Header controls bar */}
              <div className="h-11 bg-[#FAF9F6] border-b border-[#E6E3DC] flex items-center px-4 justify-between select-none">
                <div className="flex gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F56]/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FFBD2E]/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-[#27C93F]/80" />
                </div>
                <div className="text-[10px] font-mono text-[#5A5A57] opacity-60">notes.granola.ai</div>
                <div className="w-12" /> {/* Spacer */}
              </div>

              {/* Editor view body */}
              <div className="flex-1 p-6 sm:p-8 overflow-y-auto bg-white">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentTemplate.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-6"
                  >
                    {/* Note Header block */}
                    <div className="space-y-2.5">
                      <h3 className="text-xl sm:text-2xl font-bold text-[#1E1E1E] leading-tight">
                        {currentTemplate.title}
                      </h3>
                      
                      <div className="flex flex-wrap items-center gap-3 text-xs text-[#5A5A57]">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[#2C4A26]" />
                          {currentTemplate.time}
                        </span>
                        <span className="text-text-secondary">&middot;</span>
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-[#2C4A26]" />
                          {currentTemplate.attendees}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#F0F4EF] text-[#2C4A26] border border-[#2C4A26]/10 ml-auto">
                          TEMPLATE
                        </span>
                      </div>
                    </div>

                    {/* Structured Sections list */}
                    <div className="space-y-5 pt-3 border-t border-[#FAF9F6]">
                      {currentTemplate.sections.map((section, idx) => (
                        <div key={idx} className="space-y-2">
                          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-[#5A5A57] flex items-center gap-1.5">
                            <Clipboard className="w-3 h-3 text-[#2C4A26]/80" />
                            {section.heading}
                          </h4>
                          
                          <ul className="space-y-2 pl-1">
                            {section.lines.map((line, lineIdx) => (
                              <li key={lineIdx} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#1E1E1E] leading-relaxed">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#2C4A26] mt-2 shrink-0" />
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>

                  </motion.div>
                </AnimatePresence>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* --- PRICING SECTION --- */}
      <section className="space-y-10 pt-16 border-t border-[#E6E3DC] relative z-10">
        <div className="text-center space-y-4">
          <h2 
            style={serifStyle} 
            className="text-4xl sm:text-5xl font-light text-[#1E1E1E]"
          >
            {language === "da" ? "Prisplaner" : "Pricing plans"}
          </h2>
          <p className="text-sm text-[#5A5A57] max-w-sm mx-auto">
            {language === "da" 
              ? "Helt gennemskuelige priser. Vælg planen der matcher dit team og dine behov."
              : "Completely transparent pricing. Choose the plan that matches your team and needs."
            }
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Basic */}
          <div className="bg-white border border-[#E6E3DC] rounded-2xl p-6 flex flex-col justify-between space-y-8 shadow-sm hover:shadow-md transition-shadow">
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-lg text-[#1E1E1E]">Basic</h3>
                <p className="text-xs text-[#5A5A57]">
                  {language === "da" ? "Perfekt til en gratis smagsprøve på Granola" : "Great for a free taste of Granola"}
                </p>
              </div>
              <p style={serifStyle} className="text-4xl font-light text-[#1E1E1E]">$0 <span className="text-sm font-sans text-[#5A5A57]">
                {language === "da" ? "per bruger / måned" : "per user / month"}
              </span></p>
              <button className="w-full bg-[#FAF9F6] border border-[#E6E3DC] text-[#1E1E1E] hover:bg-[#F3F1ED] font-semibold text-xs py-3 rounded-full cursor-pointer transition-colors">
                {language === "da" ? "Hent til Mac" : "Download for Mac"}
              </button>
            </div>
            
            <ul className="space-y-3 pt-6 border-t border-[#FAF9F6]">
              <li className="flex gap-2 text-xs text-[#1E1E1E]"><Check className="w-3.5 h-3.5 text-[#2C4A26] shrink-0" /> {language === "da" ? "AI mødenotater" : "AI meeting notes"}</li>
              <li className="flex gap-2 text-xs text-[#1E1E1E]"><Check className="w-3.5 h-3.5 text-[#2C4A26] shrink-0" /> {language === "da" ? "Se begrænset mødehistorik" : "See limited meeting history"}</li>
              <li className="flex gap-2 text-xs text-[#1E1E1E]"><Check className="w-3.5 h-3.5 text-[#2C4A26] shrink-0" /> {language === "da" ? "Delte mapper" : "Shared folders"}</li>
            </ul>
          </div>

          {/* Card 2: Business (Featured) */}
          <div className="bg-white border-2 border-[#2C4A26] rounded-2xl p-6 flex flex-col justify-between space-y-8 shadow-md relative">
            <div className="absolute top-0 right-6 transform -translate-y-1/2 bg-[#2C4A26] text-white text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full">
              {language === "da" ? "Populær" : "Popular"}
            </div>
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-lg text-[#1E1E1E]">Business</h3>
                <p className="text-xs text-[#5A5A57]">
                  {language === "da" ? "Perfekt til enkeltpersoner eller små teams" : "Great for individuals or small teams"}
                </p>
              </div>
              <p style={serifStyle} className="text-4xl font-light text-[#1E1E1E]">$14 <span className="text-sm font-sans text-[#5A5A57]">
                {language === "da" ? "per bruger / måned" : "per user / month"}
              </span></p>
              <button className="w-full bg-[#2C4A26] hover:bg-[#1F361A] text-white font-semibold text-xs py-3 rounded-full cursor-pointer transition-colors shadow-sm shadow-[#2C4A26]/10">
                {language === "da" ? "Hent til Mac" : "Download for Mac"}
              </button>
            </div>
            
            <ul className="space-y-3 pt-6 border-t border-[#FAF9F6]">
              <li className="flex gap-2 text-xs text-[#1E1E1E]"><Check className="w-3.5 h-3.5 text-[#2C4A26] shrink-0" /> {language === "da" ? "Alt i Basic, plus" : "Everything in Basic, plus"}</li>
              <li className="flex gap-2 text-xs text-[#1E1E1E]"><Check className="w-3.5 h-3.5 text-[#2C4A26] shrink-0" /> {language === "da" ? "Ubegrænsede mødenotater" : "Unlimited meeting notes"}</li>
              <li className="flex gap-2 text-xs text-[#1E1E1E]"><Check className="w-3.5 h-3.5 text-[#2C4A26] shrink-0" /> {language === "da" ? "Avanceret AI-modelintegration" : "Advanced AI models integration"}</li>
              <li className="flex gap-2 text-xs text-[#1E1E1E]"><Check className="w-3.5 h-3.5 text-[#2C4A26] shrink-0" /> {language === "da" ? "Notion, Attio, Slack integrationer" : "Notion, Attio, Slack integrations"}</li>
            </ul>
          </div>

          {/* Card 3: Enterprise */}
          <div className="bg-white border border-[#E6E3DC] rounded-2xl p-6 flex flex-col justify-between space-y-8 shadow-sm hover:shadow-md transition-shadow">
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-lg text-[#1E1E1E]">Enterprise</h3>
                <p className="text-xs text-[#5A5A57]">
                  {language === "da" ? "Perfekt til større organisationer" : "Great for larger organizations"}
                </p>
              </div>
              <p style={serifStyle} className="text-4xl font-light text-[#1E1E1E]">$35 <span className="text-sm font-sans text-[#5A5A57]">
                {language === "da" ? "per bruger / måned" : "per user / month"}
              </span></p>
              <button className="w-full bg-[#FAF9F6] border border-[#E6E3DC] text-[#1E1E1E] hover:bg-[#F3F1ED] font-semibold text-xs py-3 rounded-full cursor-pointer transition-colors">
                {language === "da" ? "Tilmeld i appen" : "Sign-up in app"}
              </button>
            </div>
            
            <ul className="space-y-3 pt-6 border-t border-[#FAF9F6]">
              <li className="flex gap-2 text-xs text-[#1E1E1E]"><Check className="w-3.5 h-3.5 text-[#2C4A26] shrink-0" /> {language === "da" ? "Alt inkluderet i Business" : "Everything included in Business"}</li>
              <li className="flex gap-2 text-xs text-[#1E1E1E]"><Check className="w-3.5 h-3.5 text-[#2C4A26] shrink-0" /> {language === "da" ? "Single sign-on (SSO)" : "Single sign-on (SSO)"}</li>
              <li className="flex gap-2 text-xs text-[#1E1E1E]"><Check className="w-3.5 h-3.5 text-[#2C4A26] shrink-0" /> {language === "da" ? "Prioriteret support & administrator-kontrol" : "Priority support & admin controls"}</li>
            </ul>
          </div>
        </div>
      </section>

    </div>
  );
}
