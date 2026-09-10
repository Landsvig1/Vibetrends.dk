import { describe, it, expect } from 'vitest';
import { parseManifestUrls } from '../check-submission-urls.mjs';

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
