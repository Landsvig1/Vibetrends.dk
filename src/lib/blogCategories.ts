import type { BlogPost } from "./db";

/**
 * Single source of truth for the blog category set, consumed by both
 * POST /api/blog's Zod schema and the MCP submit_blog_post tool's
 * inputSchema — mirrors the existing pattern in skillCategories.ts and
 * forumCategories.ts.
 */
export const BLOG_CATEGORIES = ["Guides", "Agents", "Workflow"] as const satisfies BlogPost["category"][];
