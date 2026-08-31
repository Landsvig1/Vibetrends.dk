import { describe, it, expect, vi, beforeEach } from "vitest";

interface MockQueryResult {
  data: unknown;
  error: unknown;
}

const state = vi.hoisted(() => ({
  handler: (() => ({ data: null, error: null })) as (table: string, filter: Record<string, unknown>) => MockQueryResult,
}));

vi.mock("next/cache", () => ({
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("../supabase-server", () => {
  return {
    supabasePublic: {
      from: (table: string) => {
        const filters: Record<string, unknown> = {};
        const builder = {
          select: () => builder,
          eq: (col: string, val: unknown) => {
            filters[col] = val;
            return builder;
          },
          in: (col: string, vals: unknown[]) => {
            filters[col] = vals;
            return builder;
          },
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () => state.handler(table, filters),
          then: (resolve: (val: unknown) => void) => resolve(state.handler(table, filters)),
        };
        return builder;
      },
    },
    createSupabaseServerClient: vi.fn(),
  };
});

import { getLatestSecurityScan, getSecurityScansBySlugs } from "../db";

describe("db — security_scans helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getLatestSecurityScan maps row and returns structured SecurityScan", async () => {
    state.handler = () => ({
      data: {
        id: "scan-123",
        entity_type: "skill",
        entity_slug: "test-slug",
        scanner_version: "skillspector-0.1.0",
        risk_score: 10,
        severity: "LOW",
        verdict: "SAFE",
        findings_count: { low: 1, medium: 0, high: 0, critical: 0 },
        cve_count: 0,
        raw_report: { issues: [] },
        scanned_at: "2026-08-30T00:00:00.000Z",
      },
      error: null,
    });

    const result = await getLatestSecurityScan("skill", "test-slug");
    expect(result).not.toBeNull();
    expect(result?.entitySlug).toBe("test-slug");
    expect(result?.verdict).toBe("SAFE");
    expect(result?.riskScore).toBe(10);
    expect(result?.findingsCount.low).toBe(1);
  });

  it("getLatestSecurityScan fails open (returns null) on error", async () => {
    state.handler = () => ({
      data: null,
      error: { message: "relation public.security_scans does not exist" },
    });

    const result = await getLatestSecurityScan("skill", "missing-slug");
    expect(result).toBeNull();
  });

  it("getSecurityScansBySlugs batches queries and indexes by slug", async () => {
    state.handler = () => ({
      data: [
        {
          id: "s1",
          entity_type: "skill",
          entity_slug: "slug-a",
          scanner_version: "skillspector-0.1.0",
          risk_score: 0,
          severity: "LOW",
          verdict: "SAFE",
          findings_count: { low: 0, medium: 0, high: 0, critical: 0 },
          cve_count: 0,
          raw_report: null,
          scanned_at: "2026-08-30T00:00:00.000Z",
        },
        {
          id: "s2",
          entity_type: "skill",
          entity_slug: "slug-b",
          scanner_version: "skillspector-0.1.0",
          risk_score: 35,
          severity: "MEDIUM",
          verdict: "CAUTION",
          findings_count: { low: 0, medium: 1, high: 0, critical: 0 },
          cve_count: 0,
          raw_report: null,
          scanned_at: "2026-08-30T00:00:00.000Z",
        },
      ],
      error: null,
    });

    const map = await getSecurityScansBySlugs("skill", ["slug-a", "slug-b"]);
    expect(map.size).toBe(2);
    expect(map.get("slug-a")?.verdict).toBe("SAFE");
    expect(map.get("slug-b")?.verdict).toBe("CAUTION");
  });
});
