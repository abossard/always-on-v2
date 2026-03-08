import { test, expect } from '@playwright/test';

test.describe('Player Click Flow', () => {
  test('full flow: welcome → create player → see dashboard', async ({ page }) => {
    // Start from welcome
    await page.goto('/');

    // Create new player
    await page.getByRole('button', { name: /start a new player/i }).click();
    await expect(page).toHaveURL(/\/[0-9a-f-]{36}$/);

    // Wait for player page to load
    await page.getByRole('button', { name: /click to earn/i }).waitFor();

    // Verify dashboard is fully rendered
    await expect(page.getByLabel('Player statistics')).toBeVisible();
    await expect(page.getByLabel('Total clicks')).toBeVisible();
    await expect(page.getByRole('heading', { name: /achievements/i })).toBeVisible();
  });

  test('click button is interactive', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /start a new player/i }).click();
    const clickBtn = page.getByRole('button', { name: /click to earn/i });
    await clickBtn.waitFor();

    // Click fires without error (202 fire-and-forget)
    await clickBtn.click();
    // Button is still visible after click (not removed from DOM)
    await expect(clickBtn).toBeVisible();
  });
});
