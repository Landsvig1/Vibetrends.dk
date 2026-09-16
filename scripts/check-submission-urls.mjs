#!/usr/bin/env node
/**
 * Fails when a submission manifest's source URLs do not resolve.
 *
 * This exists because three entries with fabricated source URLs went public on
 * 2026-08-30 (PRs #152, #160, #161). All three pointed at
 * `github.com/Landsvig1/vibetrends-dk/tree/main/.agents/skills/<name>`, a path
 * the content loop invented: the repo slug is `Vibetrends.dk`, and
 * `.agents/skills/` never held those directories. The reviewing agent had a
 * "source URL must resolve" criterion and never reached it, because an
 * already-live fast path ran first. A criterion that only a reviewer applies is
 * a criterion that gets skipped; this one is machinery, so it runs regardless
 * of who or what is doing the merging.
 *
 * Usage: node scripts/check-submission-urls.mjs <manifest.md> [...]
 * Exit 0 = every checked URL resolved. Exit 1 = at least one did not.
 */

// Labels rendered by renderManifest in scripts/review-queue.mjs that carry a
// URL a reader would follow to verify the entry is real. `Billede` (image_url)
// is deliberately included: a catalog card pointing at a dead image is the same
// class of defect. Keep in sync with the TABLES field lists there.
const URL_LABELS = new Set(['Kilde', 'GitHub', 'Demo', 'Billede']);

// renderManifest emits `_(tom)_` for null/empty. A missing optional URL is not
// a defect — a *wrong* one is.
const EMPTY = '_(tom)_';

import { pathToFileURL } from 'node:url';

const TIMEOUT_MS = 15000;
const RETRIES = 2;

/**
 * Hosts whose human-facing page sits behind a bot challenge but which expose an
 * unauthenticated API that is the actual source of truth. Probing the API
 * answers the only question this check asks — does the thing the manifest
 * points at exist — without fighting Cloudflare.
 *
 * npmjs.com is the case that forced this: it 403s every verb and every
 * user-agent, so `npmjs.com/package/mcp-danish-cvr` read as dead on PR #184
 * while `npm view mcp-danish-cvr` returned 0.1.0. Half this catalog is
 * npm-installable tooling, so that is a large class of false rejects.
 */
const API_EQUIVALENTS = [
  {
    match: /^(?:www\.)?npmjs\.com$/,
    rewrite: (u) => {
      // /package/<name> and /package/@scope/<name>
      const m = u.pathname.match(/^\/package\/(.+?)\/?$/);
      return m ? `https://registry.npmjs.org/${m[1]}` : null;
    },
  },
  {
    match: /^(?:www\.)?pypi\.org$/,
    rewrite: (u) => {
      const m = u.pathname.match(/^\/project\/([^/]+)\/?$/);
      return m ? `https://pypi.org/pypi/${m[1]}/json` : null;
    },
  },
];

export function apiEquivalent(url) {
  try {
    const u = new URL(url);
    for (const { match, rewrite } of API_EQUIVALENTS) {
      if (match.test(u.hostname)) return rewrite(u);
    }
  } catch {
    /* handled by probe */
  }
  return null;
}

/** Pull `- **Label:** value` bullets out of a manifest body. */
export function parseManifestUrls(markdown) {
  const found = [];
  for (const line of markdown.split('\n')) {
    const m = /^- \*\*([^:*]+):\*\* (.+)$/.exec(line.trim());
    if (!m) continue;
    const [, label, rawValue] = m;
    if (!URL_LABELS.has(label)) continue;
    const value = rawValue.trim();
    if (value === EMPTY || value === '') continue;
    found.push({ label, url: value });
  }
  return found;
}

/**
 * HEAD first, then GET on anything that is not a clean 2xx. Plenty of hosts
 * (GitHub raw, S3 fronts, some CDNs) answer HEAD with 403/405 while serving the
 * same URL fine over GET, and a false reject here blocks a legitimate
 * submission. GitHub's 404 page answers both verbs with 404, so the case this
 * check exists for is still caught.
 */
async function probe(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, detail: 'not a valid URL' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, detail: `unsupported protocol ${parsed.protocol}` };
  }

  // Ask the API instead of the bot-challenged page, when one is known.
  const api = apiEquivalent(url);
  if (api) {
    const viaApi = await rawProbe(api);
    if (viaApi.ok) return { ok: true, detail: `${viaApi.detail} via ${new URL(api).host}` };
    if (viaApi.status === 404) {
      return { ok: false, detail: `${new URL(api).host} has no such package (404)` };
    }
    // API unreachable for some other reason — fall through and try the page.
  }

  const page = await rawProbe(url);
  if (page.ok) return { ok: true, detail: page.detail };

  // 403 is "I am not allowed to look", not "it does not exist". Cloudflare and
  // friends serve it to any unattended client, so treating it as a reject makes
  // the gate fail honest submissions. Report it and let a human look.
  //
  // This does NOT weaken criterion 4's "private" clause for the host that
  // matters: GitHub answers 404, not 403, for a private or non-existent repo
  // (it refuses to leak which), so a private GitHub source is still a hard
  // fail below.
  if (page.status === 403) {
    return { ok: false, inconclusive: true, detail: `${page.detail} — blocked, not proven dead` };
  }
  return { ok: false, detail: page.detail };
}

/** One URL, HEAD then GET, with retries. Reports the last status seen. */
async function rawProbe(url) {
  let last = 'no response';
  let status = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    for (const method of ['HEAD', 'GET']) {
      try {
        const res = await fetch(url, {
          method,
          redirect: 'follow',
          signal: AbortSignal.timeout(TIMEOUT_MS),
          // Some hosts 403 an unknown agent. Identify honestly.
          headers: { 'user-agent': 'vibetrends-submission-url-check (+https://vibetrends.dk)' },
        });
        if (res.ok) return { ok: true, status: res.status, detail: `${res.status} via ${method}` };
        last = `HTTP ${res.status} via ${method}`;
        status = res.status;
        // A 4xx is a verdict, not a flake — no point retrying it. 429/408 and
        // 5xx are transient, so fall through to the next attempt.
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          if (method === 'GET') return { ok: false, status: res.status, detail: last };
          continue;
        }
      } catch (err) {
        last = err?.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS}ms` : String(err?.message ?? err);
        status = null;
      }
    }
    if (attempt < RETRIES) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  return { ok: false, status, detail: last };
}

async function main() {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.log('No submission manifests to check.');
    return 0;
  }

  const { readFile } = await import('node:fs/promises');
  let failures = 0;
  let warnings = 0;
  let checked = 0;

  for (const file of files) {
    const body = await readFile(file, 'utf8');
    const urls = parseManifestUrls(body);
    console.log(`\n${file}: ${urls.length} URL(s) to check`);
    if (urls.length === 0) {
      // Every table's field list carries at least one URL column, so zero
      // resolvable URLs means the submitter left them all blank. That is a
      // judgement call for a human reviewer, not a hard fail.
      console.log('  · no source URLs in this manifest — nothing to verify');
      continue;
    }
    for (const { label, url } of urls) {
      const { ok, inconclusive, detail } = await probe(url);
      checked++;
      if (ok) {
        console.log(`  ✓ ${label}: ${url} (${detail})`);
      } else if (inconclusive) {
        warnings++;
        console.log(`  ? ${label}: ${url} — ${detail}`);
        console.log(`::warning file=${file}::${label} URL could not be verified automatically: ${url} (${detail}). Open it by hand before approving.`);
      } else {
        failures++;
        console.log(`  ✗ ${label}: ${url} — ${detail}`);
        console.log(`::error file=${file}::${label} URL does not resolve: ${url} (${detail})`);
      }
    }
  }

  console.log(`\nChecked ${checked} URL(s); ${failures} did not resolve, ${warnings} could not be verified.`);
  if (warnings > 0 && failures === 0) {
    console.log('::notice::Some URLs answered 403 (blocked, not proven dead). The check passes, but open them by hand before approving.');
  }
  if (failures > 0) {
    console.log('::error::A submission manifest points at a URL that does not resolve. A catalog whose pitch is curation cannot carry fabricated source links — reject the submission, or correct the URL at the source row.');
    return 1;
  }
  return 0;
}

// Only run when invoked directly, so the parser stays unit-testable.
// pathToFileURL, not a `file://` template: import.meta.url percent-encodes the
// path, so a bare interpolation never matches when any parent directory has a
// space in it and the script silently does nothing. CI paths have no spaces,
// so this only ever failed on a developer's machine.
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(`::error::check-submission-urls crashed: ${err?.stack ?? err}`);
    process.exit(1);
  });
}
