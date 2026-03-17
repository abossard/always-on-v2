import { test, expect } from '@playwright/test';

test.describe('Level 13: Needle Haystack — Automation selects the hidden safe clause', () => {
  test('finds the correct clause using the hidden correctness marker', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await page.getByTestId('level-link-13').click();

    const clauses = page.locator('[data-testid^="needle-clause-"]');
    await expect(clauses.first()).toBeVisible();

    const count = await clauses.count();
    let found = false;
    for (let index = 0; index < count; index++) {
      const clause = clauses.nth(index);
      if (await clause.getAttribute('data-is-correct') === 'true') {
        await clause.click();
        found = true;
        break;
      }
    }

    expect(found).toBe(true);
    await expect(page.getByTestId('level13-result')).toContainText('Automation found');
  });
});