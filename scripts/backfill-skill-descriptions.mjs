#!/usr/bin/env node
import pg from 'pg';
import { fetchUpstreamSkillDescription } from './scan-hot-skills.mjs';
import { isPureLlmSkill } from '../src/lib/hotMerge.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('ERROR: DATABASE_URL must be set.');
  process.exit(1);
}

function clientConfig(urlStr) {
  const url = new URL(urlStr);
  const direct = urlStr.match(/@db\.([a-z0-9-]+)\.supabase\.co/);
  if (direct) {
    return {
      host: 'aws-0-eu-west-1.pooler.supabase.com',
      port: 5432,
      user: `postgres.${direct[1]}`,
      password: url.password,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
    };
  }
  return { connectionString: urlStr, ssl: { rejectUnauthorized: false } };
}

async function main() {
  const client = new pg.Client(clientConfig(databaseUrl));
  await client.connect();

  try {
    // 1. Find all skills in the database
    const { rows: skills } = await client.query(`
      select id, slug, title_en, github_url, source, description_en, review_state
      from public.skills
    `);

    console.log(`Found ${skills.length} total skills in database.`);

    for (const skill of skills) {
      // If it's not a pure LLM skill and was a provisional new skill, delete it
      const repo = skill.github_url ? skill.github_url.replace('https://github.com/', '') : null;
      if (!isPureLlmSkill({ slug: skill.slug, repo, url: skill.source, title: skill.title_en })) {
        console.log(`Removing non-LLM tool: ${skill.slug} (${skill.id})`);
        await client.query(
          `delete from public.skill_hot_rankings where skill_id = $1`,
          [skill.id]
        );
        if (skill.id.startsWith('s_178690')) {
          await client.query(`delete from public.skills where id = $1`, [skill.id]);
        } else {
          await client.query(`update public.skills set review_state = 'pending' where id = $1`, [skill.id]);
        }
        continue;
      }

      // If it has a placeholder description, fetch real upstream description
      if (skill.description_en && skill.description_en.startsWith('Trending AI skill for')) {
        console.log(`Fetching authentic description for: ${skill.slug} (repo: ${repo})`);
        const realDesc = await fetchUpstreamSkillDescription(
          repo,
          skill.slug,
          skill.title_en
        );
        console.log(`  -> ${realDesc.slice(0, 80)}...`);
        await client.query(
          `update public.skills set description_en = $1 where id = $2`,
          [realDesc, skill.id]
        );
      }
    }

    console.log('Finished backfilling skill descriptions and cleaning non-LLM tools.');
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
