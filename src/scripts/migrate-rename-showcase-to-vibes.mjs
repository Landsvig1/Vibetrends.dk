import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

const loadEnv = (filePath) => {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let value = match[2] || '';
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[match[1]] = value;
      }
    }
  }
};

loadEnv(path.join(process.cwd(), '.env'));
loadEnv(path.join(process.cwd(), '.env.local'));

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

await client.query('BEGIN');

// Rename showcase → vibes (idempotent: only if showcase exists and vibes doesn't)
await client.query(`
  DO $$ BEGIN
    IF EXISTS (
      SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'showcase'
    ) AND NOT EXISTS (
      SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vibes'
    ) THEN
      ALTER TABLE public.showcase RENAME TO vibes;
      RAISE NOTICE 'Renamed showcase → vibes';
    ELSE
      RAISE NOTICE 'Skipped showcase rename (already done or table missing)';
    END IF;
  END $$;
`);

// Rename showcase_upvotes → vibes_upvotes (idempotent)
await client.query(`
  DO $$ BEGIN
    IF EXISTS (
      SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'showcase_upvotes'
    ) AND NOT EXISTS (
      SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vibes_upvotes'
    ) THEN
      ALTER TABLE public.showcase_upvotes RENAME TO vibes_upvotes;
      RAISE NOTICE 'Renamed showcase_upvotes → vibes_upvotes';
    ELSE
      RAISE NOTICE 'Skipped showcase_upvotes rename (already done or table missing)';
    END IF;
  END $$;
`);

// Update trigger functions to reference public.vibes instead of public.showcase
await client.query(`
  CREATE OR REPLACE FUNCTION public.increment_project_upvotes()
  RETURNS TRIGGER AS $$
  BEGIN
    UPDATE public.vibes SET upvotes = upvotes + 1 WHERE id = NEW.project_id;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
`);

await client.query(`
  CREATE OR REPLACE FUNCTION public.decrement_project_upvotes()
  RETURNS TRIGGER AS $$
  BEGIN
    UPDATE public.vibes SET upvotes = upvotes - 1 WHERE id = OLD.project_id;
    RETURN OLD;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
`);

await client.query('COMMIT');
await client.end();

console.log('Migration complete: showcase → vibes, showcase_upvotes → vibes_upvotes');
