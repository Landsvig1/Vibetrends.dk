import { getDbData, saveDbData } from "./github";

export interface Skill {
  id: string;
  title: string;
  category: "Prompting" | "Agents" | "Automation" | "Fullstack";
  vibeCoder: string;
  vibeCoderTitle: string;
  rating: number;
  reviewsCount: number;
  description: string;
  tags: string[];
  githubUrl?: string;
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

// Singleton for DB state
let dbCache: DbState | null = null;

export async function getDb(): Promise<DbState> {
  if (!dbCache) {
    dbCache = await getDbData();
  }
  return dbCache!;
}

async function persist() {
  if (dbCache) {
    await saveDbData(dbCache);
  }
}

// Mock database API functions
export async function getSkills(search?: string, category?: string) {
  const db = await getDb();
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
  const db = await getDb();
  let list = db.showcase;
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(p => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tools.some(t => t.toLowerCase().includes(q)));
  }
  // Sorted by upvotes
  return [...list].sort((a, b) => b.upvotes - a.upvotes);
}

export async function upvoteProject(id: string) {
  const db = await getDb();
  const proj = db.showcase.find(p => p.id === id);
  if (proj) {
    proj.upvotes += 1;
    await persist();
    return proj.upvotes;
  }
  return 0;
}

export async function getThreads(category?: string) {
  const db = await getDb();
  let list = db.forum;
  if (category && category !== "All") {
    list = list.filter(t => t.category === category);
  }
  return [...list].sort((a, b) => b.upvotes - a.upvotes);
}

export async function upvoteThread(id: string) {
  const db = await getDb();
  const thread = db.forum.find(t => t.id === id);
  if (thread) {
    thread.upvotes += 1;
    await persist();
    return thread.upvotes;
  }
  return 0;
}

export async function createThread(title: string, author: string, category: ForumThread["category"], content: string) {
  const db = await getDb();
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
  await persist();
  return newT;
}

export async function addReply(threadId: string, author: string, content: string) {
  const db = await getDb();
  const thread = db.forum.find(t => t.id === threadId);
  if (thread) {
    const newR: ForumReply = {
      id: "r_" + Date.now(),
      author,
      content,
      createdAt: new Date().toISOString()
    };
    thread.replies.push(newR);
    await persist();
    return thread;
  }
  return null;
}

export async function getBlogPosts() {
  const db = await getDb();
  return db.blog;
}

export async function getBlogPostById(id: string) {
  const db = await getDb();
  return db.blog.find(b => b.id === id) || null;
}

export async function getAgents(search?: string, category?: string) {
  const db = await getDb();
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
  const db = await getDb();
  const agent = db.agents.find(a => a.id === id);
  if (agent) {
    agent.upvotes += 1;
    await persist();
    return agent.upvotes;
  }
  return 0;
}

export async function createProject(title: string, author: string, description: string, tools: string[], prompts: string[], demoUrl: string, githubUrl?: string) {
  const db = await getDb();
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
  await persist();
  return newP;
}

export async function createSkill(title: string, vibeCoder: string, description: string, category: Skill["category"], tags: string[], githubUrl?: string) {
  const db = await getDb();
  const newS: Skill = {
    id: "s_" + Date.now(),
    title,
    category,
    vibeCoder,
    vibeCoderTitle: "Community Contributor",
    rating: 5.0,
    reviewsCount: 0,
    description,
    tags,
    githubUrl
  };
  db.skills.unshift(newS);
  await persist();
  return newS;
}

export async function deleteProject(id: string) {
  const db = await getDb();
  const index = db.showcase.findIndex(p => p.id === id);
  if (index !== -1) {
    db.showcase.splice(index, 1);
    await persist();
    return true;
  }
  return false;
}

export async function deleteThread(id: string) {
  const db = await getDb();
  const index = db.forum.findIndex(t => t.id === id);
  if (index !== -1) {
    db.forum.splice(index, 1);
    await persist();
    return true;
  }
  return false;
}

export async function deleteReply(threadId: string, replyId: string) {
  const db = await getDb();
  const thread = db.forum.find(t => t.id === threadId);
  if (thread) {
    const index = thread.replies.findIndex(r => r.id === replyId);
    if (index !== -1) {
      thread.replies.splice(index, 1);
      await persist();
      return true;
    }
  }
  return false;
}

export async function createAgent(name: string, developer: string, category: Agent["category"], description: string, installCommand: string, systemPrompt: string, tags: string[]) {
  const db = await getDb();
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
  await persist();
  return newA;
}

export async function deleteAgent(id: string) {
  const db = await getDb();
  const index = db.agents.findIndex(a => a.id === id);
  if (index !== -1) {
    db.agents.splice(index, 1);
    await persist();
    return true;
  }
  return false;
}
