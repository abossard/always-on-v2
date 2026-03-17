import { test, expect } from '@playwright/test';

test.describe('Level 5: Preselection — Automation detects and unchecks all pre-selected options', () => {
  test('detects all pre-selected toggles and unchecks them', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await page.getByTestId('level-link-5').click();

    // Wait for settings to load
    const saveBtn = page.getByTestId('save-settings');
    await expect(saveBtn).toBeVisible();

    // Verify all settings start with data-default-value="true" (pre-selected)
    const settings = page.locator('[data-testid^="setting-"]');
    const count = await settings.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const setting = settings.nth(i);
      const defaultValue = await setting.getAttribute('data-default-value');
      expect(defaultValue).toBe('true');
    }

    // Uncheck all toggles — automation detects the dark pattern
    const toggles = [
      'toggle-newsletterOptIn',
      'toggle-shareDataWithPartners',
      'toggle-locationTracking',
      'toggle-pushNotifications',
    ];

    for (const toggleId of toggles) {
      await page.getByTestId(toggleId).click();
    }

    // Submit with all unchecked
    await saveBtn.click();

    // Verify completion
    const result = page.getByTestId('level5-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('unchecked all the sneaky defaults');
  });
});
