/* eslint-disable */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Builds public/semantic-index.json from the live Supabase data at build time.
// Never throws: if env vars are missing or the fetch fails, it logs and skips
// so the build is not blocked (the previously committed index stays in place).
async function generateIndex() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn('Supabase env vars not set, skipping semantic index generation');
    return;
  }

  const supabase = createClient(url, key);

  const [skills, showcase, agents, threads] = await Promise.all([
    supabase.from('skills').select('id, title_da, tags'),
    supabase.from('showcase').select('id, title_da, tools'),
    supabase.from('agents').select('id, name, tags, category'),
    supabase.from('forum_threads').select('id'),
  ]);

  const fetchError = skills.error || showcase.error || agents.error || threads.error;
  if (fetchError) {
    console.warn('Supabase fetch failed, skipping semantic index generation:', fetchError.message);
    return;
  }

  const s = skills.data || [];
  const p = showcase.data || [];
  const a = agents.data || [];
  const t = threads.data || [];

  // The agents table now carries the feed-vs-host taxonomy. Feed types are
  // surfaced; hosts (connection targets, not catalog items) are excluded.
  const clis = a.filter((x) => x.category === 'CLI');
  const mcpServers = a.filter((x) => x.category === 'MCP Server');

  const index = {
    generatedAt: new Date().toISOString(),
    summary: {
      skills_count: s.length,
      showcase_count: p.length,
      cli_count: clis.length,
      mcp_servers_count: mcpServers.length,
      forum_threads_count: t.length,
    },
    top_keywords: Array.from(new Set([
      ...s.flatMap((x) => x.tags || []),
      ...p.flatMap((x) => x.tools || []),
      ...clis.flatMap((x) => x.tags || []),
      ...mcpServers.flatMap((x) => x.tags || []),
    ])).slice(0, 50),
    entities: [
      ...s.map((x) => ({ type: 'skill', name: x.title_da, id: x.id })),
      ...p.map((x) => ({ type: 'project', name: x.title_da, id: x.id })),
      ...clis.map((x) => ({ type: 'cli', name: x.name, id: x.id })),
      ...mcpServers.map((x) => ({ type: 'mcp-server', name: x.name, id: x.id })),
    ],
  };

  const outputPath = path.join(process.cwd(), 'public/semantic-index.json');
  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2));
  console.log('Successfully generated public/semantic-index.json from Supabase');
}

generateIndex().catch((e) => {
  console.warn('Semantic index generation error, skipping:', e.message);
});
