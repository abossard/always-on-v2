import { test, expect } from '@playwright/test';

test.describe('Level 8: Interface Interference — Automation selects by attribute, not visual prominence', () => {
  test('identifies non-decoy action via data-is-decoy attribute', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('level-link-8').click();

    // Wait for the interface trap to load
    const actions = page.locator('[data-testid^="action-"]');
    await expect(actions.first()).toBeVisible();

    const count = await actions.count();
    expect(count).toBeGreaterThan(1);

    // Find the non-decoy action — automation reads data-is-decoy, ignoring visual weight
    let realActionFound = false;
    for (let i = 0; i < count; i++) {
      const action = actions.nth(i);
      const isDecoy = await action.getAttribute('data-is-decoy');
      if (isDecoy === 'false') {
        await action.click();
        realActionFound = true;
        break;
      }
    }
    expect(realActionFound).toBe(true);

    // Verify correct choice
    const result = page.getByTestId('level8-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('found the real action');
  });
});
