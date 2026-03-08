import { test, expect } from '@playwright/test';

test.describe('Player Click Flow', () => {
  test('full flow: welcome → create player → see dashboard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /start a new player/i }).click();
    await expect(page).toHaveURL(/\/[0-9a-f-]{36}$/);

    await page.getByRole('button', { name: /click to earn/i }).waitFor();

    await expect(page.getByLabel('Player statistics')).toBeVisible();
    await expect(page.getByLabel('Total clicks')).toBeVisible();
    await expect(page.getByRole('heading', { name: /achievements/i })).toBeVisible();
  });

  test('click button is interactive', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /start a new player/i }).click();
    const clickBtn = page.getByRole('button', { name: /click to earn/i });
    await clickBtn.waitFor();

    await clickBtn.click();
    await expect(clickBtn).toBeVisible();
  });

  test('bookmark button copies URL', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.getByRole('button', { name: /start a new player/i }).click();
    await page.getByRole('button', { name: /click to earn/i }).waitFor();

    // Dismiss the alert dialog automatically
    page.on('dialog', (dialog) => dialog.accept());

    await page.getByRole('link', { name: /bookmark/i }).click();

    // Verify clipboard contains the player URL
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toMatch(/\/[0-9a-f-]{36}$/);
  });

  test('diagnostics panel shows player info', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /start a new player/i }).click();
    await page.getByRole('button', { name: /click to earn/i }).waitFor();

    // Open diagnostics
    await page.getByText('Diagnostics').click();

    // Verify diagnostics content
    await expect(page.getByText(/Player ID:/)).toBeVisible();
    await expect(page.getByText(/Renders:/)).toBeVisible();
    await expect(page.getByText(/Clicks sent:/)).toBeVisible();
    await expect(page.getByText(/SSE events received:/)).toBeVisible();
  });

  test('diagnostics shows SSE events after clicking', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /start a new player/i }).click();
    const clickBtn = page.getByRole('button', { name: /click to earn/i });
    await clickBtn.waitFor();

    // Click a few times
    await clickBtn.click();
    await clickBtn.click();

    // Wait for SSE events to arrive
    await page.waitForTimeout(2000);

    // Open diagnostics and check event log
    await page.getByText('Diagnostics').click();
    await expect(page.getByText('clickRecorded').first()).toBeVisible({ timeout: 5000 });
  });
});
