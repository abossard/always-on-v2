import { test, expect } from '@playwright/test';

test.describe('Level 7: Nagging — Automation finds permanent dismiss', () => {
  test('dismisses nag, encounters it again, finds permanent dismiss', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await page.getByTestId('level-link-7').click();

    // Nag overlay should appear
    const nagOverlay = page.getByTestId('nag-overlay');
    await expect(nagOverlay).toBeVisible();

    // Dismiss the nag temporarily (not permanently)
    await page.getByTestId('dismiss-nag').click();
    await expect(nagOverlay).toBeHidden();

    // Refresh the page content — nag will reappear
    await page.getByTestId('refresh-page').click();
    await expect(nagOverlay).toBeVisible();

    // Find the hidden permanent dismiss button — tiny and nearly invisible
    const permanentDismiss = page.getByTestId('dismiss-permanently');
    await expect(permanentDismiss).toBeVisible();

    // Click permanent dismiss — automation finds it instantly
    await permanentDismiss.click();

    // Verify nag is permanently gone
    const result = page.getByTestId('level7-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('found the hidden permanent dismiss');
  });
});
