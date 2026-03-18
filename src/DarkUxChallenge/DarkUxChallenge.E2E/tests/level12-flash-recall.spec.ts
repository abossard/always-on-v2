import { test, expect } from '@playwright/test';

test.describe('Level 12: Flash Recall — Automation reads the hidden memory token', () => {
  test('exposes the hidden token metadata without submitting the challenge', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await page.getByTestId('level-link-12').click();

    const challenge = page.getByTestId('level12-challenge');
    await expect(challenge).toBeVisible();

    const answerKey = await challenge.getAttribute('data-answer-key');
    const challengeId = await challenge.getAttribute('data-challenge-id');
    expect(answerKey).toBeTruthy();
    expect(challengeId).toBeTruthy();
    await expect(page.getByTestId('flash-answer-input')).toBeVisible();
    await expect(page.getByTestId('submit-flash-answer')).toBeVisible();
  });
});