import { test, expect } from '@playwright/test';

test.describe('Leaderboard', () => {
  test('leaderboard panel is visible on player page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /start a new player/i }).click();
    await page.getByRole('button', { name: /click to earn/i }).waitFor();

    await expect(page.getByRole('region', { name: 'Leaderboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /leaderboard/i })).toBeVisible();
  });

  test('leaderboard has time window tabs', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /start a new player/i }).click();
    await page.getByRole('button', { name: /click to earn/i }).waitFor();

    const tablist = page.getByRole('tablist', { name: /leaderboard time windows/i });
    await expect(tablist).toBeVisible();
    await expect(tablist.getByRole('tab', { name: 'All Time' })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: 'Today' })).toBeVisible();
    await expect(tablist.getByRole('tab', { name: 'This Week' })).toBeVisible();
  });

  test('tab switching changes leaderboard view', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /start a new player/i }).click();
    await page.getByRole('button', { name: /click to earn/i }).waitFor();

    const tablist = page.getByRole('tablist', { name: /leaderboard time windows/i });
    const dailyTab = tablist.getByRole('tab', { name: 'Today' });
    await dailyTab.click();
    await expect(dailyTab).toHaveAttribute('aria-selected', 'true');

    const weeklyTab = tablist.getByRole('tab', { name: 'This Week' });
    await weeklyTab.click();
    await expect(weeklyTab).toHaveAttribute('aria-selected', 'true');
  });

  test('leaderboard receives initial snapshot via SSE on connect', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /start a new player/i }).click();
    await page.getByRole('button', { name: /click to earn/i }).waitFor();

    // The leaderboard should render from the initial SSE snapshot
    // Either shows entries or "No players yet" — but not "Waiting for data"
    const leaderboard = page.getByRole('region', { name: 'Leaderboard' });
    await expect(leaderboard).toBeVisible();
    // After SSE connect, should no longer show "Waiting for data"
    await expect(leaderboard.getByText('Waiting for data')).not.toBeVisible({ timeout: 10_000 });
  });

  test('clicking updates leaderboard via SSE broadcast', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /start a new player/i }).click();
    await page.getByRole('button', { name: /click to earn/i }).waitFor();

    // Click several times to register on leaderboard
    const clickBtn = page.getByRole('button', { name: /click to earn/i });
    for (let i = 0; i < 5; i++) {
      await clickBtn.click();
    }

    // The leaderboard should update via SSE (no polling) and show current player
    await expect(page.getByText('(you)')).toBeVisible({ timeout: 10_000 });
  });

  test('multiple players see each other on the leaderboard via SSE', async ({ browser }) => {
    // Player 1: create and click to get on leaderboard
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await page1.goto('/');
    await page1.getByRole('button', { name: /start a new player/i }).click();
    await page1.getByRole('button', { name: /click to earn/i }).waitFor();

    const clickBtn1 = page1.getByRole('button', { name: /click to earn/i });
    for (let i = 0; i < 3; i++) {
      await clickBtn1.click();
    }
    // Player 1 should see themselves
    await expect(page1.getByText('(you)')).toBeVisible({ timeout: 10_000 });

    // Player 2: separate browser context (separate SSE connection)
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto('/');
    await page2.getByRole('button', { name: /start a new player/i }).click();
    await page2.getByRole('button', { name: /click to earn/i }).waitFor();

    // Player 2's leaderboard should already show Player 1 from the initial SSE snapshot
    const leaderboard2 = page2.getByRole('region', { name: 'Leaderboard' });
    await expect(leaderboard2).toBeVisible();
    // Wait for SSE to deliver the leaderboard — rank 1 shows 🥇 medal
    await expect(leaderboard2.getByText('🥇')).toBeVisible({ timeout: 10_000 });

    // Player 2 clicks to also get on the leaderboard
    const clickBtn2 = page2.getByRole('button', { name: /click to earn/i });
    for (let i = 0; i < 5; i++) {
      await clickBtn2.click();
    }
    // Player 2 should see themselves marked as "(you)"
    await expect(page2.getByText('(you)')).toBeVisible({ timeout: 10_000 });

    // Player 1's leaderboard should now show 2 ranked entries via SSE broadcast
    const leaderboard1 = page1.getByRole('region', { name: 'Leaderboard' });
    await expect(leaderboard1.getByText('🥈')).toBeVisible({ timeout: 10_000 });

    await ctx1.close();
    await ctx2.close();
  });
});
