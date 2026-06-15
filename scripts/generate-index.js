const fs = require('fs');
const path = require('path');

function generateIndex() {
  const dbPath = path.join(process.cwd(), 'src/data/db.json');
  if (!fs.existsSync(dbPath)) {
    console.warn('db.json not found, skipping semantic index generation');
    return;
  }

  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  
  const index = {
    generatedAt: new Date().toISOString(),
    summary: {
      skills_count: db.skills.length,
      showcase_count: db.showcase.length,
      agents_count: db.agents.length,
      forum_threads_count: db.forum.length
    },
    top_keywords: Array.from(new Set([
      ...db.skills.flatMap(s => s.tags),
      ...db.showcase.flatMap(p => p.tools),
      ...db.agents.flatMap(a => a.tags)
    ])).slice(0, 50),
    entities: [
      ...db.skills.map(s => ({ type: 'skill', name: s.title, id: s.id })),
      ...db.showcase.map(p => ({ type: 'project', name: p.title, id: p.id })),
      ...db.agents.map(a => ({ type: 'agent', name: a.name, id: a.id }))
    ]
  };

  const outputPath = path.join(process.cwd(), 'public/semantic-index.json');
  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2));
  console.log('Successfully generated public/semantic-index.json');
}

generateIndex();
