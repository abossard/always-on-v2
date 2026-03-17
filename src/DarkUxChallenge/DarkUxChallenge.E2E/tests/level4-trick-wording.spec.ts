import { test, expect } from '@playwright/test';

test.describe('Level 4: Trick Wording — Automation reads actual effects, not confusing labels', () => {
  test('reads actual effect attributes and selects none (all are traps)', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await page.getByTestId('level-link-4').click();

    // Wait for the challenge form to load
    const submitBtn = page.getByTestId('submit-challenge');
    await expect(submitBtn).toBeVisible();

    // Read data-actual-effect on each option — automation sees through trick wording
    const options = page.locator('[data-testid^="option-"]');
    const count = await options.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const option = options.nth(i);
      const actualEffect = await option.getAttribute('data-actual-effect');
      expect(actualEffect).toBeTruthy();
      // Automation reads the actual effect, not the confusing label — leave all unchecked
    }

    // Submit with NONE selected — automation avoids all traps
    await submitBtn.click();

    // Verify result
    const result = page.getByTestId('level4-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('trick wording');
  });
});
