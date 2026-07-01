import { describe, it, expect, vi } from "vitest";

// The route module imports the data layer and the Supabase server client at
// load time; mock them so importing projectSchema is hermetic (no DB/env).
vi.mock("@/lib/db", () => ({
  getProjects: vi.fn(),
  createProject: vi.fn(),
}));
vi.mock("@/lib/supabase-server", () => ({
  getAuthUser: vi.fn(),
  resolveBotRequestAuth: vi.fn(),
}));

import { projectSchema } from "@/app/api/vibes/route";

// Guards the POST /api/vibes submission contract, including the new imageUrl
// field (U3): it must be additive so the existing human submit flow (which
// never sends imageUrl) keeps working unchanged, while the add-vibe skill's
// bot-authenticated inserts can now set a custom thumbnail.

const base = {
  title: "My Project",
  description: "A project description long enough to pass validation.",
};

describe("projectSchema — required fields", () => {
  it("accepts title + description only (everything else omitted)", () => {
    expect(projectSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a missing title", () => {
    const { title, ...noTitle } = base;
    void title;
    expect(projectSchema.safeParse(noTitle).success).toBe(false);
  });

  it("rejects a description under 10 characters", () => {
    expect(projectSchema.safeParse({ ...base, description: "short" }).success).toBe(false);
  });
});

describe("projectSchema — imageUrl", () => {
  it("accepts a valid imageUrl on an allowed host (matches next.config.ts's remotePatterns)", () => {
    expect(
      projectSchema.safeParse({ ...base, imageUrl: "https://images.unsplash.com/photo-123.png" }).success
    ).toBe(true);
  });

  it("accepts submissions that omit imageUrl entirely (regression: existing human submit flow)", () => {
    expect(projectSchema.safeParse(base).success).toBe(true);
  });

  it("accepts an empty-string imageUrl the same way demoUrl handles empty string", () => {
    expect(projectSchema.safeParse({ ...base, imageUrl: "" }).success).toBe(true);
  });

  it("rejects a non-URL imageUrl", () => {
    expect(projectSchema.safeParse({ ...base, imageUrl: "not-a-url" }).success).toBe(false);
  });

  it("rejects a well-formed URL on a host that isn't in next.config.ts's image allowlist", () => {
    // Guards against the bug found in review: a URL that passes .url() but
    // isn't on the remotePatterns/CSP allowlist would otherwise pass schema
    // validation and then throw at render time for every visitor viewing the
    // card (next/image rejects unconfigured hostnames).
    expect(
      projectSchema.safeParse({ ...base, imageUrl: "https://evil.example.com/thumb.png" }).success
    ).toBe(false);
  });
});
