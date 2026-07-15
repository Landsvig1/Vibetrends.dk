import { z } from "zod";
import { SKILL_CATEGORY_SLUGS } from "./skillCategories";
import { isAllowedImageUrl } from "./allowedImageHosts";
import { BLOG_CATEGORIES } from "./blogCategories";

/**
 * Shared schemas for the rest API surfaces and the MCP server tools,
 * ensuring input validation parity across standard HTTP/REST and JSON-RPC.
 */

export const skillSchema = z.object({
  title: z.string().min(1).max(100),
  category: z.enum(SKILL_CATEGORY_SLUGS),
  // Only title + link are essential. Description is optional (empty allowed).
  description: z.string().max(1000).optional().or(z.literal("")),
  tags: z.array(z.string()).max(10).optional(),
  githubUrl: z.string().url().max(200),
  // Attribution for bot-imported skills (e.g. the source repo URL). Optional —
  // human submissions via the web form don't set this. Mirrors githubUrl's
  // sibling fields (demoUrl/imageUrl) in accepting "" as "not provided".
  source: z.string().url().max(300).optional().or(z.literal("")),
});

export const projectSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(10).max(500),
  tools: z.array(z.string()).max(10).optional(),
  prompts: z.array(z.string()).optional(),
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

export const blogPostSchema = z.object({
  title: z.string().min(1).max(200),
  excerpt: z.string().min(1).max(500),
  content: z.string().min(1).max(50000),
  // author is derived from the authenticated identity (user.username), not the
  // request body — mirrors how createProject/createSkill work.
  readTime: z.string().min(1).max(50),
  publishedAt: z.string().min(1).max(50),
  imageUrl: z.string().url().max(500),
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
