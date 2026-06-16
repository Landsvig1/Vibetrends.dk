import { test, expect } from '@playwright/test';

test.describe('VibeTrends.dk Core Flows', () => {
  test('should load the homepage and show featured content', async ({ page }) => {
    await page.goto('/');
    
    // Check Title
    await expect(page).toHaveTitle(/vibetrends.dk/i);
    
    // Check Hero
    await expect(page.getByText('Vibe-kod & ship hurtigere')).toBeVisible();
    
    // Check Navigation
    const navItems = ['Forum', 'Tools', 'Vibes', 'Agenter', 'Blog'];
    for (const item of navItems) {
      await expect(page.locator('nav').getByText(item)).toBeVisible();
    }
  });

  test('should navigate to Showcase and view a project', async ({ page }) => {
    await page.goto('/showcase');
    
    // Wait for heading
    await expect(page.getByRole('heading', { name: /Project Showcase/i })).toBeVisible();
    
    // Select the first project card
    const firstProject = page.getByTestId('project-card').first();
    await expect(firstProject).toBeVisible();
    
    const projectTitle = await firstProject.locator('h3').innerText();
    
    // Click specifically on the card body area
    await firstProject.click({ position: { x: 50, y: 50 } }); 
    
    // Verify detail page navigation
    await page.waitForURL(/\/showcase\/.+/);
    
    // Check title in detail view - using regex for flexibility
    const detailHeading = page.locator('h1');
    await expect(detailHeading).toContainText(projectTitle.trim());
    await expect(page.getByText(/Prompts/i).first()).toBeVisible();
  });

  test('should navigate to Forum and check tråde', async ({ page }) => {
    await page.goto('/forum');
    
    await expect(page.getByRole('heading', { name: /Developer Forum/i })).toBeVisible();
    
    // Check categories
    await expect(page.getByRole('button', { name: 'General', exact: true })).toBeVisible();
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

  test('should navigate to Agents registry', async ({ page }) => {
    await page.goto('/agents');
    
    await expect(page.getByRole('heading', { name: /Agent & MCP Registry/i })).toBeVisible();
    
    // Check a detail page
    const firstAgent = page.getByTestId('agent-card').first();
    await expect(firstAgent).toBeVisible();
    await firstAgent.click({ position: { x: 50, y: 50 } });
    
    await page.waitForURL(/\/agents\/.+/);
    await expect(page.getByRole('heading', { name: /System Prompt/i })).toBeVisible();
    await expect(page.getByText(/Hurtig Installation/i)).toBeVisible();
  });

  test('should simulate login and verify user state', async ({ page }) => {
    await page.goto('/');
    
    // Click Log ind
    await page.getByRole('button', { name: 'Log ind' }).click();
    
    // Check Modal
    await expect(page.getByRole('heading', { name: 'Velkommen til vibetrends.dk' })).toBeVisible();
    
    // Enter email
    await page.getByPlaceholder('eksempel@vibe.dk').fill('testuser@vibetrends.dk');
    await page.getByRole('button', { name: 'Fortsæt med E-mail' }).click();
    
    // Check for user badge
    await expect(page.getByText('@testuser_vibe')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Log ud' })).toBeVisible();
  });

  test('should toggle language between Danish and English and persist via cookie', async ({ page, context }) => {
    await page.goto('/');

    // 1. By default, it should be in Danish. Check a Danish phrase or link.
    await expect(page.locator('header').getByRole('button', { name: 'Log ind' })).toBeVisible();
    await expect(page.getByText('Hubben for danske Vibe Coders & AI-byggere')).toBeVisible();

    // 2. Click the EN language toggle button in the header
    await page.locator('header').getByRole('button', { name: 'EN', exact: true }).click();

    // 3. Verify it switches to English instantly
    await expect(page.locator('header').getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(page.getByText('The Hub for Danish Vibe Coders & AI Builders')).toBeVisible();

    // 4. Verify cookie 'vibe_lang' is set to 'en'
    const cookies = await context.cookies();
    const langCookie = cookies.find(c => c.name === 'vibe_lang');
    expect(langCookie).toBeDefined();
    expect(langCookie?.value).toBe('en');

    // 5. Reload page to test server-side persistence
    await page.reload();
    await expect(page.locator('header').getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(page.getByText('The Hub for Danish Vibe Coders & AI Builders')).toBeVisible();

    // 6. Click DA toggle back
    await page.locator('header').getByRole('button', { name: 'DA', exact: true }).click();
    await expect(page.locator('header').getByRole('button', { name: 'Log ind' })).toBeVisible();
    await expect(page.getByText('Hubben for danske Vibe Coders & AI-byggere')).toBeVisible();
  });
});
