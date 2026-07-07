/**
 * Derive "Vibe Insights" bullets from an agent's real fields, instead of the
 * fixed boilerplate the detail panel used to show for every single entry.
 *
 * Every rule only fires when the underlying data actually supports the
 * claim — model/editor mentions are read straight out of the entry's own
 * text, never assumed from the category. Pure and side-effect free.
 */

export type Lang = "da" | "en";

export interface VibeInsight {
  id: string;
  text: string;
}

interface InsightAgent {
  category: "CLI" | "MCP Server" | "Host";
  tags: string[];
  installCommand: string;
  description: string;
  systemPrompt: string;
  isDanish: boolean;
  denmarkSpecific: boolean;
  sourceUrl?: string;
}

function pick(lang: Lang, da: string, en: string): string {
  return lang === "da" ? da : en;
}

const CATEGORY_INSIGHTS: Record<InsightAgent["category"], { da: string; en: string }> = {
  "MCP Server": {
    da: "MCP Server — forbind via Claude Code, Cursor eller en anden MCP-kompatibel host.",
    en: "MCP Server — connect via Claude Code, Cursor, or another MCP-compatible host.",
  },
  CLI: {
    da: "Kommandolinjeværktøj — kør direkte i din terminal.",
    en: "Command-line tool — runs directly in your terminal.",
  },
  Host: {
    da: "Host-miljø til at køre andre agenter/værktøjer i.",
    en: "Host environment for running other agents/tools.",
  },
};

const PACKAGE_MANAGERS: Array<{ re: RegExp; label: string }> = [
  { re: /^\s*(npm|npx)\b/i, label: "npm" },
  { re: /^\s*pip3?\b/i, label: "pip" },
  { re: /^\s*uvx?\b/i, label: "uv/uvx" },
  { re: /^\s*brew\b/i, label: "Homebrew" },
  { re: /^\s*cargo\b/i, label: "Cargo" },
  { re: /^\s*go\s+install\b/i, label: "go install" },
];

const MODEL_MENTIONS: Array<{ re: RegExp; label: string }> = [
  { re: /\bclaude\b/i, label: "Claude" },
  { re: /\bgpt-?[45]\b/i, label: "GPT-4/5" },
  { re: /\bopenai\b/i, label: "OpenAI" },
  { re: /\bgemini\b/i, label: "Gemini" },
  { re: /\belevenlabs\b/i, label: "ElevenLabs" },
  { re: /\bllama\b/i, label: "Llama" },
  { re: /\bmistral\b/i, label: "Mistral" },
];

const EDITOR_MENTIONS: Array<{ re: RegExp; label: string }> = [
  { re: /\bcursor\b/i, label: "Cursor" },
  { re: /\bwindsurf\b/i, label: "Windsurf" },
  { re: /\bclaude code\b/i, label: "Claude Code" },
  { re: /\bcodex\b/i, label: "Codex" },
  { re: /\bvs\s?code\b|\bvisual studio code\b/i, label: "VS Code" },
  { re: /\bzed\b/i, label: "Zed" },
];

function matchLabels(haystack: string, patterns: Array<{ re: RegExp; label: string }>): string[] {
  const labels: string[] = [];
  for (const { re, label } of patterns) {
    if (re.test(haystack) && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

export function deriveVibeInsights(agent: InsightAgent, lang: Lang): VibeInsight[] {
  const insights: VibeInsight[] = [];
  const haystack = `${agent.description} ${agent.systemPrompt}`;

  const category = CATEGORY_INSIGHTS[agent.category];
  insights.push({ id: "category", text: pick(lang, category.da, category.en) });

  const pkgManager = PACKAGE_MANAGERS.find(({ re }) => re.test(agent.installCommand));
  if (pkgManager) {
    insights.push({
      id: "pkg-manager",
      text: pick(lang, `Installeres via ${pkgManager.label}.`, `Installs via ${pkgManager.label}.`),
    });
  }

  const models = matchLabels(haystack, MODEL_MENTIONS);
  if (models.length > 0) {
    const joined = models.join(", ");
    insights.push({
      id: "models",
      text: pick(lang, `Nævner ${joined} direkte.`, `Explicitly mentions ${joined}.`),
    });
  }

  const editors = matchLabels(haystack, EDITOR_MENTIONS);
  if (editors.length > 0) {
    const joined = editors.join(", ");
    insights.push({
      id: "editors",
      text: pick(lang, `Understøtter ${joined}-workflows.`, `Supports ${joined} workflows.`),
    });
  }

  if (agent.denmarkSpecific) {
    insights.push({
      id: "denmark",
      text: pick(lang, "Bygget specifikt til danske forhold.", "Built specifically for Danish use cases."),
    });
  } else if (agent.isDanish) {
    insights.push({
      id: "denmark",
      text: pick(lang, "Fra en dansk bidragyder.", "From a Danish contributor."),
    });
  }

  if (agent.sourceUrl) {
    try {
      const { hostname } = new URL(agent.sourceUrl);
      insights.push({
        id: "source",
        text:
          hostname === "github.com"
            ? pick(lang, "Open source på GitHub.", "Open source on GitHub.")
            : pick(
                lang,
                `Kildekode/dokumentation tilgængelig på ${hostname}.`,
                `Source/docs available on ${hostname}.`,
              ),
      });
    } catch {
      // Malformed sourceUrl — omit the bullet rather than fabricate one.
    }
  }

  if (insights.length < 2 && agent.tags.length > 0) {
    const usedTags = new Set<string>();
    if (pkgManager) {
      for (const tag of agent.tags) {
        if (tag.toLowerCase() === pkgManager.label.toLowerCase()) usedTags.add(tag);
      }
    }
    const remaining = agent.tags.filter((tag) => !usedTags.has(tag)).slice(0, 2);
    if (remaining.length > 0) {
      const joined = remaining.join(", ");
      insights.push({
        id: "tags",
        text: pick(lang, `Tagget som ${joined}.`, `Tagged as ${joined}.`),
      });
    }
  }

  return insights.slice(0, 5);
}
