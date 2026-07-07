import { describe, it, expect } from "vitest";
import { deriveVibeInsights } from "@/lib/vibeInsights";

const jbsVibeEditing = {
  category: "CLI" as const,
  tags: ["video-editing", "ai", "npm", "local-first"],
  installCommand: "npm install -g vibeediting",
  description:
    "AI-assisted video editing you drive with prompts, not code: captions, b-roll, voice-overs, screen recordings and thumbnails from raw footage. Runs locally via npm (then 'vibe init my-videos' to start a project), using your own OpenAI/Gemini/ElevenLabs API keys — free for personal use.",
  systemPrompt:
    "Requires Node.js 20+ and Claude Code or Codex CLI. Runs fully locally (files never leave your machine); you bring your own OpenAI/Gemini/ElevenLabs API keys. Optional: FFmpeg, Python venv. Free for personal use, commercial use needs a separate license.",
  isDanish: true,
  denmarkSpecific: false,
};

describe("deriveVibeInsights", () => {
  it("derives real facts for JBS Vibe Editing (da)", () => {
    const insights = deriveVibeInsights(jbsVibeEditing, "da");
    const text = insights.map((i) => i.text).join(" | ");

    expect(text).toContain("Kommandolinjeværktøj");
    expect(text).toContain("Installeres via npm.");
    expect(text).toContain("OpenAI");
    expect(text).toContain("Gemini");
    expect(text).toContain("ElevenLabs");
    expect(text).toContain("Claude Code");
    expect(text).toContain("Codex");
    expect(text).toContain("Fra en dansk bidragyder.");
    expect(insights.length).toBeLessThanOrEqual(5);
  });

  it("derives the same facts in English", () => {
    const insights = deriveVibeInsights(jbsVibeEditing, "en");
    const text = insights.map((i) => i.text).join(" | ");

    expect(text).toContain("Command-line tool");
    expect(text).toContain("Installs via npm.");
    expect(text).toContain("Explicitly mentions");
    expect(text).toContain("Supports");
    expect(text).toContain("From a Danish contributor.");
  });

  it("never fabricates: a bare MCP server with no metadata only gets the category bullet (+ tag fallback)", () => {
    const insights = deriveVibeInsights(
      {
        category: "MCP Server",
        tags: ["database"],
        installCommand: "",
        description: "Connects to a Postgres instance.",
        systemPrompt: "",
        isDanish: false,
        denmarkSpecific: false,
      },
      "en",
    );

    expect(insights.some((i) => i.id === "models")).toBe(false);
    expect(insights.some((i) => i.id === "editors")).toBe(false);
    expect(insights.some((i) => i.id === "pkg-manager")).toBe(false);
    expect(insights.some((i) => i.id === "denmark")).toBe(false);
    expect(insights[0].id).toBe("category");
    expect(insights.length).toBeGreaterThanOrEqual(1);
  });

  it("omits the source bullet on a malformed sourceUrl instead of throwing", () => {
    expect(() =>
      deriveVibeInsights(
        {
          category: "CLI",
          tags: [],
          installCommand: "",
          description: "",
          systemPrompt: "",
          isDanish: false,
          denmarkSpecific: false,
          sourceUrl: "not a url",
        },
        "en",
      ),
    ).not.toThrow();

    const insights = deriveVibeInsights(
      {
        category: "CLI",
        tags: [],
        installCommand: "",
        description: "",
        systemPrompt: "",
        isDanish: false,
        denmarkSpecific: false,
        sourceUrl: "not a url",
      },
      "en",
    );
    expect(insights.some((i) => i.id === "source")).toBe(false);
  });

  it("flags a github.com sourceUrl as open source", () => {
    const insights = deriveVibeInsights(
      {
        category: "CLI",
        tags: [],
        installCommand: "",
        description: "",
        systemPrompt: "",
        isDanish: false,
        denmarkSpecific: false,
        sourceUrl: "https://github.com/x/y",
      },
      "en",
    );
    expect(insights.some((i) => i.text === "Open source on GitHub.")).toBe(true);
  });
});
