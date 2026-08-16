#!/usr/bin/env node
/**
 * CLI Runner for VibeTrends Analytics Dashboard Generation
 * Extracts telemetry, compiles HTML artifact, saves to disk, and outputs summary.
 */

import fs from 'fs';
import path from 'path';
import { fetchAllUserAnalytics } from './fetch-user-analytics.mjs';
import { renderDashboardHtml } from './lib/renderDashboardHtml.mjs';

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
  
  const data = await fetchAllUserAnalytics(days);
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
  console.log(`  Besøgende:       ${v.visitors || 0} (${v.visitorsDelta?.percent >= 0 ? '+' : ''}${v.visitorsDelta?.percent || 0}%)`);
  console.log(`  Sidevisninger:   ${v.pageviews || 0} (${v.pageviewsDelta?.percent >= 0 ? '+' : ''}${v.pageviewsDelta?.percent || 0}%)`);
  console.log(`  Google Søge-Klik:${g.clicks || 0} (${g.clicksDelta?.percent >= 0 ? '+' : ''}${g.clicksDelta?.percent || 0}%)`);
  console.log(`  Google Visninger:${g.impressions || 0} (${g.impressionsDelta?.percent >= 0 ? '+' : ''}${g.impressionsDelta?.percent || 0}%)`);
  console.log(`  Nye Brugere:     ${u.current || 0} (Totalt: ${u.total || 0})`);
  console.log(`  Vækstmuligheder: ${opps.length} identificerede søgeord`);
  console.log(`------------------------------------------------------`);
  console.log(`  Interaktiv HTML-rapport genereret:`);
  console.log(`  file://${outPath}`);
  console.log(`======================================================\n`);
}

main().catch(err => {
  console.error('Analytics generation failed:', err);
  process.exit(1);
});
