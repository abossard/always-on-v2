import { test, expect } from '@playwright/test';

test.describe('API Docs Page', () => {
  test('docs page loads from navigation', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /api docs/i }).click();
    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByRole('heading', { name: /api reference/i })).toBeVisible();
  });

  test('docs page shows all endpoints', async ({ page }) => {
    await page.goto('/docs');

    // All four methods visible
    await expect(page.getByText('GET').first()).toBeVisible();
    await expect(page.getByText('POST').first()).toBeVisible();

    // Key endpoints present
    await expect(page.getByText('/api/players/{playerId}').first()).toBeVisible();
    await expect(page.getByText('/api/players/{playerId}/click')).toBeVisible();
    await expect(page.getByText('/api/players/{playerId}/events')).toBeVisible();
  });

  test('docs page shows CURL examples', async ({ page }) => {
    await page.goto('/docs');

    // curl commands are present
    const curlBlocks = page.getByText(/^curl/);
    await expect(curlBlocks.first()).toBeVisible();

    // Copy buttons are present
    const copyButtons = page.getByRole('button', { name: /copy/i });
    await expect(copyButtons.first()).toBeVisible();
  });

  test('copy button works', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/docs');

    // Click the first copy button
    await page.getByRole('button', { name: /^copy get player$/i }).click();

    // Button should show "Copied!"
    await expect(page.getByText('Copied!').first()).toBeVisible({ timeout: 3000 });

    // Clipboard should contain a curl command
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('curl');
  });

  test('achievement thresholds table is visible', async ({ page }) => {
    await page.goto('/docs');

    await expect(page.getByRole('table', { name: /achievement thresholds/i })).toBeVisible();
    await expect(page.getByText('total-clicks')).toBeVisible();
    await expect(page.getByText('clicks-per-second')).toBeVisible();
    await expect(page.getByText('clicks-per-minute')).toBeVisible();
  });

  test('back to game link navigates home', async ({ page }) => {
    await page.goto('/docs');
    await page.getByRole('link', { name: /back to game/i }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: /start a new player/i })).toBeVisible();
  });
});
