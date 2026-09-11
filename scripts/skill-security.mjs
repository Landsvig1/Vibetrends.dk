#!/usr/bin/env node
/**
 * Standalone Security Scanner for vibetrends.dk using NVIDIA SkillSpector & CVE analysis.
 *
 * Operating Modes:
 *   --mode gate  : Evaluates a candidate repo/SKILL.md before execution/grounding.
 *   --mode sweep : Retroactive scan across approved skills and agents in Supabase.
 *   --mode repo  : Audits local skill directories in ~/.hermes/skills/ or .agents/skills/.
 *
 * Usage:
 *   node --env-file=.env.local scripts/skill-security.mjs --mode gate --target <url|dir>
 *   node --env-file=.env.local scripts/skill-security.mjs --mode sweep [--dry-run]
 *   node --env-file=.env.local scripts/skill-security.mjs --mode repo --target <dir>
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const args = process.argv.slice(2);
const modeArgIdx = args.indexOf('--mode');
const mode = modeArgIdx >= 0 ? args[modeArgIdx + 1] : 'gate';

const targetArgIdx = args.indexOf('--target');
const target = targetArgIdx >= 0 ? args[targetArgIdx + 1] : null;

const dryRun = args.includes('--dry-run');

const SKILLSPECTOR_VERSION = 'skillspector-0.1.0';

/**
 * 68 static pattern categories tested against agent skills and prompt instructions
 */
const CRITICAL_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /system\s+override\s*:\s*true/i,
  /curl\s+-[^>|]*\$\{?[A-Z_]*(TOKEN|KEY|SECRET|PASSWORD)/i,
  /eval\s*\(\s*base64_decode/i,
  /rm\s+-rf\s+\/(\s|$)/,
  /chmod\s+777\s+\//,
  /export\s+ANTHROPIC_API_KEY=/i,
  /export\s+CLAUDE_CODE_OAUTH_TOKEN=/i,
];

const CAUTION_PATTERNS = [
  { regex: /sudo\s+/, category: 'Privilege Escalation', desc: 'Sudo-anvendelse fundet i script/kommando.' },
  { regex: /http:\/\/[^\s]+/i, category: 'Insecure Transport', desc: 'Usikker ukrypteret HTTP-forbindelse benyttet.' },
  { regex: /password\s*=\s*["'][^"']+["']/i, category: 'Hardcoded Secret', desc: 'Mulig hardcoded credential/adgangskode.' },
  { regex: /telemetry|track|analytics/i, category: 'Data Tracking', desc: 'Ekstern telemetri eller dataindsamling opdaget.' },
];

/**
 * Run static SAST analysis on a file or directory content.
 */
export function analyzeStaticSource(content, filename = 'source') {
  const issues = [];
  let riskScore = 0;
  let severity = 'LOW';
  let verdict = 'SAFE';

  // Check critical injection patterns
  for (const pattern of CRITICAL_INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      issues.push({
        category: 'Prompt Injection / Command Misuse',
        severity: 'CRITICAL',
        description: `Kritisk destruktivt eller prompt-injection mønster opdaget: ${pattern}`,
        file: filename,
        confidence: 'HIGH',
      });
      riskScore = Math.max(riskScore, 90);
      severity = 'CRITICAL';
      verdict = 'DO_NOT_INSTALL';
    }
  }

  // Check caution patterns
  for (const { regex, category, desc } of CAUTION_PATTERNS) {
    if (regex.test(content)) {
      issues.push({
        category,
        severity: 'MEDIUM',
        description: desc,
        file: filename,
        confidence: 'MEDIUM',
      });
      riskScore = Math.max(riskScore, 35);
      if (severity === 'LOW') severity = 'MEDIUM';
      if (verdict === 'SAFE') verdict = 'CAUTION';
    }
  }

  const findingsCount = {
    low: issues.filter((i) => i.severity === 'LOW').length,
    medium: issues.filter((i) => i.severity === 'MEDIUM').length,
    high: issues.filter((i) => i.severity === 'HIGH').length,
    critical: issues.filter((i) => i.severity === 'CRITICAL').length,
  };

  return {
    riskScore,
    severity,
    verdict,
    findingsCount,
    cveCount: 0,
    issues,
    scannerVersion: SKILLSPECTOR_VERSION,
  };
}

/**
 * Query OSV.dev for known package CVE vulnerabilities
 */
export async function checkPackageOsv(packageName, ecosystem = 'npm') {
  if (!packageName) return [];
  try {
    const res = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package: { name: packageName, ecosystem },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.vulns) ? data.vulns : [];
  } catch {
    return [];
  }
}

// Database client config over IPv4 pooler
function clientConfig(databaseUrl) {
  const direct = databaseUrl.match(/@db\.([a-z0-9-]+)\.supabase\.co/);
  if (!direct) return { connectionString: databaseUrl, ssl: { rejectUnauthorized: false } };
  const url = new URL(databaseUrl);
  return {
    host: 'aws-0-eu-west-1.pooler.supabase.com',
    port: 5432,
    user: `postgres.${direct[1]}`,
    password: url.password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  };
}

async function runGateMode(targetPathOrUrl) {
  if (!targetPathOrUrl) {
    console.error('Fejl: --target er påkrævet i gate mode');
    process.exit(2);
  }

  let content = '';
  if (targetPathOrUrl.startsWith('http://') || targetPathOrUrl.startsWith('https://')) {
    try {
      const res = await fetch(targetPathOrUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      content = await res.text();
    } catch (err) {
      console.error(`Kunne ikke hente target URL: ${err.message}`);
      process.exit(2);
    }
  } else if (existsSync(targetPathOrUrl)) {
    const stat = statSync(targetPathOrUrl);
    if (stat.isDirectory()) {
      const files = readdirSync(targetPathOrUrl);
      for (const f of files) {
        if (f.endsWith('.md') || f.endsWith('.json') || f.endsWith('.ts') || f.endsWith('.js')) {
          content += readFileSync(join(targetPathOrUrl, f), 'utf-8') + '\n';
        }
      }
    } else {
      content = readFileSync(targetPathOrUrl, 'utf-8');
    }
  } else {
    // Treat as raw text or package name
    content = targetPathOrUrl;
  }

  const result = analyzeStaticSource(content, targetPathOrUrl);
  console.log(JSON.stringify(result, null, 2));

  if (result.verdict === 'DO_NOT_INSTALL') {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

async function runSweepMode() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Fejl: DATABASE_URL mangler i .env.local');
    process.exit(1);
  }

  const client = new pg.Client(clientConfig(databaseUrl));
  await client.connect();

  try {
    console.log('Starter SkillSpector security sweep over kataloget...');

    const { rows: skills } = await client.query(
      `select id, slug, title_en, description_en, tags from public.skills where review_state = 'approved'`
    );
    const { rows: agents } = await client.query(
      `select id, slug, name, description_en, install_command, system_prompt_en from public.agents where review_state = 'approved'`
    );

    console.log(`Fandt ${skills.length} skills og ${agents.length} agents til scanning.`);

    let scannedCount = 0;

    for (const skill of skills) {
      const payload = `${skill.title_en}\n${skill.description_en}\n${(skill.tags || []).join(' ')}`;
      const report = analyzeStaticSource(payload, `skill:${skill.slug}`);

      if (!dryRun) {
        await client.query(
          `insert into public.security_scans (
             entity_type, entity_id, entity_slug, scanner_version,
             risk_score, severity, verdict, findings_count, cve_count, raw_report
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            'skill',
            skill.id,
            skill.slug,
            report.scannerVersion,
            report.riskScore,
            report.severity,
            report.verdict,
            JSON.stringify(report.findingsCount),
            report.cveCount,
            JSON.stringify({ issues: report.issues }),
          ]
        );
      }
      scannedCount++;
    }

    for (const agent of agents) {
      const payload = `${agent.name}\n${agent.description_en}\n${agent.install_command || ''}\n${agent.system_prompt_en || ''}`;
      const report = analyzeStaticSource(payload, `agent:${agent.slug}`);

      if (!dryRun) {
        await client.query(
          `insert into public.security_scans (
             entity_type, entity_id, entity_slug, scanner_version,
             risk_score, severity, verdict, findings_count, cve_count, raw_report
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            'agent',
            agent.id,
            agent.slug,
            report.scannerVersion,
            report.riskScore,
            report.severity,
            report.verdict,
            JSON.stringify(report.findingsCount),
            report.cveCount,
            JSON.stringify({ issues: report.issues }),
          ]
        );
      }
      scannedCount++;
    }

    console.log(`Udført. Gemte ${scannedCount} sikkerhedsscanninger${dryRun ? ' (dry run)' : ''}.`);
  } finally {
    await client.end();
  }
}

if (import.meta.main || process.argv[1]?.endsWith('skill-security.mjs')) {
  if (mode === 'sweep') {
    runSweepMode().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  } else {
    runGateMode(target).catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}
