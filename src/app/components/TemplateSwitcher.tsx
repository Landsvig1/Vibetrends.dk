"use client";

import { useState } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { Calendar, Users, Clipboard } from "lucide-react";

interface NoteSection {
  heading: string;
  lines: number[]; // Widths in px for skeleton lines
}

interface Template {
  id: string;
  label: string;
  title: string;
  time: string;
  attendees: string;
  sections: NoteSection[];
}

const TEMPLATE_DATA: Template[] = [
  {
    id: "discovery",
    label: "Customer discovery",
    title: "Upstart Health intro call",
    time: "Today 11:25 PM",
    attendees: "Jim, Michaela +5",
    sections: [
      { heading: "About them", lines: [220, 310, 180] },
      { heading: "Key takeaways", lines: [280, 240] },
      { heading: "Decision-making insights", lines: [340, 290] }
    ]
  },
  {
    id: "one-on-one",
    label: "1 on 1",
    title: "Casey <> Rahul 1 on 1",
    time: "Today 11:25 PM",
    attendees: "Rahul, Casey",
    sections: [
      { heading: "What's the latest", lines: [200, 320] },
      { heading: "Feedback for them", lines: [290, 260] },
      { heading: "Feedback for me", lines: [340, 310] }
    ]
  },
  {
    id: "interview",
    label: "User Interview",
    title: "UX Researcher Candidate - Sarah Jenkins",
    time: "Yesterday 4:15 PM",
    attendees: "Sarah, Kasper, Line",
    sections: [
      { heading: "Background & Portfolio Review", lines: [340, 290, 200] },
      { heading: "Technical Screener Tasks", lines: [310, 340] },
      { heading: "Culture Fit & Next Steps", lines: [180, 220] }
    ]
  },
  {
    id: "pitch",
    label: "Pitch",
    title: "Series A Deck Pitch - VibeFund Partners",
    time: "Friday 10:00 AM",
    attendees: "Christian, Kasper, Anders +3",
    sections: [
      { heading: "Our Value Proposition", lines: [320, 210] },
      { heading: "Market Validation & Traction", lines: [340, 290, 310] },
      { heading: "Q&A and Objections Raised", lines: [260, 310] }
    ]
  },
  {
    id: "standup",
    label: "Standup",
    title: "Daily Product Standup",
    time: "Today 9:30 AM",
    attendees: "Engineering & Design Team",
    sections: [
      { heading: "Completed Yesterday", lines: [280, 210, 310] },
      { heading: "Focus Areas Today", lines: [320, 290] },
      { heading: "Blockers & Risks", lines: [190] }
    ]
  }
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05
    }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { 
    opacity: 1, 
    y: 0, 
    transition: { type: "spring", stiffness: 350, damping: 30 } 
  }
};

export default function TemplateSwitcher() {
  const [activeTab, setActiveTab] = useState<string>("discovery");

  const currentTemplate = TEMPLATE_DATA.find((t) => t.id === activeTab) || TEMPLATE_DATA[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center max-w-5xl mx-auto py-12">
      {/* Left panel: Info & Switcher tabs */}
      <div className="lg:col-span-5 space-y-6">
        <div className="space-y-3">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-tight">
            Få notater i præcis det format, du mangler
          </h2>
          <p className="text-sm sm:text-base text-text-secondary leading-relaxed">
            Skift mellem tilpassede skabeloner og se det strukturerede layout ændre sig med det samme. Optimeret til kundemøder, sprints og 1-on-1s.
          </p>
        </div>

        {/* Horizontal/Vertical scroll Tab buttons with shared layout transition */}
        <div className="flex flex-row lg:flex-col gap-2.5 items-start overflow-x-auto w-full pb-2 scrollbar-none snap-x" role="tablist">
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
                    ? "text-white border-transparent"
                    : "text-text-secondary border-card-border hover:text-foreground hover:border-card-border"
                }`}
              >
                {/* Active sliding indicator */}
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute inset-0 bg-gradient-to-r from-violet-600 to-cyan-600 rounded-full -z-10 shadow-sm"
                    transition={{ type: "spring", stiffness: 380, damping: 35 }}
                  />
                )}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right panel: Mac OS Mock App Window */}
      <div className="lg:col-span-7 w-full">
        <div className="glass-card rounded-2xl overflow-hidden aspect-auto min-h-[350px] lg:aspect-[4/3] flex flex-col w-full border border-card-border shadow-2xl relative shadow-violet-950/10">
          
          {/* Header controls bar */}
          <div className="h-11 bg-background border-b border-card-border flex items-center px-4 justify-between select-none">
            <div className="flex gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500/80" />
              <span className="w-3 h-3 rounded-full bg-accent-light" />
              <span className="w-3 h-3 rounded-full bg-accent-light" />
            </div>
            <div className="text-[11px] font-mono text-text-secondary tracking-wider">notes.vibetrends.dk</div>
            <div className="w-12" /> {/* Spacer */}
          </div>

          {/* Editor view body */}
          <div className="flex-1 p-6 sm:p-8 overflow-y-auto bg-background">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTemplate.id}
                variants={containerVariants}
                initial="hidden"
                animate="show"
                exit="hidden"
                className="space-y-6"
              >
                {/* Note Header block */}
                <motion.div variants={itemVariants} className="space-y-2.5">
                  <h3 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">
                    {currentTemplate.title}
                  </h3>
                  
                  <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-accent-primary" />
                      {currentTemplate.time}
                    </span>
                    <span className="hidden sm:inline text-text-secondary">&middot;</span>
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-accent-primary" />
                      {currentTemplate.attendees}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-accent-light text-accent-primary border border-accent-primary/20 ml-auto">
                      SKABELON
                    </span>
                  </div>
                </motion.div>

                {/* Structured Sections list */}
                <div className="space-y-5 pt-3 border-t border-card-border">
                  {currentTemplate.sections.map((section, idx) => (
                    <motion.div
                      key={section.heading + idx}
                      variants={itemVariants}
                      className="space-y-3"
                    >
                      <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                        <Clipboard className="w-3 h-3 text-accent-primary/80" />
                        {section.heading}
                      </h4>
                      
                      <div className="space-y-2">
                        {section.lines.map((width, lineIdx) => (
                          <div key={lineIdx} className="flex items-center gap-2.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-text-secondary flex-shrink-0" />
                            <div
                              style={{ width: `${width}px` }}
                              className="h-2 rounded-full bg-gradient-to-r from-slate-900 to-slate-900/50 max-w-[85%] relative overflow-hidden"
                            >
                              {/* Pulse skeleton overlay */}
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-800/40 to-transparent animate-[shimmer_1.5s_infinite] -translate-x-full" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>

              </motion.div>
            </AnimatePresence>
          </div>

        </div>
      </div>
    </div>
  );
}
