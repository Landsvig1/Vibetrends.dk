/**
 * Single source of truth for the agent-feed taxonomy.
 *
 * vibetrends organizes its catalog by "can I attach this to my agent?" (a
 * FEED type) versus "is this the agent itself?" (a HOST). Feed types are the
 * capabilities a user plugs into a coding tool — skills, MCP servers and
 * tool-CLIs. Hosts are the coding agents those capabilities land in — Claude
 * Code, Cursor, Gemini CLI — and are connection targets, never catalog items.
 *
 * Every place that needs the feed-type list or the host list — the primary
 * nav, the tool-CLI surface, the connect host picker, the sitemap and the
 * agent-discovery contract — derives from THIS file. There are no other
 * feed-type or host lists in the codebase.
 *
 * `icon` is a lucide-react icon *name* (resolved to a component in the UI) so
 * this module stays pure data and cheap to import from server routes and the
 * sitemap without pulling icon components into their bundles.
 */

export const FEED_TYPE_SLUGS = [
  "skills",
  "mcp-servers",
  "tool-clis",
] as const;

export type FeedTypeSlug = (typeof FEED_TYPE_SLUGS)[number];

export interface FeedType {
  slug: FeedTypeSlug;
  labelDa: string;
  labelEn: string;
  descDa: string;
  descEn: string;
  /** Route this feed type lives under, e.g. "/skills". */
  href: string;
  /** lucide-react icon name, resolved to a component in the UI layer. */
  icon: string;
  /** Accent colour (hex) for the feed type's nav and hub treatment. */
  accent: string;
}

export const FEED_TYPES: readonly FeedType[] = [
  {
    slug: "skills",
    labelDa: "Skills",
    labelEn: "Skills",
    descDa: "Kuraterede skills, ét trin fra din agent.",
    descEn: "Curated skills, one step from your agent.",
    href: "/skills",
    icon: "Sparkles",
    accent: "#a78bfa",
  },
  {
    slug: "mcp-servers",
    labelDa: "MCP-servere",
    labelEn: "MCP servers",
    descDa: "MCP-kapabiliteter, ét trin fra din opsætning.",
    descEn: "MCP capabilities, one step from your setup.",
    href: "/mcp",
    icon: "Cpu",
    accent: "#38bdf8",
  },
  {
    slug: "tool-clis",
    labelDa: "Tool-CLI'er",
    labelEn: "Tool CLIs",
    descDa: "CLI-værktøjer din agent kan kalde.",
    descEn: "CLI tools your agent can invoke.",
    href: "/tool-clis",
    icon: "TerminalSquare",
    accent: "#34d399",
  },
] as const;

export const HOST_SLUGS = [
  "claude-code",
  "cursor",
  "gemini-cli",
] as const;

export type HostSlug = (typeof HOST_SLUGS)[number];

export interface Host {
  slug: HostSlug;
  /** Display name, language-agnostic (product names are not translated). */
  name: string;
  /** lucide-react icon name, resolved to a component in the UI layer. */
  icon: string;
}

export const HOSTS: readonly Host[] = [
  { slug: "claude-code", name: "Claude Code", icon: "Terminal" },
  { slug: "cursor", name: "Cursor", icon: "MousePointer2" },
  { slug: "gemini-cli", name: "Gemini CLI", icon: "Terminal" },
] as const;

const FEED_TYPE_BY_SLUG: Record<string, FeedType> = Object.fromEntries(
  FEED_TYPES.map((f) => [f.slug, f]),
);

const HOST_BY_SLUG: Record<string, Host> = Object.fromEntries(
  HOSTS.map((h) => [h.slug, h]),
);

export function getFeedType(slug: string): FeedType | undefined {
  return FEED_TYPE_BY_SLUG[slug];
}

export function getHost(slug: string): Host | undefined {
  return HOST_BY_SLUG[slug];
}

/**
 * Resolve a feed-type slug to its localized label. Falls back to the raw
 * value so an unknown slug never renders blank.
 */
export function feedTypeLabel(slug: string, lang: "da" | "en" = "da"): string {
  const feedType = FEED_TYPE_BY_SLUG[slug];
  if (!feedType) return slug;
  return lang === "en" ? feedType.labelEn : feedType.labelDa;
}
