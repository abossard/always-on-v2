import { test, expect, type Page } from '@playwright/test';

async function dismissChallengeBriefing(page: Page) {
  await expect(page.getByTestId('challenge-briefing')).toBeVisible();
  await page.getByTestId('challenge-acknowledge').check();
  await expect(page.getByTestId('dismiss-challenge-briefing')).toBeEnabled({ timeout: 3000 });
  await page.getByTestId('dismiss-challenge-briefing').click();
  await expect(page.getByTestId('challenge-sync-curtain')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('challenge-sync-curtain')).toBeHidden({ timeout: 3000 });
}

test.describe('Challenge Mode', () => {
  test('adds route friction but still allows automation to finish a level', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge-mode').click();

    await dismissChallengeBriefing(page);

    await expect(page.getByTestId('challenge-mode-banner')).toBeVisible();
    await expect(page.getByTestId('challenge-mode-hub-note')).toBeVisible();
    await expect(page).toHaveURL(/\/challenge\//);

    const level11Link = page.getByTestId('level-link-11');
    await level11Link.click();
    await expect(level11Link).toContainText('Confirm entry');
    await level11Link.click();

    await dismissChallengeBriefing(page);

    const challenge = page.getByTestId('level11-challenge');
    await expect(challenge).toBeVisible();

    const answerKey = await challenge.getAttribute('data-answer-key');
    expect(answerKey).toBeTruthy();

    await page.getByTestId('speed-answer-input').fill(answerKey!);
    await page.getByTestId('submit-speed-answer').click();

    await expect(page.getByTestId('level11-result')).toContainText('beat the clock');
  });
});