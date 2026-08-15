import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Every list-card locator in this file goes through `cards()`, which scopes the
// query to <main>. That scoping is load-bearing, not cosmetic.
//
// These pages stream through nested Suspense boundaries (layout.tsx wraps the
// whole tree, and e.g. vibes/page.tsx wraps its data fetch). React streams each
// boundary's HTML into a staging container appended to <body>, of the form
// `<div hidden id="S:2">...</div>`, then reveals it with an inline `$RS`/`$RC`
// script that moves the nodes into their real slot. When the boundaries resolve
// in certain orders, one of those staging containers is left behind in <body>,
// still `hidden`, still holding a full duplicate copy of the page content.
//
// The visible page is fine (users never see this), but an unscoped
// `page.getByTestId('project-card').first()` binds to the orphaned copy,
// because it sits earlier in DOM order than the real <main>. It is `hidden`
// permanently, so `toBeVisible()` can never pass and no timeout helps. This is
// exactly what made the /vibes detail test fail 4/4 in CI while passing 10/10
// locally (issue #98): flush boundaries differ between a local direct Postgres
// connection and CI's slower Supabase pooler, so the orphan only survives in
// CI. Scoping to <main> excludes the staging container entirely.
const cards = (page: import('@playwright/test').Page, testId: string) =>
  page.locator('main').getByTestId(testId);

// Titles of the rows scripts/seed-e2e-fixtures.mjs seeded for this run. Tests
// assert against these instead of whatever happens to top the live production
// list, so a new real project or an admin edit can't change what is asserted.
// Falls back to null when the manifest is absent (someone running `playwright
// test` without the seed step), in which case tests degrade to the old
// first-card behaviour rather than failing outright.
function fixtureProjectTitle(): string | null {
  const manifestPath = path.join(process.cwd(), '.e2e-fixtures.json');
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  return manifest.titles?.vibes ?? null;
}

// Opens /vibes narrowed to the seeded fixture project, and returns its card.
//
// The ?q= is not decoration, it is what makes the fixture reachable at all.
// getProjects() is a `"use cache"` function with cacheLife('max') keyed by
// (search, lang, sort), and it is only ever invalidated by revalidateTag()
// inside createProject(). scripts/seed-e2e-fixtures.mjs inserts over raw SQL,
// which runs nowhere near that tag, so a warm cache serves a project list that
// predates the fixture and the row is simply absent from plain /vibes.
// (Verified locally 2026-08-03: plain /vibes rendered 0 fixture cards against a
// warm cache, /vibes?q=<title> rendered 1.) The per-run title is unique, so the
// query is always a cache miss and always hits Postgres. CI happens to build
// with a cold cache today, which is the only reason the existing forum/CLI
// fixtures work there without this trick. Do not rely on that staying true.
//
// Falls back to plain /vibes and the first card when no manifest exists, so
// `playwright test` still works without the seed step.
async function openProjectCard(page: import('@playwright/test').Page) {
  const title = fixtureProjectTitle();
  await page.goto(title ? `/vibes?q=${encodeURIComponent(title)}` : '/vibes');
  await expect(page.getByRole('heading', { name: /Vibes fra fællesskabet/i })).toBeVisible();

  const all = cards(page, 'project-card');
  return title
    ? all.filter({ has: page.getByRole('heading', { name: title, exact: true }) })
    : all.first();
}

test.describe('VibeTrends.dk Core Flows', () => {
  test('should load the homepage and show featured content', async ({ page }) => {
    await page.goto('/');
    
    // Check Title
    await expect(page).toHaveTitle(/vibetrends.dk/i);
    
    // Check Hero
    await expect(page.getByText('Gode AI-tools. Selv agenter henter dem her.')).toBeVisible();
    
    // Check Navigation — Header.tsx groups Skills/MCP/CLI under a "Tools"
    // dropdown (opens on hover); Vibes is a direct top-level link. Directly-
    // visible items are checked without interaction; the dropdown's sub-items
    // only render in the DOM as visible after hover.
    await expect(page.locator('nav').getByText('Vibes', { exact: true })).toBeVisible();

    // Forum is always linked, whether or not it holds threads. It is the only
    // hub a visitor can fill, so gating the link on its own content was
    // self-sealing — the surface that produces the first thread was hidden
    // until a first thread existed. Its empty state is designed instead (see
    // the cold-start branch in ForumExplorer). Indexing is a separate question
    // and is deliberately still gated: an empty forum stays noindexed.
    await expect(page.locator('nav').getByText('Forum', { exact: true })).toBeVisible();

    // Blog stays gated, because no visitor can populate it — hiding an empty
    // one costs nothing and spares a dead link. Rather than hardcode "hidden",
    // which would turn the first published post into a false failure, assert
    // the invariant hiddenNavHrefs still guarantees for /blog: noindexed AND
    // unlinked, or indexable AND linked. Never one without the other.
    //
    // The hub's own robots meta is the right signal to compare against because
    // it comes from the same hasBlogContent call the nav uses. Do NOT
    // substitute /api/blog here: that route reads rows (getBlogPosts) rather
    // than the count, under an entirely different "use cache" key, so it can
    // legitimately hold different data. Confirmed 2026-08-04: a deleted post
    // lingered in the getBlogPosts('da') entry while the no-arg entry was
    // correctly empty, which made an earlier version of this assertion fail
    // against a hub that was behaving correctly.
    const blogHtml = await (await page.request.get('/blog')).text();
    const blogIsEmpty = /<meta name="robots" content="noindex/.test(blogHtml);
    const blogNavLink = page.locator('nav').getByText('Blog', { exact: true });

    if (blogIsEmpty) {
      await expect(blogNavLink).toHaveCount(0);
    } else {
      await expect(blogNavLink).toBeVisible();
    }

    const toolsTrigger = page.locator('nav').getByRole('button', { name: 'Tools' });
    await expect(toolsTrigger).toBeVisible();
    await toolsTrigger.hover();
    // These are FEED_TYPES' labelDa values, which is what #135 made the
    // dropdown render. Hardcoded rather than imported so the test still fails
    // if someone renames a hub without meaning to; update it deliberately.
    for (const item of ['Skills', 'MCP-servere', "CLI'er"]) {
      await expect(page.locator('nav').getByText(item, { exact: true })).toBeVisible();
    }

    // The Agents hub is no longer a primary-nav entry. exact:true matters here:
    // a bare string is a case-insensitive *substring* match, so this assertion
    // also caught the unrelated "For agenter" link when that was added.
    await expect(page.locator('nav').getByText('Agenter', { exact: true })).toHaveCount(0);

    // The agent-facing entry point is in the nav, though — that link is the
    // whole point of /agent-guide being discoverable.
    await expect(
      page.locator('nav').getByRole('link', { name: 'For agenter' }).first(),
    ).toBeVisible();
  });

  test('project card overlay opens the in-site detail page, not the demo', async ({ page }) => {
    // The card carries two links: a card-wide overlay (aria-label = project
    // title) that navigates to /vibes/{slug}, and a labelled "Se live" action
    // that opens the project's own site in a new tab. This used to be inverted
    // — the whole card was the off-site link — which exported every visitor
    // permanently. This test asserts the overlay; "Se live" is covered below.
    const targetProject = await openProjectCard(page);
    // /vibes is partial-prerendered — this data streams in after the static
    // shell, and a cold CI runner's Supabase connection can occasionally push
    // that past the 5s default. Widen rather than tighten (see the same
    // rationale elsewhere in this file for cold-start latency).
    await expect(targetProject).toBeVisible({ timeout: 15000 });
    const projectTitle = (await targetProject.locator('h3').innerText()).trim();

    const overlay = targetProject.getByRole('link', { name: projectTitle });
    await expect(overlay).toBeVisible();
    // The overlay must NOT leave the site.
    await expect(overlay).not.toHaveAttribute('target', '_blank');
    await expect(overlay).toHaveAttribute('href', /^\/vibes\/[^/]+$/);

    await overlay.click();
    await expect(page).toHaveURL(/\/vibes\/[^/]+$/);
    await expect(page.getByRole('heading', { name: projectTitle })).toBeVisible();
  });

  test('project card "Se live" opens the project\'s own site in a new tab', async ({ page }) => {
    const targetProject = await openProjectCard(page);
    // See the cold-start rationale in the test above.
    await expect(targetProject).toBeVisible({ timeout: 15000 });
    const projectTitle = (await targetProject.locator('h3').innerText()).trim();

    const demoLink = targetProject.getByRole('link', { name: 'Se live' });
    await expect(demoLink).toBeVisible();
    await expect(demoLink).toHaveAttribute('target', '_blank');

    // Cross-check the rendered href against the API's demoUrl for this
    // project, rather than only asserting the href is non-empty. Narrowed by
    // ?search= for the same cache-miss reason openProjectCard() uses ?q=; note
    // the route's param is `search`, not `q`.
    const projects = await (
      await page.request.get(`/api/vibes?search=${encodeURIComponent(projectTitle)}`)
    ).json();
    const project = projects.find((p: { title: string }) => p.title === projectTitle);
    expect(project?.demoUrl).toBeTruthy();
    await expect(demoLink).toHaveAttribute('href', project.demoUrl);
  });

  test('should navigate to Forum and check tråde', async ({ page }) => {
    await page.goto('/forum');
    
    // The h1 renders "Spørg <span>fællesskabet</span>" (accessible name
    // "Spørg fællesskabet") — a bare /^Forum$/ can never match it.
    await expect(page.getByRole('heading', { name: 'Spørg fællesskabet' })).toBeVisible();
    
    // Check categories. forumCategoryLabel() resolves category keys to their
    // Danish label (src/lib/forumCategories.ts) — "General" renders as
    // "Generelt", not the raw English key.
    await expect(page.getByRole('button', { name: 'Generelt', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Prompts', exact: true })).toBeVisible();
    
    // Click a thread card
    const firstThread = cards(page, 'thread-card').first();
    await expect(firstThread).toBeVisible();
    
    const threadTitle = await firstThread.locator('h3').innerText();
    await firstThread.click({ position: { x: 50, y: 50 } });
    
    // Verify thread detail
    await page.waitForURL(/\/forum\/.+/);
    await expect(page.locator('h1')).toHaveText(threadTitle);
    await expect(page.getByText(/Svar \(/)).toBeVisible();
  });

  test('should navigate to the CLIs feed', async ({ page }) => {
    await page.goto('/cli');

    await expect(page.getByRole('heading', { name: /CLI-værktøjer/i })).toBeVisible();

    // Check a detail page
    const firstCli = cards(page, 'cli-card').first();
    await expect(firstCli).toBeVisible();
    await firstCli.click({ position: { x: 50, y: 50 } });

    await page.waitForURL(/\/cli\/.+/);
    await expect(page.getByRole('heading', { name: /System Prompt/i })).toBeVisible();

    // Every feed item is one step from a host: the connect block lets you pick
    // a host and get a recipe.
    const connect = page.getByTestId('connect-block');
    await expect(connect).toBeVisible();
    await connect.getByTestId('connect-host-claude-code').click();
    await expect(connect.getByText(/Steps|Trin/)).toBeVisible();
  });

  test('should sync search to the URL (deep-linkable)', async ({ page }) => {
    // Read direction: a deep-linked search term populates the input from the URL.
    await page.goto('/skills?q=automation');
    await expect(page.locator('input[type="text"]').first()).toHaveValue('automation');

    // The feed explorer mirrors the same q-param sync.
    await page.goto('/cli?q=scraper');
    await expect(page.locator('input[type="text"]').first()).toHaveValue('scraper');
  });

  // NOTE ON FIDELITY: this exercises the *client-side test-login fallback* in
  // AuthProvider (the `testuser@vibetrends.dk` / `@test.dk` branch), NOT a real
  // Supabase magic-link session. It proves the modal flow and the logged-in UI
  // state render correctly; it does NOT prove server-side auth, because the mock
  // user has no session cookie. Server mutations (upvote/create) re-check the
  // real cookie via getAuthUser() and would no-op for this mock user.
  //
  // DEFERRED (needs real Supabase auth in CI):
  //   - an upvote toggle round-trip end-to-end (covered at the unit layer in
  //     src/lib/__tests__/db.test.ts: upvoteProject toggle + null-vs-0).
  //   - gating the client-side test-login backdoor out of production builds.
  test('renders logged-in UI via the client-side test-login fallback', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Log ind' }).click();
    await expect(page.getByRole('heading', { name: 'Velkommen til vibetrends.dk' })).toBeVisible();

    await page.getByPlaceholder('eksempel@vibe.dk').fill('testuser@vibetrends.dk');
    await page.getByRole('button', { name: 'Fortsæt med E-mail' }).click();

    // On desktop the logged-in state is the logout button alone. The @username
    // span used to sit next to it, but #84 removed it from the desktop header to
    // centre the nav geometrically — asserting on it here is what made this test
    // fail on every run from 2026-07-27 onward.
    await expect(page.locator('header').getByRole('button', { name: 'Log ud' })).toBeVisible();

    // The username itself survives only in the mobile menu, so drop to a mobile
    // viewport to check it. Worth keeping: `testuser_vibe` pins the username
    // getAuthUser() derives server-side (email local-part, non-alphanumerics →
    // '_', suffixed `_vibe`), which nothing else in the e2e suite covers.
    // Targeted by aria-controls rather than its sr-only label, which is
    // translated and would break again the next time the copy changes.
    //
    // The modal does not self-close on the test-login path (the real magic-link
    // flow leaves it up showing "check your email"), and its backdrop swallows
    // clicks, so dismiss it the way a user would before touching the header.
    await page.getByRole('button', { name: 'Luk' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('button[aria-controls="mobile-menu"]').click();
    await expect(page.locator('#mobile-menu').getByText('@testuser_vibe')).toBeVisible();
  });

  test('routing-level unknown paths return true HTTP 404; dynamic detail not-founds include noindex', async ({ page }) => {
    // 1. A completely unknown route that matches no route segment returns a real HTTP 404.
    const unknownRes = await page.request.get('/totally-unknown-path');
    expect(unknownRes.status()).toBe(404);

    // 2. Dynamic detail routes that match a segment but fail data lookup stream
    // under PPR (cacheComponents: true) and emit <meta name="robots" content="noindex">
    // to prevent indexing.
    const dynamicRes = await page.request.get('/skills/non-existent-test-slug-404');
    const html = await dynamicRes.text();
    expect(html).toContain('content="noindex"');
  });

});
