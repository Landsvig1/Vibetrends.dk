import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env and .env.local
const envLocalPath = path.join(process.cwd(), '.env.local');
const envPath = path.join(process.cwd(), '.env');

const loadEnv = (filePath) => {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    lines.forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        // Remove surrounding quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    });
  }
};

loadEnv(envPath);
loadEnv(envLocalPath);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env or .env.local file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const migrate = async () => {
  console.log('Starting migration from src/data/db.json to live Supabase...');

  const dbPath = path.join(process.cwd(), 'src/data/db.json');
  if (!fs.existsSync(dbPath)) {
    console.error(`ERROR: Database file not found at ${dbPath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(dbPath, 'utf-8');
  const db = JSON.parse(rawData);

  // 1. Migrate Skills
  if (db.skills && db.skills.length > 0) {
    console.log(`Migrating ${db.skills.length} skills...`);
    const skillsToInsert = db.skills.map((s) => ({
      id: s.id,
      title_da: s.title_da || '',
      title_en: s.title_en || '',
      category: s.category || '',
      vibe_coder: s.vibeCoder || '',
      vibe_coder_title_da: s.vibeCoderTitle_da || '',
      vibe_coder_title_en: s.vibeCoderTitle_en || '',
      rating: s.rating || 5.0,
      reviews_count: s.reviewsCount || 0,
      description_da: s.description_da || '',
      description_en: s.description_en || '',
      tags: s.tags || [],
      github_url: s.githubUrl || null,
    }));

    const { error } = await supabase.from('skills').upsert(skillsToInsert);
    if (error) {
      console.error('Failed to migrate skills:', error);
    } else {
      console.log('Successfully migrated skills.');
    }
  }

  // 2. Migrate Showcase
  if (db.vibes && db.vibes.length > 0) {
    console.log(`Migrating ${db.vibes.length} showcase projects...`);
    const showcaseToInsert = db.vibes.map((p) => ({
      id: p.id,
      title_da: p.title_da || '',
      title_en: p.title_en || '',
      author: p.author || '',
      description_da: p.description_da || '',
      description_en: p.description_en || '',
      tools: p.tools || [],
      prompts: p.prompts || [],
      upvotes: p.upvotes || 1,
      demo_url: p.demoUrl || null,
      github_url: p.githubUrl || null,
      image_url: p.imageUrl || '/images/autonewsletter.jpg',
    }));

    const { error } = await supabase.from('vibes').upsert(showcaseToInsert);
    if (error) {
      console.error('Failed to migrate showcase:', error);
    } else {
      console.log('Successfully migrated showcase projects.');
    }
  }

  // 3. Migrate Forum Threads & Replies
  if (db.forum && db.forum.length > 0) {
    console.log(`Migrating ${db.forum.length} forum threads...`);
    const threadsToInsert = db.forum.map((t) => ({
      id: t.id,
      title_da: t.title_da || '',
      title_en: t.title_en || '',
      author: t.author || '',
      category: t.category || '',
      content_da: t.content_da || '',
      content_en: t.content_en || '',
      upvotes: t.upvotes || 1,
      created_at: t.createdAt || new Date().toISOString(),
    }));

    const { error: threadError } = await supabase.from('forum_threads').upsert(threadsToInsert);
    if (threadError) {
      console.error('Failed to migrate forum threads:', threadError);
    } else {
      console.log('Successfully migrated forum threads.');

      // Extract and insert replies
      const repliesToInsert = [];
      db.forum.forEach((t) => {
        if (t.replies && t.replies.length > 0) {
          t.replies.forEach((r) => {
            repliesToInsert.push({
              id: r.id,
              thread_id: t.id,
              author: r.author,
              content_da: r.content_da || '',
              content_en: r.content_en || '',
              created_at: r.createdAt || new Date().toISOString(),
            });
          });
        }
      });

      if (repliesToInsert.length > 0) {
        console.log(`Migrating ${repliesToInsert.length} forum replies...`);
        const { error: replyError } = await supabase.from('forum_replies').upsert(repliesToInsert);
        if (replyError) {
          console.error('Failed to migrate forum replies:', replyError);
        } else {
          console.log('Successfully migrated forum replies.');
        }
      }
    }
  }

  // 4. Migrate Blog Posts
  if (db.blog && db.blog.length > 0) {
    console.log(`Migrating ${db.blog.length} blog posts...`);
    const blogToInsert = db.blog.map((b) => ({
      id: b.id,
      title_da: b.title_da || '',
      title_en: b.title_en || '',
      excerpt_da: b.excerpt_da || '',
      excerpt_en: b.excerpt_en || '',
      content_da: b.content_da || '',
      content_en: b.content_en || '',
      author: b.author || '',
      read_time: b.readTime || '',
      published_at: b.publishedAt || '',
      image_url: b.imageUrl || '',
      category: b.category || '',
    }));

    const { error } = await supabase.from('blog_posts').upsert(blogToInsert);
    if (error) {
      console.error('Failed to migrate blog posts:', error);
    } else {
      console.log('Successfully migrated blog posts.');
    }
  }

  // 5. Migrate Agents
  if (db.agents && db.agents.length > 0) {
    console.log(`Migrating ${db.agents.length} agents...`);
    const agentsToInsert = db.agents.map((a) => ({
      id: a.id,
      name: a.name || '',
      developer: a.developer || '',
      category: a.category || '',
      description_da: a.description_da || '',
      description_en: a.description_en || '',
      install_command: a.installCommand || '',
      system_prompt_da: a.systemPrompt_da || '',
      system_prompt_en: a.systemPrompt_en || '',
      upvotes: a.upvotes || 1,
      tags: a.tags || [],
    }));

    const { error } = await supabase.from('agents').upsert(agentsToInsert);
    if (error) {
      console.error('Failed to migrate agents:', error);
    } else {
      console.log('Successfully migrated agents.');
    }
  }

  console.log('Migration completed.');
};

migrate().catch((err) => {
  console.error('Unhandled migration error:', err);
  process.exit(1);
});
