import { z } from "zod";
import { SKILL_CATEGORY_SLUGS } from "./skillCategories";
import { isAllowedImageUrl } from "./allowedImageHosts";
import { BLOG_CATEGORIES } from "./blogCategories";
import { FORUM_CATEGORY_KEYS } from "./forumCategories";

/**
 * Shared schemas for the rest API surfaces and the MCP server tools,
 * ensuring input validation parity across standard HTTP/REST and JSON-RPC.
 */

export const skillSchema = z.object({
  title: z.string().min(1).max(100),
  category: z.enum(SKILL_CATEGORY_SLUGS),
  // Only title + link are essential. Description is optional (empty allowed).
  description: z.string().max(1000).optional().or(z.literal("")),
  // Danish translation of `description`. Optional — omit it (or send "") and
  // the row stores null, which the read path renders as the English original.
  // Never send the English string here: that is exactly the state
  // 20260804000000_description_da_nullable.sql cleared.
  descriptionDa: z.string().max(1000).optional().or(z.literal("")),
  // Max 10 tags, and each individual tag string is limited to 50 characters to mitigate DoS/bloat.
  tags: z.array(z.string().max(50)).max(10).optional(),
  githubUrl: z.string().url().max(200),
  // Attribution for bot-imported skills (e.g. the source repo URL). Optional —
  // human submissions via the web form don't set this. Mirrors githubUrl's
  // sibling fields (demoUrl/imageUrl) in accepting "" as "not provided".
  source: z.string().url().max(300).optional().or(z.literal("")),
});

export const projectSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(10).max(500),
  // Danish translation of `description` — see skillSchema.descriptionDa.
  // No min length: unlike `description` this may legitimately be absent.
  descriptionDa: z.string().max(500).optional().or(z.literal("")),
  // Max 10 tools, and each individual tool string is limited to 50 characters.
  tools: z.array(z.string().max(50)).max(10).optional(),
  // Max 20 prompts, and each individual prompt string is limited to 2000 characters to prevent DoS.
  prompts: z.array(z.string().max(2000)).max(20).optional(),
  // demoUrl is optional in both REST and MCP tool schemas.
  demoUrl: z.string().url().max(200).optional().or(z.literal("")),
  githubUrl: z.string().url().max(200).optional(),
  // Restricted to the same hosts next.config.ts's remotePatterns/CSP allow —
  // an imageUrl that passes .url() but isn't on that allowlist would pass
  // validation here and then throw at render time for every visitor viewing
  // the card (next/image rejects unconfigured hostnames).
  imageUrl: z.string().url().max(300).refine(isAllowedImageUrl, {
    message: "imageUrl host is not allowed (must match next.config.ts's image remotePatterns)",
  }).optional().or(z.literal("")),
});

export const agentSchema = z.object({
  name: z.string().min(1).max(100),
  // Feed-worthy categories only — hosts are connection targets, not submittable
  // catalog items (R2).
  category: z.enum(["CLI", "MCP Server"]),
  description: z.string().min(10).max(500),
  // Danish translation of `description` — see skillSchema.descriptionDa in
  // src/lib/schemas.ts. Omitted means null, which renders as the English.
  descriptionDa: z.string().max(500).optional().or(z.literal("")),
  // installCommand is rendered as a copyable "run this in your terminal"
  // command by ConnectBlock, so reject shell metacharacters that would let a
  // submitted row smuggle a command-chaining / substitution payload into a
  // one-click copy. Legit install strings (npx/npm/pnpm/uvx ...) do not use them.
  installCommand: z
    .string()
    .max(300)
    .refine((s) => !/[;&|`$\n\r<>]/.test(s), {
      message: "installCommand must not contain shell metacharacters (; & | ` $ < > or newlines)",
    })
    .optional(),
  // Limit systemPrompt to 10000 characters to prevent database bloat/DoS.
  systemPrompt: z.string().max(10000).optional(),
  // Max 10 tags, and each individual tag string is limited to 50 characters to mitigate DoS/bloat.
  tags: z.array(z.string().max(50)).max(10).optional(),
  // Canonical repo/site for the tool (rendered as an outbound link).
  sourceUrl: z.string().url().max(300).optional().or(z.literal("")),
});

export const threadSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.enum(FORUM_CATEGORY_KEYS),
  content: z.string().min(10).max(5000),
});

export const blogPostSchema = z.object({
  title: z.string().min(1).max(200),
  excerpt: z.string().min(1).max(500),
  content: z.string().min(1).max(50000),
  // author is derived from the authenticated identity (user.username), not the
  // request body — mirrors how createProject/createSkill work.
  readTime: z.string().min(1).max(50),
  publishedAt: z.string().min(1).max(50),
  imageUrl: z.string().url().max(500).refine(isAllowedImageUrl, {
    message: "imageUrl host is not allowed (must match next.config.ts's image remotePatterns)",
  }),
  category: z.enum(BLOG_CATEGORIES),
});

export const replySchema = z.object({
  content: z.string().min(1).max(5000),
});

// Shared formatter for a failed Zod safeParse, used by both REST routes and
// the MCP tool dispatcher so error message shape stays consistent everywhere.
export function formatZodError(error: z.ZodError): string {
  return error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
}
