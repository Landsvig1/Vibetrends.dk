import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Client } = pg;

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

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL must be set in your .env.local file.');
  process.exit(1);
}

const client = new Client({
  connectionString: databaseUrl,
});

const run = async () => {
  console.log('Connecting to PostgreSQL database...');
  await client.connect();
  console.log('Connected successfully.');

  // 1. Run Migrations directly from init_schema.sql
  console.log('Running SQL schema migration from supabase/migrations/20260618000000_init_schema.sql...');
  const schemaPath = path.join(process.cwd(), 'supabase/migrations/20260618000000_init_schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error(`ERROR: Schema file not found at ${schemaPath}`);
    process.exit(1);
  }
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  await client.query(schemaSql);
  console.log('Schema migration ran successfully.');

  // Truncate tables for a clean seeding run
  console.log('Truncating existing content tables (CASCADE)...');
  await client.query('TRUNCATE public.skills, public.vibes, public.forum_threads, public.forum_replies, public.blog_posts, public.agents CASCADE;');
  console.log('Tables truncated.');

  // 2. Read db.json
  const dbPath = path.join(process.cwd(), 'src/data/db.json');
  if (!fs.existsSync(dbPath)) {
    console.error(`ERROR: db.json file not found at ${dbPath}`);
    process.exit(1);
  }
  const rawData = fs.readFileSync(dbPath, 'utf-8');
  const db = JSON.parse(rawData);

  // 3. Seed Skills
  if (db.skills && db.skills.length > 0) {
    console.log(`Seeding ${db.skills.length} skills...`);
    for (const s of db.skills) {
      await client.query(
        `INSERT INTO public.skills (
          id, title_da, title_en, category, vibe_coder, vibe_coder_title_da, vibe_coder_title_en,
          rating, reviews_count, description_da, description_en, tags, github_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          s.id, s.title_da || '', s.title_en || '', s.category || '', s.vibeCoder || '',
          s.vibeCoderTitle_da || '', s.vibeCoderTitle_en || '', s.rating || 5.0, s.reviewsCount || 0,
          s.description_da || '', s.description_en || '', s.tags || [], s.githubUrl || null
        ]
      );
    }
    console.log('Skills seeded.');
  }

  // 4. Seed Showcase
  if (db.vibes && db.vibes.length > 0) {
    console.log(`Seeding ${db.vibes.length} projects...`);
    for (const p of db.vibes) {
      await client.query(
        `INSERT INTO public.vibes (
          id, title_da, title_en, author, description_da, description_en,
          tools, prompts, upvotes, demo_url, github_url, image_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          p.id, p.title_da || '', p.title_en || '', p.author || '', p.description_da || '', p.description_en || '',
          p.tools || [], p.prompts || [], p.upvotes || 1, p.demoUrl || null, p.githubUrl || null, p.imageUrl || ''
        ]
      );
    }
    console.log('Showcase projects seeded.');
  }

  // 5. Seed Forum Threads and Replies
  if (db.forum && db.forum.length > 0) {
    console.log(`Seeding ${db.forum.length} forum threads...`);
    for (const t of db.forum) {
      await client.query(
        `INSERT INTO public.forum_threads (
          id, title_da, title_en, author, category, content_da, content_en, upvotes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          t.id, t.title_da || '', t.title_en || '', t.author || '', t.category || '',
          t.content_da || '', t.content_en || '', t.upvotes || 1, t.createdAt || new Date()
        ]
      );

      if (t.replies && t.replies.length > 0) {
        for (const r of t.replies) {
          await client.query(
            `INSERT INTO public.forum_replies (
              id, thread_id, author, content_da, content_en, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              r.id, t.id, r.author, r.content_da || '', r.content_en || '', r.createdAt || new Date()
            ]
          );
        }
      }
    }
    console.log('Forum threads and replies seeded.');
  }

  // 6. Seed Blog Posts
  if (db.blog && db.blog.length > 0) {
    console.log(`Seeding ${db.blog.length} blog posts...`);
    for (const b of db.blog) {
      await client.query(
        `INSERT INTO public.blog_posts (
          id, title_da, title_en, excerpt_da, excerpt_en, content_da, content_en,
          author, read_time, published_at, image_url, category
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          b.id, b.title_da || '', b.title_en || '', b.excerpt_da || '', b.excerpt_en || '',
          b.content_da || '', b.content_en || '', b.author || '', b.readTime || '',
          b.publishedAt || '', b.imageUrl || '', b.category || ''
        ]
      );
    }
    console.log('Blog posts seeded.');
  }

  // 7. Seed Agents
  if (db.agents && db.agents.length > 0) {
    console.log(`Seeding ${db.agents.length} agents...`);
    for (const a of db.agents) {
      await client.query(
        `INSERT INTO public.agents (
          id, name, developer, category, description_da, description_en,
          install_command, system_prompt_da, system_prompt_en, upvotes, tags
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          a.id, a.name || '', a.developer || '', a.category || '', a.description_da || '', a.description_en || '',
          a.installCommand || '', a.systemPrompt_da || '', a.systemPrompt_en || '', a.upvotes || 1, a.tags || []
        ]
      );
    }
    console.log('Agents seeded.');
  }

  console.log('All tables migrated and seeded successfully.');
};

run()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await client.end();
  });
