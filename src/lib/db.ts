import { supabasePublic, createSupabaseServerClient } from "./supabase-server";

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

// Database row shapes (snake_case, bilingual columns)
interface SkillRow {
  id: string;
  title_da: string;
  title_en: string;
  category: Skill["category"];
  vibe_coder: string;
  vibe_coder_title_da: string;
  vibe_coder_title_en: string;
  rating: number | string;
  reviews_count: number;
  description_da: string;
  description_en: string;
  tags: string[] | null;
  github_url: string | null;
}

interface ShowcaseRow {
  id: string;
  title_da: string;
  title_en: string;
  author: string;
  description_da: string;
  description_en: string;
  tools: string[] | null;
  prompts: string[] | null;
  upvotes: number | null;
  demo_url: string | null;
  github_url: string | null;
  image_url: string | null;
}

interface ThreadRow {
  id: string;
  title_da: string;
  title_en: string;
  author: string;
  category: ForumThread["category"];
  content_da: string;
  content_en: string;
  upvotes: number | null;
  created_at: string;
}

interface ReplyRow {
  id: string;
  thread_id: string;
  author: string;
  content_da: string;
  content_en: string;
  created_at: string;
}

interface BlogPostRow {
  id: string;
  title_da: string;
  title_en: string;
  excerpt_da: string;
  excerpt_en: string;
  content_da: string;
  content_en: string;
  author: string;
  read_time: string;
  published_at: string;
  image_url: string;
  category: BlogPost["category"];
}

interface AgentRow {
  id: string;
  name: string;
  developer: string;
  category: Agent["category"];
  description_da: string;
  description_en: string;
  install_command: string;
  system_prompt_da: string;
  system_prompt_en: string;
  upvotes: number | null;
  tags: string[] | null;
}

// Map database entities to frontend camelCase objects
function mapSkill(s: SkillRow, lang: 'da' | 'en'): Skill {
  return {
    id: s.id,
    title: lang === 'en' ? s.title_en : s.title_da,
    category: s.category,
    vibeCoder: s.vibe_coder,
    vibeCoderTitle: lang === 'en' ? s.vibe_coder_title_en : s.vibe_coder_title_da,
    rating: Number(s.rating),
    reviewsCount: s.reviews_count,
    description: lang === 'en' ? s.description_en : s.description_da,
    tags: s.tags || [],
    githubUrl: s.github_url || undefined,
  };
}

function mapProject(p: ShowcaseRow, lang: 'da' | 'en'): ShowcaseProject {
  return {
    id: p.id,
    title: lang === 'en' ? p.title_en : p.title_da,
    author: p.author,
    description: lang === 'en' ? p.description_en : p.description_da,
    tools: p.tools || [],
    prompts: p.prompts || [],
    upvotes: p.upvotes || 0,
    demoUrl: p.demo_url || '',
    githubUrl: p.github_url || undefined,
    imageUrl: p.image_url || '/images/autonewsletter.jpg',
  };
}

function mapThread(t: ThreadRow, replies: ReplyRow[], lang: 'da' | 'en'): ForumThread {
  return {
    id: t.id,
    title: lang === 'en' ? t.title_en : t.title_da,
    author: t.author,
    category: t.category,
    content: lang === 'en' ? t.content_en : t.content_da,
    upvotes: t.upvotes || 0,
    replies: (replies || []).map(r => ({
      id: r.id,
      author: r.author,
      content: lang === 'en' ? r.content_en : r.content_da,
      createdAt: r.created_at,
    })),
    createdAt: t.created_at,
  };
}

function mapBlogPost(b: BlogPostRow, lang: 'da' | 'en'): BlogPost {
  return {
    id: b.id,
    title: lang === 'en' ? b.title_en : b.title_da,
    excerpt: lang === 'en' ? b.excerpt_en : b.excerpt_da,
    content: lang === 'en' ? b.content_en : b.content_da,
    author: b.author,
    readTime: b.read_time,
    publishedAt: b.published_at,
    imageUrl: b.image_url,
    category: b.category,
  };
}

function mapAgent(a: AgentRow, lang: 'da' | 'en'): Agent {
  return {
    id: a.id,
    name: a.name,
    developer: a.developer,
    category: a.category,
    description: lang === 'en' ? a.description_en : a.description_da,
    installCommand: a.install_command,
    systemPrompt: lang === 'en' ? a.system_prompt_en : a.system_prompt_da,
    upvotes: a.upvotes || 0,
    tags: a.tags || [],
  };
}

// DB API functions utilizing Supabase

export async function getSkills(search?: string, category?: string, lang: 'da' | 'en' = 'da') {
  let query = supabasePublic.from('skills').select('*');
  
  if (category && category !== "All") {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  let list = data.map(s => mapSkill(s, lang));

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(s => 
      s.title.toLowerCase().includes(q) || 
      s.description.toLowerCase().includes(q) || 
      s.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  return list;
}

export async function getProjects(search?: string, lang: 'da' | 'en' = 'da') {
  const query = supabasePublic.from('showcase').select('*').order('upvotes', { ascending: false });

  const { data, error } = await query;
  if (error || !data) return [];

  let list = data.map(p => mapProject(p, lang));

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(p => 
      p.title.toLowerCase().includes(q) || 
      p.description.toLowerCase().includes(q) || 
      p.tools.some(t => t.toLowerCase().includes(q))
    );
  }

  return list;
}

export async function upvoteProject(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.warn('Cannot upvote: User is not authenticated');
    return 0;
  }

  // Attempt to insert join table row (toggle pattern)
  const { error } = await supabase.from('showcase_upvotes').insert({
    user_id: user.id,
    project_id: id,
  });

  if (error && error.code === '23505') {
    // Unique violation constraint -> user already upvoted -> toggle it off (delete it)
    await supabase
      .from('showcase_upvotes')
      .delete()
      .eq('user_id', user.id)
      .eq('project_id', id);
  }

  // Query updated count
  const { data } = await supabasePublic
    .from('showcase')
    .select('upvotes')
    .eq('id', id)
    .single();

  return data?.upvotes || 0;
}

export async function getThreads(category?: string, lang: 'da' | 'en' = 'da') {
  let query = supabasePublic.from('forum_threads').select('*').order('upvotes', { ascending: false });
  
  if (category && category !== "All") {
    query = query.eq('category', category);
  }

  const { data: threads, error: threadErr } = await query;
  if (threadErr || !threads) return [];

  const { data: replies, error: replyErr } = await supabasePublic.from('forum_replies').select('*').order('created_at', { ascending: true });
  if (replyErr) return [];

  return threads.map(t => {
    const threadReplies = (replies || []).filter(r => r.thread_id === t.id);
    return mapThread(t, threadReplies, lang);
  });
}

export async function upvoteThread(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.warn('Cannot upvote thread: User is not authenticated');
    return 0;
  }

  const { error } = await supabase.from('thread_upvotes').insert({
    user_id: user.id,
    thread_id: id,
  });

  if (error && error.code === '23505') {
    await supabase
      .from('thread_upvotes')
      .delete()
      .eq('user_id', user.id)
      .eq('thread_id', id);
  }

  const { data } = await supabasePublic
    .from('forum_threads')
    .select('upvotes')
    .eq('id', id)
    .single();

  return data?.upvotes || 0;
}

export async function createThread(title: string, author: string, category: ForumThread["category"], content: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const newId = 't_' + Date.now();
  const { data, error } = await supabase.from('forum_threads').insert({
    id: newId,
    title_da: title,
    title_en: title,
    author,
    category,
    content_da: content,
    content_en: content,
    upvotes: 1,
    user_id: user?.id || null,
  }).select().single();

  if (error || !data) {
    console.error('Failed to create thread:', error);
    throw new Error('Kunne ikke oprette tråd');
  }

  return mapThread(data, [], 'da');
}

export async function addReply(threadId: string, author: string, content: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const newId = 'r_' + Date.now();
  const { error } = await supabase.from('forum_replies').insert({
    id: newId,
    thread_id: threadId,
    author,
    content_da: content,
    content_en: content,
    user_id: user?.id || null,
  });

  if (error) {
    console.error('Failed to create reply:', error);
    return null;
  }

  // Return the parent thread populated with all replies
  const { data: thread } = await supabasePublic.from('forum_threads').select('*').eq('id', threadId).single();
  const { data: replies } = await supabasePublic.from('forum_replies').select('*').eq('thread_id', threadId).order('created_at', { ascending: true });

  if (!thread) return null;
  return mapThread(thread, replies || [], 'da');
}

export async function getBlogPosts(lang: 'da' | 'en' = 'da') {
  const { data, error } = await supabasePublic.from('blog_posts').select('*');
  if (error || !data) return [];
  return data.map(b => mapBlogPost(b, lang));
}

export async function getBlogPostById(id: string, lang: 'da' | 'en' = 'da') {
  const { data, error } = await supabasePublic.from('blog_posts').select('*').eq('id', id).single();
  if (error || !data) return null;
  return mapBlogPost(data, lang);
}

export async function getAgents(search?: string, category?: string, lang: 'da' | 'en' = 'da') {
  let query = supabasePublic.from('agents').select('*').order('upvotes', { ascending: false });

  if (category && category !== "All") {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  let list = data.map(a => mapAgent(a, lang));

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(a => 
      a.name.toLowerCase().includes(q) || 
      a.description.toLowerCase().includes(q) || 
      a.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  return list;
}

export async function upvoteAgent(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.warn('Cannot upvote agent: User is not authenticated');
    return 0;
  }

  const { error } = await supabase.from('agent_upvotes').insert({
    user_id: user.id,
    agent_id: id,
  });

  if (error && error.code === '23505') {
    await supabase
      .from('agent_upvotes')
      .delete()
      .eq('user_id', user.id)
      .eq('agent_id', id);
  }

  const { data } = await supabasePublic
    .from('agents')
    .select('upvotes')
    .eq('id', id)
    .single();

  return data?.upvotes || 0;
}

export async function createProject(title: string, author: string, description: string, tools: string[], prompts: string[], demoUrl: string, githubUrl?: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const newId = 'p_' + Date.now();
  const { data, error } = await supabase.from('showcase').insert({
    id: newId,
    title_da: title,
    title_en: title,
    author,
    description_da: description,
    description_en: description,
    tools,
    prompts,
    upvotes: 1,
    demo_url: demoUrl,
    github_url: githubUrl,
    image_url: '/images/autonewsletter.jpg',
    user_id: user?.id || null,
  }).select().single();

  if (error || !data) {
    console.error('Failed to create project:', error);
    throw new Error('Kunne ikke oprette projekt');
  }

  return mapProject(data, 'da');
}

export async function createSkill(title: string, vibeCoder: string, description: string, category: Skill["category"], tags: string[], githubUrl?: string) {
  const supabase = await createSupabaseServerClient();

  const newId = 's_' + Date.now();
  const { data, error } = await supabase.from('skills').insert({
    id: newId,
    title_da: title,
    title_en: title,
    vibe_coder: vibeCoder,
    vibe_coder_title_da: 'Community-bidragyder',
    vibe_coder_title_en: 'Community Contributor',
    rating: 5.0,
    reviews_count: 0,
    description_da: description,
    description_en: description,
    category,
    tags,
    github_url: githubUrl,
  }).select().single();

  if (error || !data) {
    console.error('Failed to create skill:', error);
    throw new Error('Kunne ikke oprette skill');
  }

  return mapSkill(data, 'da');
}

export async function deleteProject(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('showcase').delete().eq('id', id).select('id');
  if (error) {
    console.error('Failed to delete project:', error);
    return false;
  }
  // RLS restricts deletes to the owner; an empty result means not found or not owned.
  return (data?.length ?? 0) > 0;
}

export async function deleteThread(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('forum_threads').delete().eq('id', id).select('id');
  if (error) {
    console.error('Failed to delete thread:', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function deleteReply(threadId: string, replyId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('forum_replies').delete().eq('id', replyId).select('id');
  if (error) {
    console.error('Failed to delete reply:', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function createAgent(name: string, developer: string, category: Agent["category"], description: string, installCommand: string, systemPrompt: string, tags: string[]) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const newId = 'a_' + Date.now();
  const { data, error } = await supabase.from('agents').insert({
    id: newId,
    name,
    developer,
    category,
    description_da: description,
    description_en: description,
    install_command: installCommand,
    system_prompt_da: systemPrompt,
    system_prompt_en: systemPrompt,
    upvotes: 1,
    tags,
    user_id: user?.id || null,
  }).select().single();

  if (error || !data) {
    console.error('Failed to create agent:', error);
    throw new Error('Kunne ikke oprette agent');
  }

  return mapAgent(data, 'da');
}

export async function deleteAgent(id: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('agents').delete().eq('id', id).select('id');
  if (error) {
    console.error('Failed to delete agent:', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
