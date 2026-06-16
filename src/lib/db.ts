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

export interface RawSkill extends Skill {
  title_da?: string;
  title_en?: string;
  vibeCoderTitle_da?: string;
  vibeCoderTitle_en?: string;
  description_da?: string;
  description_en?: string;
}

export interface RawShowcaseProject extends ShowcaseProject {
  title_da?: string;
  title_en?: string;
  description_da?: string;
  description_en?: string;
}

export interface RawForumReply extends ForumReply {
  content_da?: string;
  content_en?: string;
}

export interface RawForumThread extends ForumThread {
  title_da?: string;
  title_en?: string;
  content_da?: string;
  content_en?: string;
  replies: RawForumReply[];
}

export interface RawBlogPost extends BlogPost {
  title_da?: string;
  title_en?: string;
  excerpt_da?: string;
  excerpt_en?: string;
  content_da?: string;
  content_en?: string;
}

export interface RawAgent extends Agent {
  description_da?: string;
  description_en?: string;
  systemPrompt_da?: string;
  systemPrompt_en?: string;
}

export interface DbState {
  skills: RawSkill[];
  showcase: RawShowcaseProject[];
  forum: RawForumThread[];
  blog: RawBlogPost[];
  agents: RawAgent[];
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

// Language helper translators
function translateSkill(s: RawSkill, lang: 'da' | 'en'): Skill {
  return {
    ...s,
    title: lang === 'en' ? (s.title_en || s.title) : (s.title_da || s.title),
    vibeCoderTitle: lang === 'en' ? (s.vibeCoderTitle_en || s.vibeCoderTitle) : (s.vibeCoderTitle_da || s.vibeCoderTitle),
    description: lang === 'en' ? (s.description_en || s.description) : (s.description_da || s.description),
  };
}

function translateProject(p: RawShowcaseProject, lang: 'da' | 'en'): ShowcaseProject {
  return {
    ...p,
    title: lang === 'en' ? (p.title_en || p.title) : (p.title_da || p.title),
    description: lang === 'en' ? (p.description_en || p.description) : (p.description_da || p.description),
  };
}

function translateThread(t: RawForumThread, lang: 'da' | 'en'): ForumThread {
  return {
    ...t,
    title: lang === 'en' ? (t.title_en || t.title) : (t.title_da || t.title),
    content: lang === 'en' ? (t.content_en || t.content) : (t.content_da || t.content),
    replies: (t.replies || []).map((r) => ({
      ...r,
      content: lang === 'en' ? (r.content_en || r.content) : (r.content_da || r.content),
    })),
  };
}

function translateBlogPost(b: RawBlogPost, lang: 'da' | 'en'): BlogPost {
  return {
    ...b,
    title: lang === 'en' ? (b.title_en || b.title) : (b.title_da || b.title),
    excerpt: lang === 'en' ? (b.excerpt_en || b.excerpt) : (b.excerpt_da || b.excerpt),
    content: lang === 'en' ? (b.content_en || b.content) : (b.content_da || b.content),
  };
}

function translateAgent(a: RawAgent, lang: 'da' | 'en'): Agent {
  return {
    ...a,
    description: lang === 'en' ? (a.description_en || a.description) : (a.description_da || a.description),
    systemPrompt: lang === 'en' ? (a.systemPrompt_en || a.systemPrompt) : (a.systemPrompt_da || a.systemPrompt),
  };
}

// Mock database API functions
export async function getSkills(search?: string, category?: string, lang: 'da' | 'en' = 'da') {
  const db = await getDb();
  let list = db.skills;
  if (category && category !== "All") {
    list = list.filter(s => s.category === category);
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(s => {
      const translated = translateSkill(s, lang);
      return translated.title.toLowerCase().includes(q) || 
             translated.description.toLowerCase().includes(q) || 
             translated.tags.some(t => t.toLowerCase().includes(q));
    });
  }
  return list.map(s => translateSkill(s, lang));
}

export async function getProjects(search?: string, lang: 'da' | 'en' = 'da') {
  const db = await getDb();
  let list = db.showcase;
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(p => {
      const translated = translateProject(p, lang);
      return translated.title.toLowerCase().includes(q) || 
             translated.description.toLowerCase().includes(q) || 
             translated.tools.some(t => t.toLowerCase().includes(q));
    });
  }
  // Sorted by upvotes
  return [...list].map(p => translateProject(p, lang)).sort((a, b) => b.upvotes - a.upvotes);
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

export async function getThreads(category?: string, lang: 'da' | 'en' = 'da') {
  const db = await getDb();
  let list = db.forum;
  if (category && category !== "All") {
    list = list.filter(t => t.category === category);
  }
  return [...list].map(t => translateThread(t, lang)).sort((a, b) => b.upvotes - a.upvotes);
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
  // Store default in both to prevent empty spaces
  const rawT = newT as RawForumThread;
  rawT.title_da = title;
  rawT.title_en = title;
  rawT.content_da = content;
  rawT.content_en = content;

  db.forum.push(rawT);
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
    const rawR = newR as RawForumReply;
    rawR.content_da = content;
    rawR.content_en = content;

    thread.replies.push(rawR);
    await persist();
    return translateThread(thread, 'da'); // Return translated in da as fallback
  }
  return null;
}

export async function getBlogPosts(lang: 'da' | 'en' = 'da') {
  const db = await getDb();
  return db.blog.map(b => translateBlogPost(b, lang));
}

export async function getBlogPostById(id: string, lang: 'da' | 'en' = 'da') {
  const db = await getDb();
  const post = db.blog.find(b => b.id === id);
  return post ? translateBlogPost(post, lang) : null;
}

export async function getAgents(search?: string, category?: string, lang: 'da' | 'en' = 'da') {
  const db = await getDb();
  let list = db.agents;
  if (category && category !== "All") {
    list = list.filter(a => a.category === category);
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(a => {
      const translated = translateAgent(a, lang);
      return translated.name.toLowerCase().includes(q) || 
             translated.description.toLowerCase().includes(q) || 
             translated.tags.some(t => t.toLowerCase().includes(q));
    });
  }
  return [...list].map(a => translateAgent(a, lang)).sort((a, b) => b.upvotes - a.upvotes);
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
  const rawP = newP as RawShowcaseProject;
  rawP.title_da = title;
  rawP.title_en = title;
  rawP.description_da = description;
  rawP.description_en = description;

  db.showcase.unshift(rawP);
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
  const rawS = newS as RawSkill;
  rawS.title_da = title;
  rawS.title_en = title;
  rawS.description_da = description;
  rawS.description_en = description;
  rawS.vibeCoderTitle_da = "Community-bidragyder";
  rawS.vibeCoderTitle_en = "Community Contributor";

  db.skills.unshift(rawS);
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
  const rawA = newA as RawAgent;
  rawA.description_da = description;
  rawA.description_en = description;
  rawA.systemPrompt_da = systemPrompt;
  rawA.systemPrompt_en = systemPrompt;

  db.agents.unshift(rawA);
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
