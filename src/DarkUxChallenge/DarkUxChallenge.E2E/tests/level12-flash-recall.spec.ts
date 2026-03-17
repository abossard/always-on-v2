import { test, expect } from '@playwright/test';

test.describe('Level 12: Flash Recall — Automation reads the hidden memory token', () => {
  test('solves the disappearing token via DOM metadata', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await page.getByTestId('level-link-12').click();

    const challenge = page.getByTestId('level12-challenge');
    await expect(challenge).toBeVisible();

    const answerKey = await challenge.getAttribute('data-answer-key');
    expect(answerKey).toBeTruthy();

    await page.getByTestId('flash-answer-input').fill(answerKey!);
    await page.getByTestId('submit-flash-answer').click();

    await expect(page.getByTestId('level12-result')).toContainText('remembered instantly');
  });
});