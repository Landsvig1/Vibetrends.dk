import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SecurityBadge } from "../SecurityBadge";
import { SecurityScan } from "@/lib/db";

describe("SecurityBadge", () => {
  it("renders a discrete safety badge for verified safe skill", () => {
    const mockScan: SecurityScan = {
      id: "scan-1",
      entityType: "skill",
      entitySlug: "test-skill",
      scannerVersion: "skillspector-0.1.0",
      riskScore: 0,
      severity: "LOW",
      verdict: "SAFE",
      findingsCount: { low: 0, medium: 0, high: 0, critical: 0 },
      cveCount: 0,
      scannedAt: new Date().toISOString(),
    };

    const html = renderToStaticMarkup(<SecurityBadge scan={mockScan} />);

    expect(html).toContain("data-testid=\"security-badge-button\"");
    expect(html).toContain("Scannet");
    expect(html).toContain("NVIDIA SkillSpector");
  });

  it("renders amber caution badge when issues are found", () => {
    const mockScan: SecurityScan = {
      id: "scan-2",
      entityType: "skill",
      entitySlug: "caution-skill",
      scannerVersion: "skillspector-0.1.0",
      riskScore: 35,
      severity: "MEDIUM",
      verdict: "CAUTION",
      findingsCount: { low: 1, medium: 1, high: 0, critical: 0 },
      cveCount: 0,
      scannedAt: new Date().toISOString(),
    };

    const html = renderToStaticMarkup(<SecurityBadge scan={mockScan} />);
    expect(html).toContain("amber");
    expect(html).toContain("2 opmærksomhedspunkter");
  });

  it("renders nothing when scan is explicitly null and isScanned is false", () => {
    const html = renderToStaticMarkup(<SecurityBadge scan={null} isScanned={false} />);
    expect(html).toBe("");
  });
});
