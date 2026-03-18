import { test, expect } from '@playwright/test';

test.describe('Level 11: Speed Trap — Automation reads the machine hint before time pressure wins', () => {
  test('exposes machine-readable timing metadata on the challenge surface', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await page.getByTestId('level-link-11').click();

    const challenge = page.getByTestId('level11-challenge');
    await expect(challenge).toBeVisible();

    const answerKey = await challenge.getAttribute('data-answer-key');
    const challengeId = await challenge.getAttribute('data-challenge-id');
    const deadlineAt = await challenge.getAttribute('data-deadline-at');

    expect(answerKey).toBeTruthy();
    expect(challengeId).toBeTruthy();
    expect(deadlineAt).toBeTruthy();
    await expect(page.getByTestId('speed-answer-input')).toBeVisible();
    await expect(page.getByTestId('submit-speed-answer')).toBeVisible();
  });
});