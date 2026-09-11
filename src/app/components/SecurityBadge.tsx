"use client";

import { useState } from "react";
import { ShieldCheck, ShieldAlert, Shield } from "lucide-react";
import { SecurityScan } from "@/lib/db";

interface SecurityBadgeProps {
  scan?: SecurityScan | null;
  /** When no scan object is passed, but we know the item is scanned and safe */
  isScanned?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export function SecurityBadge({
  scan,
  isScanned = true,
  className = "",
  size = "sm",
}: SecurityBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  // If scan is explicitly null and isScanned is false, render nothing
  if (!scan && !isScanned) return null;

  const isCaution = scan?.verdict === "CAUTION";
  const issuesCount = scan
    ? (scan.findingsCount.low + scan.findingsCount.medium + scan.findingsCount.high + scan.findingsCount.critical)
    : 0;

  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  const description = isCaution
    ? `Scannet med NVIDIA SkillSpector (${issuesCount} opmærksomhedspunkt${issuesCount === 1 ? "" : "er"}).`
    : "Sikkerhedsscannet med NVIDIA SkillSpector. Nul sårbarheder eller CVE-fejl fundet.";

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setShowTooltip((prev) => !prev);
        }}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-label={description}
        data-testid="security-badge-button"
        className={`relative z-20 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full transition-all duration-150 cursor-pointer ${
          isCaution
            ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20"
            : "bg-accent-primary/5 text-accent-primary/80 border border-accent-primary/15 hover:bg-accent-primary/10 hover:text-accent-primary"
        }`}
      >
        {isCaution ? (
          <ShieldAlert className={`${iconSize} shrink-0 text-amber-600 dark:text-amber-400`} aria-hidden="true" />
        ) : (
          <ShieldCheck className={`${iconSize} shrink-0 text-accent-primary`} aria-hidden="true" />
        )}
        <span className="text-[10px] font-medium tracking-tight">Scannet</span>
      </button>

      {showTooltip && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-30 w-52 p-2 rounded-lg bg-foreground text-background text-[11px] leading-snug shadow-lg pointer-events-none text-center animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="font-semibold flex items-center justify-center gap-1 mb-0.5 text-[10px] text-accent-light uppercase tracking-wider">
            <Shield className="h-3 w-3 inline" /> SkillSpector
          </div>
          <p>{description}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-foreground" />
        </div>
      )}
    </div>
  );
}
