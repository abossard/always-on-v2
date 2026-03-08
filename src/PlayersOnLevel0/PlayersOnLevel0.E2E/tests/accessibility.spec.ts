import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('welcome page has no a11y violations', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('player page has no a11y violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /start a new player/i }).click();
    await page.getByRole('button', { name: /click to earn/i }).waitFor();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
