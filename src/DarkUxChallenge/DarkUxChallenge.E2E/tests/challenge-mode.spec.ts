import { test, expect } from '@playwright/test';
import { enterLevel, startChallenge } from '../navigation';

test.describe('Challenge Mode', () => {
  test('adds route friction before a level becomes interactive', async ({ page }) => {
    await startChallenge(page);

    await expect(page.getByTestId('hardened-mode-banner')).toBeVisible();
    await expect(page.getByTestId('hardened-hub-note')).toBeVisible();
    await expect(page).toHaveURL((url) => /^\/[0-9a-f-]{36}$/.test(url.pathname));

    await enterLevel(page, 11);

    const challenge = page.getByTestId('level11-challenge');
    await expect(challenge).toBeVisible();
    await expect(page.getByTestId('speed-answer-input')).toBeVisible();
    await expect(page.getByTestId('submit-speed-answer')).toBeVisible();

    const answerKey = await challenge.getAttribute('data-answer-key');
    const challengeId = await challenge.getAttribute('data-challenge-id');
    expect(answerKey).toBeTruthy();
    expect(challengeId).toBeTruthy();
  });
});