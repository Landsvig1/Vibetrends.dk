import { test, expect } from '@playwright/test';

test.describe('VibeTrends.dk Core Flows', () => {
  test('should load the homepage and show featured content', async ({ page }) => {
    await page.goto('/');
    
    // Check Title
    await expect(page).toHaveTitle(/vibetrends.dk/i);
    
    // Check Hero
    await expect(page.getByText('Vibe Code & Ship Faster')).toBeVisible();
    
    // Check Navigation
    const navItems = ['Skills', 'Showcase', 'Forum', 'Blog', 'Agents'];
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
    await expect(page.getByText(/Vibe Prompts/i)).toBeVisible();
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
});
