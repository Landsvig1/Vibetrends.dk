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

  // review_state = 'approved' on the three catalog tables: this file is a
  // PUBLIC read surface (public/ai.txt advertises it as the TREND_ANALYSIS
  // target), and it is generated at build time, so a submission sitting in the
  // review queue during a deploy would otherwise have its title, id and tags
  // baked into the shipped index — while every other surface correctly hides
  // it. Duplicated from src/lib/reviewGate.ts rather than imported because
  // this is a CommonJS build script that runs before next build; if the gate
  // list there changes, change it here too.
  //
  // forum_threads is deliberately unfiltered, matching FORUM_GATE_ENABLED =
  // false. It is only counted here, never named.
  const [skills, showcase, agents, threads] = await Promise.all([
    supabase.from('skills').select('id, title_da, tags').eq('review_state', 'approved'),
    // `showcase` was renamed to `vibes` (src/scripts/migrate-rename-showcase-to-vibes.mjs);
    // querying the old name made this fail — and bail out entirely — on
    // every single build.
    supabase.from('vibes').select('id, title_da, tools').eq('review_state', 'approved'),
    supabase.from('agents').select('id, name, tags, category').eq('review_state', 'approved'),
    supabase.from('forum_threads').select('id'),
  ]);

  const fetchError = skills.error || showcase.error || agents.error || threads.error;
  if (fetchError) {
    console.warn('Supabase fetch failed, skipping semantic index generation:', fetchError.message);
    return;
  }

  // Exclude e2e fixture rows (scripts/seed-e2e-fixtures.mjs) — short-lived,
  // must never surface in the shipped semantic index.
  const isFixture = (id) => typeof id === 'string' && id.startsWith('e2e-fixture-');

  // Every list is filtered, not just agents/threads. skills and vibes were
  // omitted here, so a build landing inside a CI seed window shipped fixture
  // skills and vibes in the public index — the same leak the agents/threads
  // filters were added to prevent.
  const s = (skills.data || []).filter((x) => !isFixture(x.id));
  const p = (showcase.data || []).filter((x) => !isFixture(x.id));
  const a = (agents.data || []).filter((x) => !isFixture(x.id));
  const t = (threads.data || []).filter((x) => !isFixture(x.id));

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
