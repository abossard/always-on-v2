import { test, expect } from '@playwright/test';

test.describe('Level 10: Emotional Manipulation — Automation detects fake urgency signals', () => {
  test('detects countdown timer resets and fake stock numbers', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await page.getByTestId('level-link-10').click();

    // Read countdown data — automation checks the data attribute, not the visual timer
    const countdown = page.getByTestId('countdown');
    await expect(countdown).toBeVisible();
    const countdownEnd = await countdown.getAttribute('data-countdown-end');
    expect(countdownEnd).toBeTruthy();

    // Read stock data — automation checks data-stock-value, not the scary text
    const stockCount = page.getByTestId('stock-count');
    await expect(stockCount).toBeVisible();
    const stockValue = await stockCount.getAttribute('data-stock-value');
    expect(stockValue).toBeTruthy();
    expect(Number(stockValue)).toBeGreaterThan(0);

    // Click verify button — automation verifies instead of panic-buying
    const verifyBtn = page.getByTestId('verify-urgency');
    await verifyBtn.click();

    // Verify response shows all signals are fake
    const result = page.getByTestId('level10-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('verified the fake urgency');
  });
});
