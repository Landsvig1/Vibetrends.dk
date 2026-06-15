export interface Skill {
  id: string;
  title: string;
  category: "Prompting" | "Agents" | "Automation" | "Fullstack";
  price: string;
  vibeCoder: string;
  vibeCoderTitle: string;
  rating: number;
  reviewsCount: number;
  description: string;
  tags: string[];
}

export interface ShowcaseProject {
  id: string;
  title: string;
  author: string;
  description: string;
  tools: string[];
  prompts: string[];
  upvotes: number;
  demoUrl: string;
  githubUrl?: string;
  imageUrl: string;
}

export interface ForumReply {
  id: string;
  author: string;
  content: string;
  createdAt: string;
}

export interface ForumThread {
  id: string;
  title: string;
  author: string;
  category: "General" | "Prompts" | "Showcase Discussion" | "Setup & Config";
  content: string;
  upvotes: number;
  replies: ForumReply[];
  createdAt: string;
}

export interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  readTime: string;
  publishedAt: string;
  imageUrl: string;
  category: "Guides" | "Industry" | "Workflow";
}

export interface Agent {
  id: string;
  name: string;
  developer: string;
  category: "DevTools" | "Writing" | "Browsing" | "MCP Server";
  description: string;
  installCommand: string;
  systemPrompt: string;
  upvotes: number;
  tags: string[];
}

export interface DbState {
  skills: Skill[];
  showcase: ShowcaseProject[];
  forum: ForumThread[];
  blog: BlogPost[];
  agents: Agent[];
}

const initialDbState: DbState = {
  skills: [
    {
      id: "s1",
      title: "Custom Cursor rules (.cursorrules) Optimization",
      category: "Prompting" as const,
      price: "$49",
      vibeCoder: "Lars Hansen",
      vibeCoderTitle: "Lead AI Automator at aiauto.dk",
      rating: 4.9,
      reviewsCount: 38,
      description: "Fine-tune your local Cursor workflow. I design custom .cursorrules tailored for Next.js, Tailwind v4, and Supabase integration to reduce agent hallucinations by 80%.",
      tags: ["Cursor", "Next.js", "Workspace Rules"],
    },
    {
      id: "s2",
      title: "Multi-Agent Workflow Design (LangGraph / CrewAI)",
      category: "Agents" as const,
      price: "$299",
      vibeCoder: "Sofie Nielsen",
      vibeCoderTitle: "Autonomous Agent Architect",
      rating: 4.8,
      reviewsCount: 14,
      description: "Get a production-ready multi-agent system. I build sequential and hierarchical agent structures that do web scraping, lead generation, and automated follow-ups.",
      tags: ["CrewAI", "LangGraph", "Python"],
    },
    {
      id: "s3",
      title: "Supabase Database & RLS Policy Auditing",
      category: "Automation" as const,
      price: "$149",
      vibeCoder: "Christian Møller",
      vibeCoderTitle: "Supabase Expert & Backend Engineer",
      rating: 5.0,
      reviewsCount: 22,
      description: "Ensure your database is secure. I review and write PostgreSQL Row-Level Security (RLS) policies, database triggers, and edge functions to secure your user data.",
      tags: ["Supabase", "Postgres", "Security"],
    },
    {
      id: "s4",
      title: "One-Click Vercel Pipeline & DNS Launch Setup",
      category: "Fullstack" as const,
      price: "$89",
      vibeCoder: "Mette Poulsen",
      vibeCoderTitle: "DevOps & Vibe Deploy Specialist",
      rating: 4.7,
      reviewsCount: 45,
      description: "Go from local code to live production in minutes. Setup automated preview deployments, environment variable injection, and custom domain configuration on Vercel.",
      tags: ["Vercel", "Simply.com", "CI/CD"],
    },
  ],
  showcase: [
    {
      id: "p1",
      title: "AutoNewsletter Generator",
      author: "Frederik Jensen",
      description: "A fully autonomous newsletter builder that reads RSS feeds, synthesizes topics using Claude 3.5 Sonnet, formats them in clean HTML, and sends them via Resend.",
      tools: ["Next.js 15", "Resend", "Claude 3.5 Sonnet", "Supabase"],
      prompts: [
        "Create a Next.js cron route that fetches RSS feeds, filters for AI news, generates summaries in HTML using Claude, and emails it using Resend.",
        "Add a styling layer to the dashboard showing a beautiful dark-mode chart of click-through rates."
      ],
      upvotes: 142,
      demoUrl: "https://newsletter-vibe.vercel.app",
      githubUrl: "https://github.com/frederik/autonewsletter",
      imageUrl: "/images/autonewsletter.jpg",
    },
    {
      id: "p2",
      title: "Simply DNS API Client GUI",
      author: "Mikkel Ravn",
      description: "A sleek Tailwind UI tool that hooks into the Simply.com DNS API to manage Danish domains, configure SRV and TXT records, and check propagation status.",
      tools: ["Vite", "Tailwind v4", "Simply.com API"],
      prompts: [
        "Build a clean single page React application with a domain overview. Implement domain record modifications using the Simply.com REST API endpoints.",
        "Add a dynamic search filter and loading skeleton grids for domain updates."
      ],
      upvotes: 89,
      demoUrl: "https://simplydns.vibetrends.dk",
      imageUrl: "/images/simplydns.jpg",
    },
    {
      id: "p3",
      title: "GitAgent - AI Commit & Branch Assistant",
      author: "Emil Christensen",
      description: "CLI tool that analyzes git diffs, writes semantic and clean commit messages under 72 chars, and suggests branch names following git conventions.",
      tools: ["Node.js", "Commander.js", "Gemini 2.5 Pro"],
      prompts: [
        "Write a node script that executes git diff, parses changes, calls Gemini API to summarize changes into a short commit message, and prints it.",
        "Implement options for --dry-run and --amend flags."
      ],
      upvotes: 215,
      demoUrl: "https://npmjs.com/package/git-vibe-agent",
      githubUrl: "https://github.com/emil/gitagent",
      imageUrl: "/images/gitagent.jpg",
    },
  ],
  forum: [
    {
      id: "t1",
      title: "How to handle Claude 3.5 token limits when vibe-coding large files?",
      author: "Jeppe_Vibe",
      category: "Setup & Config" as const,
      content: "Hi all! I am building a dashboard with about 1200 lines of code. Claude keeps failing halfway through edits due to max token limits. What is your strategy? Do you split your code into smaller custom hooks, or use a specific system prompt structure to force concise diff responses?",
      upvotes: 42,
      replies: [
        {
          id: "r1",
          author: "lars_aiauto",
          content: "Absolutely split it up. Standard rule of vibe coding: keep files under 200 lines if possible. Split your components, abstract business logic to hooks, and instruct the model to write diffs instead of replacing the entire file.",
          createdAt: "2026-06-13T18:30:00Z",
        },
        {
          id: "r2",
          author: "CoderVibeX",
          content: "I use a file-slicing script. It exposes only the relevant functions to Claude's context rather than the whole codebase. Highly recommend checking out the tool marketplace for context management tools.",
          createdAt: "2026-06-13T20:15:00Z",
        }
      ],
      createdAt: "2026-06-13T16:20:00Z",
    },
    {
      id: "t2",
      title: "Shared .cursorrules for Next.js 15 App Router & Tailwind CSS 4",
      author: "VibeMasterDk",
      category: "Prompts" as const,
      content: "Here is my ultimate `.cursorrules` file that forces the editor to write React 19 server actions correctly and enforces Tailwind v4's new theme syntax. Prevents the model from writing Tailwind v3 style configurations. Enjoy!",
      upvotes: 83,
      replies: [
        {
          id: "r3",
          author: "christian_dev",
          content: "This is pure gold. Tailwind v4 theme syntax in CSS is so new that models constantly hallucinate tailwind.config.js configurations. Adding this to my workspace immediately.",
          createdAt: "2026-06-13T12:00:00Z",
        }
      ],
      createdAt: "2026-06-13T09:45:00Z",
    },
  ],
  blog: [
    {
      id: "b1",
      title: "The Rise of the Vibe Coder: From Idea to Live App in 3 Hours",
      excerpt: "Vibe coding is changing how solo founders build. Discover the stack, tools, and prompts that let you ship real products with zero manual coding.",
      content: "Vibe coding isn't about ignoring software engineering; it's about shifting the cognitive load. Instead of writing boilerplate syntax, developers focus on system architecture, data structures, and integrations while letting LLMs generate code. In this guide, we outline the exact setup—Next.js 15, Tailwind v4, and Vercel—that enables Cand.it solo founders to construct fully realized web applications in hours rather than weeks...",
      author: "Kasper Landsvig",
      readTime: "5 min read",
      publishedAt: "2026-06-12",
      imageUrl: "/images/riseofvibecoder.jpg",
      category: "Workflow" as const,
    },
    {
      id: "b2",
      title: "Why Supabase is the Ultimate Backend for AI-Driven MVPs",
      excerpt: "Explore how Postgres vector storage, secure Row-Level Security, and automated edge functions make Supabase the top choice for vibe coding projects.",
      content: "When vibe coding, you want a backend that is solid, secure, and fast to setup. Supabase provides a fully-fledged Postgres database, pre-configured authentication, and object storage with direct API clients. We'll show you how to generate database schemas using natural language, setup database webhooks to trigger AI actions, and configure pgvector to store semantic knowledge pools...",
      author: "Sofie Nielsen",
      readTime: "7 min read",
      publishedAt: "2026-06-10",
      imageUrl: "/images/supabasebackend.jpg",
      category: "Guides" as const,
    },
  ],
  agents: [
    {
      id: "a1",
      name: "SimplyDNS MCP Server",
      developer: "aiauto.dk",
      category: "MCP Server" as const,
      description: "Model Context Protocol (MCP) server that grants AI agents the ability to read, edit, and create DNS records directly on Simply.com Danish registrar accounts.",
      installCommand: "npx -y @aiauto/mcp-simplydns --apiKey YOUR_KEY",
      systemPrompt: "You are an AI assistant configured with SimplyDNS MCP tools. You can query domain details, create A, CNAME, TXT, and MX records, and verify DNS changes.",
      upvotes: 68,
      tags: ["Simply.com", "MCP", "Node"],
    },
    {
      id: "a2",
      name: "TDD Vibe-Agent",
      developer: "VibeLabs",
      category: "DevTools" as const,
      description: "A custom system agent configured to run test-driven workflows: writes a failing unit test, implements the feature code, refactors, and runs Vitest automatically.",
      installCommand: "npm install -g tdd-vibe-agent",
      systemPrompt: "Strictly adhere to TDD principles. 1. Read requirement 2. Write failing test 3. Implement minimal code to pass 4. Run tests and verify 5. Refactor and clean.",
      upvotes: 124,
      tags: ["TDD", "Testing", "CLI"],
    },
  ]
};

// Global cache to persist across Next.js dev server reloads
const globalForDb = global as unknown as { db: DbState };
if (!globalForDb.db) {
  globalForDb.db = initialDbState;
}

export const db = globalForDb.db;

// Mock database API functions
export async function getSkills(search?: string, category?: string) {
  let list = db.skills;
  if (category && category !== "All") {
    list = list.filter(s => s.category === category);
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(s => s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.tags.some(t => t.toLowerCase().includes(q)));
  }
  return list;
}

export async function getProjects(search?: string) {
  let list = db.showcase;
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(p => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tools.some(t => t.toLowerCase().includes(q)));
  }
  // Sorted by upvotes
  return [...list].sort((a, b) => b.upvotes - a.upvotes);
}

export async function upvoteProject(id: string) {
  const proj = db.showcase.find(p => p.id === id);
  if (proj) {
    proj.upvotes += 1;
    return proj.upvotes;
  }
  return 0;
}

export async function getThreads(category?: string) {
  let list = db.forum;
  if (category && category !== "All") {
    list = list.filter(t => t.category === category);
  }
  return [...list].sort((a, b) => b.upvotes - a.upvotes);
}

export async function upvoteThread(id: string) {
  const thread = db.forum.find(t => t.id === id);
  if (thread) {
    thread.upvotes += 1;
    return thread.upvotes;
  }
  return 0;
}

export async function createThread(title: string, author: string, category: ForumThread["category"], content: string) {
  const newT: ForumThread = {
    id: "t_" + Date.now(),
    title,
    author,
    category,
    content,
    upvotes: 1,
    replies: [],
    createdAt: new Date().toISOString()
  };
  db.forum.push(newT);
  return newT;
}

export async function addReply(threadId: string, author: string, content: string) {
  const thread = db.forum.find(t => t.id === threadId);
  if (thread) {
    const newR: ForumReply = {
      id: "r_" + Date.now(),
      author,
      content,
      createdAt: new Date().toISOString()
    };
    thread.replies.push(newR);
    return thread;
  }
  return null;
}

export async function getBlogPosts() {
  return db.blog;
}

export async function getBlogPostById(id: string) {
  return db.blog.find(b => b.id === id) || null;
}

export async function getAgents(search?: string, category?: string) {
  let list = db.agents;
  if (category && category !== "All") {
    list = list.filter(a => a.category === category);
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(a => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.tags.some(t => t.toLowerCase().includes(q)));
  }
  return [...list].sort((a, b) => b.upvotes - a.upvotes);
}

export async function upvoteAgent(id: string) {
  const agent = db.agents.find(a => a.id === id);
  if (agent) {
    agent.upvotes += 1;
    return agent.upvotes;
  }
  return 0;
}

export async function createProject(title: string, author: string, description: string, tools: string[], prompts: string[], demoUrl: string, githubUrl?: string) {
  const newP: ShowcaseProject = {
    id: "p_" + Date.now(),
    title,
    author,
    description,
    tools,
    prompts,
    upvotes: 1,
    demoUrl,
    githubUrl,
    imageUrl: "/images/autonewsletter.jpg",
  };
  db.showcase.unshift(newP);
  return newP;
}

export async function deleteProject(id: string) {
  const index = db.showcase.findIndex(p => p.id === id);
  if (index !== -1) {
    db.showcase.splice(index, 1);
    return true;
  }
  return false;
}

export async function deleteThread(id: string) {
  const index = db.forum.findIndex(t => t.id === id);
  if (index !== -1) {
    db.forum.splice(index, 1);
    return true;
  }
  return false;
}

export async function deleteReply(threadId: string, replyId: string) {
  const thread = db.forum.find(t => t.id === threadId);
  if (thread) {
    const index = thread.replies.findIndex(r => r.id === replyId);
    if (index !== -1) {
      thread.replies.splice(index, 1);
      return true;
    }
  }
  return false;
}

export async function createAgent(name: string, developer: string, category: Agent["category"], description: string, installCommand: string, systemPrompt: string, tags: string[]) {
  const newA: Agent = {
    id: "a_" + Date.now(),
    name,
    developer,
    category,
    description,
    installCommand,
    systemPrompt,
    upvotes: 1,
    tags,
  };
  db.agents.unshift(newA);
  return newA;
}

export async function deleteAgent(id: string) {
  const index = db.agents.findIndex(a => a.id === id);
  if (index !== -1) {
    db.agents.splice(index, 1);
    return true;
  }
  return false;
}
