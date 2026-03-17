import { test, expect } from '@playwright/test';

test.describe('Level 9: Zuckering — Automation grants minimal permissions', () => {
  test('declines all permissions instead of accepting all', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await page.getByTestId('level-link-9').click();

    // Verify "Accept All" button exists and is prominently displayed
    const acceptAllBtn = page.getByTestId('accept-all');
    await expect(acceptAllBtn).toBeVisible();

    // Verify there are individual permission toggles
    const permissions = page.locator('[data-testid^="permission-"]');
    const count = await permissions.count();
    expect(count).toBeGreaterThan(0);

    // Automation ignores the prominent "Accept All" — submit with ZERO permissions granted
    const submitBtn = page.getByTestId('submit-permissions');
    await submitBtn.click();

    // Verify minimal result — no excessive permissions granted
    const result = page.getByTestId('level9-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText("didn't grant any excessive permissions");
  });
});
