import { test, expect } from '@playwright/test';

test.describe('Level 11: Speed Trap — Automation reads the machine hint before time pressure wins', () => {
  test('solves the timed prompt via hidden DOM metadata', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await page.getByTestId('level-link-11').click();

    const challenge = page.getByTestId('level11-challenge');
    await expect(challenge).toBeVisible();

    const answerKey = await challenge.getAttribute('data-answer-key');
    const challengeId = await challenge.getAttribute('data-challenge-id');

    expect(answerKey).toBeTruthy();
    expect(challengeId).toBeTruthy();

    await page.getByTestId('speed-answer-input').fill(answerKey!);
    await page.getByTestId('submit-speed-answer').click();

    const result = page.getByTestId('level11-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('beat the clock');
  });
});