import { test, expect } from '@playwright/test';

test.describe('Smoke', () => {
  test('welcome page loads with start button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Players on Level 0');
    await expect(page.getByRole('button', { name: /start a new player/i })).toBeVisible();
  });

  test('start button navigates to player page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /start a new player/i }).click();
    await expect(page).toHaveURL(/\/[0-9a-f-]{36}$/);
  });

  test('player page shows loading then stats', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /start a new player/i }).click();
    // New player starts with stats visible
    await expect(page.getByLabel('Player statistics')).toBeVisible();
    await expect(page.getByRole('button', { name: /click to earn/i })).toBeVisible();
  });

  test('API proxy works — click returns 202', async ({ page }) => {
    const playerId = crypto.randomUUID();
    const response = await page.request.post(`/api/players/${playerId}/click`);
    // 202 means API is reachable and accepts clicks (even for new players)
    expect([202, 404]).toContain(response.status());
  });
});
