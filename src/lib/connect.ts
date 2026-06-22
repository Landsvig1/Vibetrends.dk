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
 * config snippet to paste, and an ordered list of steps. When an item lacks
 * install metadata the builder returns a graceful manual-steps fallback rather
 * than an empty recipe, so the UI never renders a blank connect block.
 */

import { HOST_SLUGS, getHost, type FeedTypeSlug, type HostSlug } from "./feedTypes";

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
  /** Ordered steps. Always at least one entry. */
  steps: string[];
}

function isKnownHost(host: string): host is HostSlug {
  return (HOST_SLUGS as readonly string[]).includes(host);
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

function mcpRecipe(item: ConnectItem, host: HostSlug, hostName: string): ConnectRecipe {
  const cmd = item.installCommand?.trim();
  const key = toKey(item.name);
  if (!cmd) return fallbackRecipe(item, host, hostName);

  if (host === "claude-code") {
    return {
      host,
      hostName,
      command: `claude mcp add ${key} -- ${cmd}`,
      steps: [`Run this in your terminal to register ${item.name} with Claude Code.`],
    };
  }

  // Cursor and Gemini CLI both consume an mcpServers JSON map.
  const configFile = host === "cursor" ? "~/.cursor/mcp.json" : "~/.gemini/settings.json";
  const configSnippet = JSON.stringify(
    { mcpServers: { [key]: { command: cmd } } },
    null,
    2,
  );
  return {
    host,
    hostName,
    configSnippet,
    steps: [
      `Add this entry to ${configFile} under "mcpServers".`,
      `Restart ${hostName} to load ${item.name}.`,
    ],
  };
}

function toolCliRecipe(item: ConnectItem, host: HostSlug, hostName: string): ConnectRecipe {
  const cmd = item.installCommand?.trim();
  if (!cmd) return fallbackRecipe(item, host, hostName);
  return {
    host,
    hostName,
    command: cmd,
    steps: [
      `Run the install command in your project.`,
      `Your ${hostName} agent can now invoke ${item.name}.`,
    ],
  };
}

function skillRecipe(item: ConnectItem, host: HostSlug, hostName: string): ConnectRecipe {
  const ref = item.githubUrl || item.source;
  if (!ref) return fallbackRecipe(item, host, hostName);

  if (host === "claude-code") {
    return {
      host,
      hostName,
      command: item.githubUrl ? `git clone ${item.githubUrl}` : undefined,
      steps: [
        `Get the skill from ${ref}.`,
        `Place it in your project's .claude/skills/ directory.`,
        `Claude Code picks it up automatically — invoke it from the skill menu.`,
      ],
    };
  }

  // Cursor / Gemini: surface the source as project rules/context.
  return {
    host,
    hostName,
    command: item.githubUrl ? `git clone ${item.githubUrl}` : undefined,
    steps: [
      `Get the skill from ${ref}.`,
      `Add its instructions to your ${hostName} project rules or context.`,
    ],
  };
}

function fallbackRecipe(item: ConnectItem, host: HostSlug, hostName: string): ConnectRecipe {
  const ref = item.githubUrl || item.source;
  return {
    host,
    hostName,
    steps: ref
      ? [
          `No automated install command is available for ${item.name}.`,
          `Follow its source at ${ref} to add it to ${hostName} manually.`,
        ]
      : [
          `No automated install metadata is available for ${item.name}.`,
          `Open its page on vibetrends and follow the linked source to add it to ${hostName}.`,
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
): ConnectRecipe {
  if (!isKnownHost(host)) {
    return {
      host: HOST_SLUGS[0],
      hostName: getHost(HOST_SLUGS[0])?.name ?? "your host",
      steps: [`"${host}" is not a supported host. Choose Claude Code, Cursor or Gemini CLI.`],
    };
  }
  const hostName = getHost(host)?.name ?? host;

  switch (feedType) {
    case "mcp-servers":
      return mcpRecipe(item, host, hostName);
    case "tool-clis":
      return toolCliRecipe(item, host, hostName);
    case "skills":
      return skillRecipe(item, host, hostName);
    default:
      return fallbackRecipe(item, host, hostName);
  }
}
