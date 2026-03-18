import { test, expect } from '@playwright/test';

test.describe('Level 3: Forced Continuity — Automation detects silent conversion', () => {
  test('starts trial and cancels before silent conversion', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await page.getByTestId('level-link-3').click();

    // Start free trial
    await page.getByTestId('start-trial-button').click();

    // Check trial status
    const trialStatus = page.getByTestId('trial-status');
    await expect(trialStatus).toBeVisible();

    // Find the buried cancel button — automation doesn't miss it
    const cancelBtn = page.getByTestId('cancel-trial-button');
    await expect(cancelBtn).toBeVisible();

    // Verify the cancel button is intentionally hard to see (small text, low contrast)
    const btnStyles = await cancelBtn.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        fontSize: style.fontSize,
        color: style.color,
      };
    });
    // Font should be small (less than 14px typically)
    const fontSize = parseFloat(btnStyles.fontSize);
    expect(fontSize).toBeLessThan(14);

    // Cancel the trial
    await cancelBtn.click();

    // Verify success
    const result = page.getByTestId('level3-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('cancelled in time');
  });

  test('fine print about charges is barely visible', async ({ page }) => {
    // Must visit welcome + hub first to create a user in localStorage
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await page.getByTestId('level-link-3').click();

    await expect(page.getByRole('heading', { name: 'Level 3: Forced Continuity' })).toBeVisible();

    // The terms text should be present but in tiny, low-contrast text
    const termsText = page.locator('p').filter({ hasText: '$9.99/month' }).first();
    await expect(termsText).toContainText('cancel before the trial period expires');
  });
});
