import { test, expect } from '@playwright/test';

test.describe('VibeTrends.dk Core Flows', () => {
  test('should load the homepage and show featured content', async ({ page }) => {
    await page.goto('/');
    
    // Check Title
    await expect(page).toHaveTitle(/vibetrends.dk/i);
    
    // Check Hero
    await expect(page.getByText('Gode AI-tools. Selv agenter henter dem her.')).toBeVisible();
    
    // Check Navigation — Header.tsx groups Skills/MCP/CLI under a "Tools"
    // dropdown (opens on hover); Forum, Vibes, and Blog are direct top-level
    // links. Directly-visible items are checked without interaction; the
    // dropdown's sub-items only render in the DOM as visible after hover.
    const directNavItems = ['Forum', 'Vibes', 'Blog'];
    for (const item of directNavItems) {
      await expect(page.locator('nav').getByText(item, { exact: true })).toBeVisible();
    }

    const toolsTrigger = page.locator('nav').getByRole('button', { name: 'Tools' });
    await expect(toolsTrigger).toBeVisible();
    await toolsTrigger.hover();
    for (const item of ['Skills', 'MCP', 'CLI']) {
      await expect(page.locator('nav').getByText(item, { exact: true })).toBeVisible();
    }

    // Agents is no longer a primary-nav entry.
    await expect(page.locator('nav').getByText('Agenter')).toHaveCount(0);
  });

  test('project card overlay links directly to the project\'s live demo site', async ({ page }) => {
    // The card carries two links: a card-wide overlay (aria-label = project
    // title) that opens the project's live demoUrl in a new tab, and a small
    // info icon (aria-label = "Se Detaljer") that navigates to the
    // internal /vibes/[id] detail page. This test asserts the overlay; the
    // info icon is covered by the detail-navigation test below.
    await page.goto('/vibes');

    await expect(page.getByRole('heading', { name: /Project Showcase/i })).toBeVisible();

    const firstProject = page.getByTestId('project-card').first();
    // /vibes is partial-prerendered — this data streams in after the static
    // shell, and a cold CI runner's Supabase connection can occasionally push
    // that past the 5s default. Widen rather than tighten (see the same
    // rationale elsewhere in this file for cold-start latency).
    await expect(firstProject).toBeVisible({ timeout: 15000 });
    const projectTitle = (await firstProject.locator('h3').innerText()).trim();

    const overlay = firstProject.getByRole('link', { name: projectTitle });
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute('target', '_blank');

    // Cross-check the rendered href against the API's demoUrl for this
    // project, rather than only asserting the href is non-empty.
    const projects = await (await page.request.get('/api/vibes')).json();
    const project = projects.find((p: { title: string }) => p.title === projectTitle);
    expect(project?.demoUrl).toBeTruthy();
    await expect(overlay).toHaveAttribute('href', project.demoUrl);
  });

  test('project card info icon opens the /vibes/[id] detail page', async ({ page }) => {
    await page.goto('/vibes');
    await expect(page.getByRole('heading', { name: /Project Showcase/i })).toBeVisible();

    const firstProject = page.getByTestId('project-card').first();
    // See the cold-start rationale in the test above.
    await expect(firstProject).toBeVisible({ timeout: 15000 });
    const projectTitle = (await firstProject.locator('h3').innerText()).trim();

    // The card-wide overlay now opens the external demo site (see the test
    // above), so detail navigation goes through the dedicated info icon link.
    await firstProject.getByRole('link', { name: 'Se Detaljer' }).click();
    await expect(page).toHaveURL(/\/vibes\/[^/]+$/);
    await expect(page.getByRole('heading', { name: projectTitle })).toBeVisible();
  });

  test('should navigate to Forum and check tråde', async ({ page }) => {
    await page.goto('/forum');
    
    // The h1 renders "Developer <span>Forum</span>" (accessible name
    // "Developer Forum") — a bare /^Forum$/ can never match it.
    await expect(page.getByRole('heading', { name: 'Developer Forum' })).toBeVisible();
    
    // Check categories. forumCategoryLabel() resolves category keys to their
    // Danish label (src/lib/forumCategories.ts) — "General" renders as
    // "Generelt", not the raw English key.
    await expect(page.getByRole('button', { name: 'Generelt', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Prompts', exact: true })).toBeVisible();
    
    // Click a thread card
    const firstThread = page.getByTestId('thread-card').first();
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

    await expect(page.getByRole('heading', { name: /CLIs/i })).toBeVisible();

    // Check a detail page
    const firstCli = page.getByTestId('cli-card').first();
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

});
