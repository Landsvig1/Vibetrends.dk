#!/usr/bin/env node
/**
 * CLI Runner for VibeTrends Analytics Dashboard Generation
 * Extracts telemetry, compiles HTML artifact, saves to disk, and outputs summary.
 */

import fs from 'fs';
import path from 'path';
import { fetchAllUserAnalytics } from './fetch-user-analytics.mjs';
import { renderDashboardHtml } from './lib/renderDashboardHtml.mjs';

// null means the previous period was unavailable (Vercel Hobby: 31 days).
function fmtDelta(d) {
  if (!d) return 'n/a';
  return `${d.percent >= 0 ? '+' : ''}${d.percent}%`;
}

async function main() {
  const args = process.argv.slice(2);
  let days = 30;
  
  for (const arg of args) {
    if (arg.startsWith('--days=')) {
      days = parseInt(arg.split('=')[1], 10) || 30;
    } else if (!isNaN(parseInt(arg, 10))) {
      days = parseInt(arg, 10);
    }
  }

  console.log(`\n🐨 VibeTrends Analytics — Indsamler telemetri for de seneste ${days} dage...`);
  
  const seo = !args.includes('--no-seo');
  const data = await fetchAllUserAnalytics(days, { seo });
  const html = renderDashboardHtml(data);

  // 1. Save to project output directory
  const outDir = path.join(process.cwd(), 'output');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const dateStr = new Date().toISOString().slice(0, 10);
  const outPath = path.join(outDir, `vibetrends-analytics-${dateStr}.html`);
  fs.writeFileSync(outPath, html, 'utf8');

  // 2. If running inside Antigravity agent context, also save to active brain artifact directory if found
  const appDataDir = process.env.ANTIGRAVITY_APP_DATA || path.join(process.env.HOME || '', '.gemini/antigravity-cli');
  const brainDir = path.join(appDataDir, 'brain');
  if (fs.existsSync(brainDir)) {
    try {
      const convos = fs.readdirSync(brainDir).filter(f => !f.startsWith('.'));
      if (convos.length > 0) {
        // Pick latest convo directory
        convos.sort((a, b) => {
          return fs.statSync(path.join(brainDir, b)).mtimeMs - fs.statSync(path.join(brainDir, a)).mtimeMs;
        });
        const activeConvo = convos[0];
        const artifactPath = path.join(brainDir, activeConvo, 'vibetrends_analytics_dashboard.html');
        fs.writeFileSync(artifactPath, html, 'utf8');
      }
    } catch {
      // Non-blocking
    }
  }

  const v = data.vercel?.totals || {};
  const g = data.gsc?.summary || {};
  const u = data.supabase?.users || {};
  const opps = data.gsc?.growthOpportunities || [];

  console.log(`\n======================================================`);
  console.log(`  VibeTrends.dk Analytics — Resume (${days} dage)`);
  console.log(`======================================================`);
  const users = u.byClass || {};
  const f = data.supabase?.funnel || {};
  console.log(`  Besøgende:       ${v.visitors || 0} (${fmtDelta(v.visitorsDelta)})`);
  console.log(`  Sidevisninger:   ${v.pageviews || 0} (${fmtDelta(v.pageviewsDelta)})`);
  console.log(`  Google Søge-Klik:${g.clicks || 0} (${fmtDelta(g.clicksDelta)})`);
  console.log(`  Google Visninger:${g.impressions || 0} (${fmtDelta(g.impressionsDelta)})`);
  console.log(`  Mennesker:       ${u.total || 0} eksterne (${u.current || 0} nye, ${u.returned || 0} vendt tilbage, aktive 7d/30d: ${u.active7d || 0}/${u.active30d || 0})`);
  console.log(`    agenter ${users.agent?.total || 0} (${users.agent?.current || 0} nye), ejer ${users.owner?.total || 0}`);
  if (!f.error && f.copySessions != null) {
    console.log(`  Kopi-sessioner:  ${f.copySessions} (${fmtDelta(f.copySessionsDelta)}), ${f.siteCopyRate == null ? 'n/a' : `${f.siteCopyRate}%`} af besøgende`);
    for (const r of (f.copyRateByPath || []).filter(r => r.copySessions > 0)) {
      console.log(`    ${r.path}: ${r.copySessions}/${r.visitors} (${r.rate == null ? 'n/a' : `${r.rate}%`})`);
    }
  }
  console.log(`  Vækstmuligheder: ${opps.length} identificerede søgeord`);

  const s = data.seo;
  if (s?.indexing) {
    console.log(`  Indeksering:     ${s.indexing.indexed}/${s.indexing.inspected} sider indekseret` +
      (s.indexing.notIndexed ? ` — ${s.indexing.notIndexed} kræver handling` : ''));
    if (s.sitemap?.registered && s.sitemap.drift) {
      console.log(`  Sitemap-afvig.:  ${s.sitemap.drift > 0 ? '+' : ''}${s.sitemap.drift} (live ${s.sitemap.liveUrlCount} vs GSC ${s.sitemap.submitted})`);
    }
    for (const pr of s.indexing.problems.slice(0, 5)) {
      console.log(`    ⚠ ${String(pr.url).replace('https://vibetrends.dk', '')} — ${pr.coverageState}`);
    }
  } else if (s?.error) {
    console.log(`  Indeksering:     utilgængelig (${s.error})`);
  }
  console.log(`------------------------------------------------------`);
  console.log(`  Interaktiv HTML-rapport genereret:`);
  console.log(`  file://${outPath}`);
  console.log(`======================================================\n`);
}

main().catch(err => {
  console.error('Analytics generation failed:', err);
  process.exit(1);
});
