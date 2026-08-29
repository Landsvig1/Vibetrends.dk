import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SecurityAuditBox } from "../SecurityAuditBox";
import { SecurityScan } from "@/lib/db";

describe("SecurityAuditBox", () => {
  it("renders factual telemetry for safe scan", () => {
    const mockScan: SecurityScan = {
      id: "scan-1",
      entityType: "skill",
      entitySlug: "safe-skill",
      scannerVersion: "skillspector-0.1.0",
      riskScore: 0,
      severity: "LOW",
      verdict: "SAFE",
      findingsCount: { low: 0, medium: 0, high: 0, critical: 0 },
      cveCount: 0,
      scannedAt: "2026-08-30T00:00:00.000Z",
    };

    const html = renderToStaticMarkup(<SecurityAuditBox scan={mockScan} />);

    expect(html).toContain("data-testid=\"security-audit-box\"");
    expect(html).toContain("Sikkerhedsscanning");
    expect(html).toContain("Verificeret");
    expect(html).toContain("0 fundet");
    expect(html).toContain("0 registrerede");
  });

  it("renders caution status and lists issues when present", () => {
    const mockScan: SecurityScan = {
      id: "scan-2",
      entityType: "agent",
      entitySlug: "caution-agent",
      scannerVersion: "skillspector-0.1.0",
      riskScore: 40,
      severity: "MEDIUM",
      verdict: "CAUTION",
      findingsCount: { low: 0, medium: 1, high: 0, critical: 0 },
      cveCount: 0,
      rawReport: {
        issues: [
          {
            category: "Privilege Escalation",
            severity: "MEDIUM",
            description: "Sudo-kommando detekteret i setup script",
            file: "install.sh",
            line: 12,
          },
        ],
      },
      scannedAt: "2026-08-30T00:00:00.000Z",
    };

    const html = renderToStaticMarkup(<SecurityAuditBox scan={mockScan} />);

    expect(html).toContain("Bemærkninger");
    expect(html).toContain("1 fundet");
    expect(html).toContain("Sudo-kommando detekteret");
  });
});
