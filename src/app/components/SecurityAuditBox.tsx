"use client";

import { ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2 } from "lucide-react";
import { SecurityScan } from "@/lib/db";

interface SecurityAuditBoxProps {
  scan?: SecurityScan | null;
  className?: string;
}

export function SecurityAuditBox({ scan, className = "" }: SecurityAuditBoxProps) {
  // If no scan record exists yet, provide a factual baseline box
  const hasScan = Boolean(scan);
  const isCaution = scan?.verdict === "CAUTION";
  const scannerVersion = scan?.scannerVersion || "SkillSpector SAST";
  const formattedDate = scan?.scannedAt
    ? new Date(scan.scannedAt).toLocaleDateString("da-DK", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Automatisk verificeret";

  const totalFindings = scan
    ? (scan.findingsCount.low + scan.findingsCount.medium + scan.findingsCount.high + scan.findingsCount.critical)
    : 0;

  const cveCount = scan?.cveCount ?? 0;
  const issues = scan?.rawReport?.issues ?? [];

  return (
    <section
      data-testid="security-audit-box"
      className={`rounded-xl border p-5 bg-card/40 backdrop-blur-sm ${
        isCaution ? "border-amber-500/30" : "border-card-border"
      } ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-card-border pb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-1.5 rounded-lg ${
              isCaution ? "bg-amber-500/10 text-amber-600" : "bg-accent-primary/10 text-accent-primary"
            }`}
          >
            {isCaution ? (
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Sikkerhedsscanning</h3>
            <p className="text-[11px] text-text-secondary">
              {scannerVersion} • {formattedDate}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 text-xs font-semibold rounded-md font-mono ${
              isCaution
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                : "bg-accent-primary/10 text-accent-primary border border-accent-primary/20"
            }`}
          >
            {isCaution ? "Bemærkninger" : "Verificeret"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-4">
        <div className="p-3 rounded-lg bg-background border border-card-border">
          <span className="text-[10px] uppercase font-mono tracking-wider text-text-secondary block">
            Sårbarheder
          </span>
          <span className="text-base font-bold font-mono text-foreground mt-0.5 flex items-center gap-1.5">
            {totalFindings === 0 ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-accent-primary" /> 0 fundet
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> {totalFindings} fundet
              </>
            )}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-background border border-card-border">
          <span className="text-[10px] uppercase font-mono tracking-wider text-text-secondary block">
            Kendte CVEs
          </span>
          <span className="text-base font-bold font-mono text-foreground mt-0.5 flex items-center gap-1.5">
            {cveCount === 0 ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-accent-primary" /> 0 registrerede
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> {cveCount} fundet
              </>
            )}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-background border border-card-border col-span-2 sm:col-span-1">
          <span className="text-[10px] uppercase font-mono tracking-wider text-text-secondary block">
            Scanner Status
          </span>
          <span className="text-base font-bold font-mono text-foreground mt-0.5 block truncate">
            {hasScan ? (isCaution ? "CAUTION" : "SAFE") : "GROUNDED"}
          </span>
        </div>
      </div>

      {issues.length > 0 && (
        <div className="mt-2 pt-3 border-t border-card-border space-y-2">
          <span className="text-xs font-semibold text-foreground block">
            Registrerede observationer ({issues.length}):
          </span>
          <ul className="space-y-1.5 text-xs text-text-secondary">
            {issues.map((issue, idx) => (
              <li key={idx} className="p-2 rounded bg-background border border-card-border flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-foreground">{issue.category || "Observation"}: </span>
                  <span>{issue.description}</span>
                  {issue.file && (
                    <span className="block text-[10px] font-mono text-text-secondary mt-0.5">
                      Kilde: {issue.file}{issue.line ? `:${issue.line}` : ""}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-text-secondary mt-3 leading-relaxed">
        Statisk inspektion af kildekode og afhængigheder i isoleret Docker-sandbox. Tjekker for prompt injection, utilsigtede rettighedseskaleringer og registrerede CVE-sårbarheder via OSV.dev.
      </p>
    </section>
  );
}
