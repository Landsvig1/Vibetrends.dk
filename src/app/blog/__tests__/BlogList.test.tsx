import { describe, it, expect } from "vitest";
import { filterBlogPosts } from "../BlogList";
import type { BlogPost } from "@/lib/db";

function makeBlogPost(
  id: string,
  title: string,
  excerpt: string,
  category: BlogPost["category"] = "Guides"
): BlogPost {
  return {
    id,
    title,
    excerpt,
    content: "Content for " + title,
    author: "Alice",
    readTime: "5 min",
    publishedAt: "2026-07-20",
    category,
  };
}

const posts: BlogPost[] = [
  makeBlogPost(
    "b1",
    "Getting Started with Cursor",
    "Learn how to use Cursor to build faster applications with AI.",
    "Guides"
  ),
  makeBlogPost(
    "b2",
    "Model Context Protocol Workflow",
    "How we optimized our local developer workflow using MCP servers.",
    "Workflow"
  ),
  makeBlogPost(
    "b3",
    "Custom Agentic Assistants",
    "A guide on configuring your own specialized agent personas.",
    "Agents"
  ),
];

describe("filterBlogPosts — client-side search query and category filtering", () => {
  it("returns all posts for an empty query with selectedCategory 'All'", () => {
    expect(filterBlogPosts(posts, "All", "")).toHaveLength(3);
  });

  it("filters correctly by category when no search query is provided", () => {
    const guides = filterBlogPosts(posts, "Guides", "");
    expect(guides).toHaveLength(1);
    expect(guides[0].id).toBe("b1");

    const workflows = filterBlogPosts(posts, "Workflow", "");
    expect(workflows).toHaveLength(1);
    expect(workflows[0].id).toBe("b2");
  });

  it("matches on title case-insensitively", () => {
    const results = filterBlogPosts(posts, "All", "CURSOR");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("b1");
  });

  it("matches on excerpt case-insensitively", () => {
    const results = filterBlogPosts(posts, "All", "optimized");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("b2");
  });

  it("supports cumulative filtering on both category and search query", () => {
    const results = filterBlogPosts(posts, "Agents", "Agentic");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("b3");

    // Matches search query but category does not match
    const noResults = filterBlogPosts(posts, "Workflow", "Agentic");
    expect(noResults).toHaveLength(0);
  });

  it("returns an empty array when no posts match", () => {
    expect(filterBlogPosts(posts, "All", "not-matching-at-all")).toEqual([]);
  });

  it("returns an empty array for empty post lists", () => {
    expect(filterBlogPosts([], "All", "Cursor")).toEqual([]);
  });
});
