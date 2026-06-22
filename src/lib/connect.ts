/**
 * Host-aware connect recipes (R5/R6).
 *
 * Every feed item — a skill, an MCP server or a tool-CLI — should be one step
 * from a supported host (Claude Code, Cursor, Gemini CLI). Rather than store a
 * per-host config matrix, this module *templates* a host-specific recipe over
 * whatever install metadata the item already carries (install command, GitHub
 * URL, source). The host list is the single source of truth in feedTypes.ts.
 *
 * The recipe is intentionally small: an optional copyable command, an optional
 * config snippet to paste, and an ordered list of steps. Step copy is bilingual
 * (da/en) per the project's column-level i18n convention. When an item lacks
 * install metadata the builder returns a graceful manual-steps fallback rather
 * than an empty recipe, so the UI never renders a blank connect block.
 */

import { HOST_SLUGS, getHost, type FeedTypeSlug, type HostSlug } from "./feedTypes";

export type Lang = "da" | "en";

export interface ConnectItem {
  name: string;
  /** Shell command that installs/launches the item, when known. */
  installCommand?: string;
  /** Canonical repo, when known (skills carry this instead of a command). */
  githubUrl?: string;
  /** Attribution/source URL, used as a fallback reference. */
  source?: string;
}

export interface ConnectRecipe {
  host: HostSlug;
  hostName: string;
  /** A single copyable shell command, when the connect step is one command. */
  command?: string;
  /** A config snippet to paste into the host's config file, when applicable. */
  configSnippet?: string;
  /** Ordered steps, localized. Always at least one entry. */
  steps: string[];
}

function isKnownHost(host: string): host is HostSlug {
  return (HOST_SLUGS as readonly string[]).includes(host);
}

/**
 * Only emit a copyable `git clone` command for a trusted https github.com URL.
 * A well-formed but attacker-controlled URL (typosquat, git remote-helper form)
 * must not be presented as a one-click clone command; such items fall back to
 * link-only manual steps. Applied uniformly across all hosts.
 */
function safeCloneUrl(url?: string): string | undefined {
  return url && /^https:\/\/github\.com\//i.test(url) ? url : undefined;
}

/** Stable, config-key-safe identifier derived from the item name. */
function toKey(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "server"
  );
}

const pick = (lang: Lang, da: string, en: string) => (lang === "en" ? en : da);

function mcpRecipe(item: ConnectItem, host: HostSlug, hostName: string, lang: Lang): ConnectRecipe {
  const cmd = item.installCommand?.trim();
  const key = toKey(item.name);
  if (!cmd) return fallbackRecipe(item, host, hostName, lang);

  if (host === "claude-code") {
    return {
      host,
      hostName,
      command: `claude mcp add ${key} -- ${cmd}`,
      steps: [
        pick(
          lang,
          `Kør denne kommando i din terminal for at registrere ${item.name} i Claude Code.`,
          `Run this in your terminal to register ${item.name} with Claude Code.`,
        ),
      ],
    };
  }

  // Cursor and Gemini CLI both consume an mcpServers JSON map.
  const configFile = host === "cursor" ? "~/.cursor/mcp.json" : "~/.gemini/settings.json";
  const configSnippet = JSON.stringify({ mcpServers: { [key]: { command: cmd } } }, null, 2);
  return {
    host,
    hostName,
    configSnippet,
    steps: [
      pick(
        lang,
        `Tilføj denne post til ${configFile} under "mcpServers".`,
        `Add this entry to ${configFile} under "mcpServers".`,
      ),
      pick(lang, `Genstart ${hostName} for at indlæse ${item.name}.`, `Restart ${hostName} to load ${item.name}.`),
    ],
  };
}

function toolCliRecipe(item: ConnectItem, host: HostSlug, hostName: string, lang: Lang): ConnectRecipe {
  const cmd = item.installCommand?.trim();
  if (!cmd) return fallbackRecipe(item, host, hostName, lang);
  return {
    host,
    hostName,
    command: cmd,
    steps: [
      pick(lang, `Kør installationskommandoen i dit projekt.`, `Run the install command in your project.`),
      pick(lang, `Din ${hostName}-agent kan nu kalde ${item.name}.`, `Your ${hostName} agent can now invoke ${item.name}.`),
    ],
  };
}

function skillRecipe(item: ConnectItem, host: HostSlug, hostName: string, lang: Lang): ConnectRecipe {
  const ref = item.githubUrl || item.source;
  if (!ref) return fallbackRecipe(item, host, hostName, lang);

  // Guard the clone URL once and reuse it across every host branch.
  const cloneUrl = safeCloneUrl(item.githubUrl);
  const command = cloneUrl ? `git clone ${cloneUrl}` : undefined;

  if (host === "claude-code") {
    return {
      host,
      hostName,
      command,
      steps: [
        pick(lang, `Hent skill'en fra ${ref}.`, `Get the skill from ${ref}.`),
        pick(
          lang,
          `Læg den i dit projekts .claude/skills/-mappe.`,
          `Place it in your project's .claude/skills/ directory.`,
        ),
        pick(
          lang,
          `Claude Code opfanger den automatisk — kald den fra skill-menuen.`,
          `Claude Code picks it up automatically — invoke it from the skill menu.`,
        ),
      ],
    };
  }

  // Cursor / Gemini: surface the source as project rules/context.
  return {
    host,
    hostName,
    command,
    steps: [
      pick(lang, `Hent skill'en fra ${ref}.`, `Get the skill from ${ref}.`),
      pick(
        lang,
        `Tilføj dens instruktioner til dine ${hostName}-projektregler eller -kontekst.`,
        `Add its instructions to your ${hostName} project rules or context.`,
      ),
    ],
  };
}

function fallbackRecipe(item: ConnectItem, host: HostSlug, hostName: string, lang: Lang): ConnectRecipe {
  const ref = item.githubUrl || item.source;
  return {
    host,
    hostName,
    steps: ref
      ? [
          pick(
            lang,
            `Der er ingen automatisk installationskommando for ${item.name}.`,
            `No automated install command is available for ${item.name}.`,
          ),
          pick(
            lang,
            `Følg kilden på ${ref} for at tilføje den til ${hostName} manuelt.`,
            `Follow its source at ${ref} to add it to ${hostName} manually.`,
          ),
        ]
      : [
          pick(
            lang,
            `Der er ingen automatiske installationsdata for ${item.name}.`,
            `No automated install metadata is available for ${item.name}.`,
          ),
          pick(
            lang,
            `Åbn dens side på vibetrends og følg den linkede kilde for at tilføje den til ${hostName}.`,
            `Open its page on vibetrends and follow the linked source to add it to ${hostName}.`,
          ),
        ],
  };
}

/**
 * Build a host-specific connect recipe for a feed item. Never throws: an
 * unknown host or missing metadata yields a graceful fallback recipe.
 */
export function buildConnectRecipe(
  feedType: FeedTypeSlug,
  item: ConnectItem,
  host: string,
  lang: Lang = "da",
): ConnectRecipe {
  if (!isKnownHost(host)) {
    return {
      host: HOST_SLUGS[0],
      hostName: getHost(HOST_SLUGS[0])?.name ?? "your host",
      steps: [
        pick(
          lang,
          `"${host}" er ikke en understøttet host. Vælg Claude Code, Cursor eller Gemini CLI.`,
          `"${host}" is not a supported host. Choose Claude Code, Cursor or Gemini CLI.`,
        ),
      ],
    };
  }
  const hostName = getHost(host)?.name ?? host;

  switch (feedType) {
    case "mcp-servers":
      return mcpRecipe(item, host, hostName, lang);
    case "tool-clis":
      return toolCliRecipe(item, host, hostName, lang);
    case "skills":
      return skillRecipe(item, host, hostName, lang);
    default:
      return fallbackRecipe(item, host, hostName, lang);
  }
}
