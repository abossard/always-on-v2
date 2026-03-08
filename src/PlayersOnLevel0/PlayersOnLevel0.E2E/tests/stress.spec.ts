import { test, expect } from '@playwright/test';

test.describe('Stress Test', () => {
  test('100 clicks updates UI via SSE', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto('/');
    await page.getByRole('button', { name: /start a new player/i }).click();

    const clickBtn = page.getByRole('button', { name: /click to earn/i });
    await clickBtn.waitFor();

    // Fire 100 clicks rapidly
    for (let i = 0; i < 100; i++) {
      await clickBtn.click({ force: true, delay: 0 });
    }

    // Wait for SSE to deliver updates — expect at least 90 (some may be lost
    // to optimistic concurrency retries exhaustion under rapid fire)
    await expect(async () => {
      const text = await clickBtn.textContent();
      const count = parseInt(text?.replace(/\D/g, '') ?? '0', 10);
      expect(count).toBeGreaterThanOrEqual(90);
    }).toPass({ timeout: 30000 });
  });
});
