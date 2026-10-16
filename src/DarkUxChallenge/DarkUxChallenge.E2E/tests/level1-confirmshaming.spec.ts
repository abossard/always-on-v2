import { test, expect } from '@playwright/test';
import { enterLevel, startChallenge } from '../navigation';

test.describe('Level 1: Confirmshaming — Automation defeats guilt-trip', () => {
  test('identifies manipulative decline text and clicks it anyway', async ({ page }) => {
    await startChallenge(page);

    // Navigate to Level 1
    await enterLevel(page, 1);

    // Wait for the confirmshaming popup
    const popup = page.getByTestId('confirmshaming-popup');
    await expect(popup).toBeVisible();

    // Read the decline button text — automation has no emotional response
    const declineButton = page.getByTestId('decline-button');
    const declineText = await declineButton.getAttribute('data-decline-text');
    expect(declineText).toBeTruthy();
    expect(declineText!.length).toBeGreaterThan(10); // Manipulative text is always longer

    // Automation clicks decline without hesitation — no guilt!
    await declineButton.click();

    // Verify success
    const result = page.getByTestId('level1-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('resisted');
  });

  test('accept button is visually prominent (larger, colored)', async ({ page }) => {
    await startChallenge(page);
    await enterLevel(page, 1);

    const acceptBtn = page.getByTestId('accept-button');
    const declineBtn = page.getByTestId('decline-button');

    // Accept button should be larger than decline
    const acceptBox = await acceptBtn.boundingBox();
    const declineBox = await declineBtn.boundingBox();

    expect(acceptBox).toBeTruthy();
    expect(declineBox).toBeTruthy();
    expect(acceptBox!.height).toBeGreaterThan(declineBox!.height);
  });
});
