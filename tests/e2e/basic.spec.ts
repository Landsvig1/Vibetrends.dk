import { test, expect } from '@playwright/test';

test.describe('VibeTrends.dk Core Flows', () => {
  test('should load the homepage and show featured content', async ({ page }) => {
    await page.goto('/');
    
    // Check Title
    await expect(page).toHaveTitle(/vibetrends.dk/i);
    
    // Check Hero
    await expect(page.getByText('Se hvad folk bygger med AI.')).toBeVisible();
    
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
    // info icon (aria-label = "Se Detaljer & Prompts") that navigates to the
    // internal /vibes/[id] detail page. This test asserts the overlay; the
    // info icon is covered by the detail-navigation test below.
    await page.goto('/vibes');

    await expect(page.getByRole('heading', { name: /Project Showcase/i })).toBeVisible();

    const firstProject = page.getByTestId('project-card').first();
    await expect(firstProject).toBeVisible();
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
    await expect(firstProject).toBeVisible();
    const projectTitle = (await firstProject.locator('h3').innerText()).trim();

    // The card-wide overlay now opens the external demo site (see the test
    // above), so detail navigation goes through the dedicated info icon link.
    await firstProject.getByRole('link', { name: 'Se Detaljer & Prompts' }).click();
    await expect(page).toHaveURL(/\/vibes\/[^/]+$/);
    await expect(page.getByRole('heading', { name: projectTitle })).toBeVisible();
  });

  test('should navigate to Forum and check tråde', async ({ page }) => {
    await page.goto('/forum');
    
    await expect(page.getByRole('heading', { name: /Developer Forum/i })).toBeVisible();
    
    // Check categories. The suite defaults to da (no language cookie set),
    // and the bilingual-labels feature resolves category keys to locale
    // labels (src/lib/forumCategories.ts) — "General" renders as "Generelt"
    // under da, not the raw English key.
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

    // `testuser_vibe` matches the username getAuthUser() derives server-side
    // (email local-part, non-alphanumerics → '_', suffixed `_vibe`).
    await expect(page.getByText('@testuser_vibe')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log ud' })).toBeVisible();
  });

  test('should toggle language between Danish and English and persist via cookie', async ({ page, context }) => {
    // Two 45s toPass retry budgets below can't fit inside Playwright's default
    // 30s per-test timeout with room left for the rest of the test — extend
    // this test specifically rather than raising the suite-wide default.
    test.setTimeout(120000);
    await page.goto('/');

    // 1. By default, it should be in Danish. Check a Danish phrase or link.
    await expect(page.locator('header').getByRole('button', { name: 'Log ind' })).toBeVisible();
    await expect(page.getByText('Se hvad folk bygger med AI.')).toBeVisible();

    // 2 & 3. Click EN and verify it switches to English. Retry the whole
    // interaction so a click landing before React hydration (which would be
    // silently dropped) doesn't flake the test — real users can't click that fast.
    // Inner timeouts widened from 8000ms/outer 30000ms: the language toggle's
    // router.refresh() re-runs the homepage's DB queries against Supabase's
    // pooler, which on a cold CI runner can genuinely take longer than 8s —
    // this isn't masking a bug (the refresh mechanism itself is verified
    // correct), just accommodating real cold-start query latency.
    await expect(async () => {
      await page.locator('header').getByRole('button', { name: 'EN', exact: true }).click();
      await expect(page.locator('header').getByRole('button', { name: 'Log in' })).toBeVisible({ timeout: 20000 });
      await expect(page.getByText('Get inspired. Show what you built.')).toBeVisible({ timeout: 20000 });
    }).toPass({ timeout: 45000 });

    // 4. Verify cookie 'vibe_lang' is set to 'en'
    const cookies = await context.cookies();
    const langCookie = cookies.find(c => c.name === 'vibe_lang');
    expect(langCookie).toBeDefined();
    expect(langCookie?.value).toBe('en');

    // 5. Reload page to test server-side persistence
    await page.reload();
    await expect(page.locator('header').getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(page.getByText('Get inspired. Show what you built.')).toBeVisible({ timeout: 10000 });

    // 6. Click DA toggle back. Same retry rationale as step 2 — this click
    // comes right after a reload, so hydration may not be finished yet.
    await expect(async () => {
      await page.locator('header').getByRole('button', { name: 'DA', exact: true }).click();
      await expect(page.locator('header').getByRole('button', { name: 'Log ind' })).toBeVisible({ timeout: 20000 });
      await expect(page.getByText('Se hvad folk bygger med AI.')).toBeVisible({ timeout: 20000 });
    }).toPass({ timeout: 45000 });
  });
});
