import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function dismissChallengeBriefing(page: Page) {
  await expect(page.getByTestId('challenge-briefing')).toBeVisible();
  await page.getByTestId('challenge-acknowledge').check();
  await expect(page.getByTestId('dismiss-challenge-briefing')).toBeEnabled({ timeout: 3000 });
  await page.getByTestId('dismiss-challenge-briefing').click();
  await expect(page.getByTestId('challenge-sync-curtain')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('challenge-sync-curtain')).toBeHidden({ timeout: 3000 });
}

test.describe('Accessibility', () => {
  test('hub page has no critical a11y violations', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await page.getByTestId('level-card-1').waitFor();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast']) // Dark patterns intentionally break contrast
      .analyze();

    expect(results.violations.filter(v => v.impact === 'critical')).toHaveLength(0);
  });

  test('challenge-mode briefing has no critical a11y violations', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge-mode').click();
    await expect(page.getByTestId('challenge-briefing')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();

    expect(results.violations.filter(v => v.impact === 'critical')).toHaveLength(0);

    await dismissChallengeBriefing(page);
    await expect(page.getByTestId('level-card-1')).toBeVisible();
  });
});
