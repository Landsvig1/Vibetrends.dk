import { describe, it, expect } from 'vitest';
import { parseManifestUrls, apiEquivalent, parseInstallTarget, parseManifestInstall } from '../check-submission-urls.mjs';

// The exact bullet shape renderManifest (scripts/review-queue.mjs) emits. If
// that formatting changes, these tests are what tells you the URL check went
// blind rather than the check silently passing everything.
const skillManifest = `# Skill: bot-pr-review

- **Tabel:** \`skills\`
- **ID:** \`s_1786946931027\`

## Indhold

- **Titel:** bot-pr-review
- **Kategori:** agent-methodology
- **Tags:** \`pr-review\`, \`gh-cli\`
- **GitHub:** https://github.com/Landsvig1/vibetrends-dk/tree/main/.agents/skills/bot-pr-review
- **Kilde:** https://github.com/Landsvig1/vibetrends-dk/tree/main/.agents/skills/bot-pr-review
- **Slug:** bot-pr-review
`;

describe('parseManifestUrls', () => {
  it('extracts the URL-bearing labels and nothing else', () => {
    expect(parseManifestUrls(skillManifest)).toEqual([
      { label: 'GitHub', url: 'https://github.com/Landsvig1/vibetrends-dk/tree/main/.agents/skills/bot-pr-review' },
      { label: 'Kilde', url: 'https://github.com/Landsvig1/vibetrends-dk/tree/main/.agents/skills/bot-pr-review' },
    ]);
  });

  it('ignores non-URL bullets that would otherwise parse', () => {
    const labels = parseManifestUrls(skillManifest).map((u) => u.label);
    expect(labels).not.toContain('Titel');
    expect(labels).not.toContain('Slug');
    expect(labels).not.toContain('Tags');
  });

  it('skips the empty marker, so an omitted optional URL is not a failure', () => {
    // renderManifest writes `_(tom)_` for null. Treating that as a URL would
    // fail every vibe without a demo link.
    const out = parseManifestUrls('- **Demo:** _(tom)_\n- **GitHub:** https://example.com/x\n');
    expect(out).toEqual([{ label: 'GitHub', url: 'https://example.com/x' }]);
  });

  it('picks up the vibes and agents label sets', () => {
    const out = parseManifestUrls(
      '- **Demo:** https://a.example\n- **Billede:** https://b.example/i.png\n- **Kilde:** https://c.example\n',
    );
    expect(out.map((u) => u.label)).toEqual(['Demo', 'Billede', 'Kilde']);
  });

  it('returns nothing for a manifest with no URL fields', () => {
    expect(parseManifestUrls('# Blogindlæg\n\n- **Titel:** Hej\n- **Forfatter:** Kasper\n')).toEqual([]);
  });
});

describe('apiEquivalent', () => {
  // npmjs.com 403s every verb and user-agent behind Cloudflare, so the page is
  // unusable as an existence check. The registry is unauthenticated and is the
  // actual source of truth. PR #184 failed on exactly this.
  it('rewrites an npm package page to the registry', () => {
    expect(apiEquivalent('https://www.npmjs.com/package/mcp-danish-cvr'))
      .toBe('https://registry.npmjs.org/mcp-danish-cvr');
    expect(apiEquivalent('https://npmjs.com/package/left-pad'))
      .toBe('https://registry.npmjs.org/left-pad');
  });

  it('keeps the scope on a scoped package', () => {
    expect(apiEquivalent('https://www.npmjs.com/package/@ilenhart/aula-mcp-server'))
      .toBe('https://registry.npmjs.org/@ilenhart/aula-mcp-server');
  });

  it('tolerates a trailing slash', () => {
    expect(apiEquivalent('https://www.npmjs.com/package/left-pad/'))
      .toBe('https://registry.npmjs.org/left-pad');
  });

  it('rewrites a PyPI project page', () => {
    expect(apiEquivalent('https://pypi.org/project/requests'))
      .toBe('https://pypi.org/pypi/requests/json');
  });

  it('leaves hosts with no known API alone', () => {
    expect(apiEquivalent('https://github.com/zinen/node-red-contrib-aula-education')).toBeNull();
    expect(apiEquivalent('https://firmaapi.dk')).toBeNull();
  });

  it('leaves non-package pages on a known host alone', () => {
    // /search and the homepage are not existence claims about a package.
    expect(apiEquivalent('https://www.npmjs.com/search?q=mcp')).toBeNull();
    expect(apiEquivalent('https://www.npmjs.com/')).toBeNull();
  });

  it('does not throw on a malformed URL', () => {
    expect(apiEquivalent('not a url')).toBeNull();
  });
});

describe('parseInstallTarget', () => {
  // PR #196: Kilde resolved (real public repo) but the package was never
  // published, so `npx -y cvrlookup-mcp` would 404 for every reader.
  it('reads the package out of npm-style commands', () => {
    expect(parseInstallTarget('npx -y cvrlookup-mcp')).toEqual({ registry: 'npm', pkg: 'cvrlookup-mcp' });
    expect(parseInstallTarget('npm install -g billy-mcp')).toEqual({ registry: 'npm', pkg: 'billy-mcp' });
    expect(parseInstallTarget('npm i left-pad')).toEqual({ registry: 'npm', pkg: 'left-pad' });
    expect(parseInstallTarget('yarn add left-pad')).toEqual({ registry: 'npm', pkg: 'left-pad' });
  });

  it('keeps the scope and drops the version', () => {
    expect(parseInstallTarget('npm install -g @ilenhart/aula-mcp-server'))
      .toEqual({ registry: 'npm', pkg: '@ilenhart/aula-mcp-server' });
    expect(parseInstallTarget('npx -y left-pad@1.2.3')).toEqual({ registry: 'npm', pkg: 'left-pad' });
    expect(parseInstallTarget('npm i @scope/pkg@2.0.0')).toEqual({ registry: 'npm', pkg: '@scope/pkg' });
  });

  it('handles pip', () => {
    expect(parseInstallTarget('pip install requests')).toEqual({ registry: 'pypi', pkg: 'requests' });
  });

  // Conservative by design: a false reject blocks an honest submission, which
  // is worse than not checking. These are all real, valid catalog entries.
  it('skips what it cannot confidently identify', () => {
    expect(parseInstallTarget('uv tool install git+https://github.com/x/y')).toBeNull();
    expect(parseInstallTarget('https://wordnet.dk/mcp')).toBeNull();
    expect(parseInstallTarget('npm install ./local-dir')).toBeNull();
    expect(parseInstallTarget('docker run somebody/image')).toBeNull();
    expect(parseInstallTarget('')).toBeNull();
    expect(parseInstallTarget(null)).toBeNull();
  });

  it('refuses anything with shell metacharacters', () => {
    expect(parseInstallTarget('npm i foo && rm -rf /')).toBeNull();
    expect(parseInstallTarget('curl x | sh')).toBeNull();
    expect(parseInstallTarget('npm i $(echo foo)')).toBeNull();
  });
});

describe('parseManifestInstall', () => {
  it('finds the Installation bullet', () => {
    expect(parseManifestInstall('- **Navn:** x\n- **Installation:** npm install -g foo\n'))
      .toBe('npm install -g foo');
  });

  it('returns null when absent or empty', () => {
    expect(parseManifestInstall('- **Navn:** x\n')).toBeNull();
    expect(parseManifestInstall('- **Installation:** _(tom)_\n')).toBeNull();
  });
});
