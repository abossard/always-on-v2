import { test, expect } from '@playwright/test';

test.describe('Level 2: Roach Motel — Automation navigates cancellation gauntlet', () => {
  test('subscribes with one click, then navigates all cancel steps', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await page.getByTestId('level-link-2').click();

    // Step 1: Subscribe (one click — easy!)
    await page.getByTestId('subscribe-button').click();

    // Step 2: Find the de-emphasized cancel button
    const cancelBtn = page.getByTestId('start-cancel-button');
    await expect(cancelBtn).toBeVisible();
    // Verify it's intentionally small/hidden
    const btnBox = await cancelBtn.boundingBox();
    expect(btnBox).toBeTruthy();

    await cancelBtn.click();

    // Step 3: Survey — pick any reason and continue
    const surveyStep = page.getByTestId('cancel-step-survey');
    await expect(surveyStep).toBeVisible();
    await page.getByTestId('option-too-expensive').click();

    // Step 4: Discount offer — decline it
    const discountStep = page.getByTestId('cancel-step-discount');
    await expect(discountStep).toBeVisible();
    await page.getByTestId('option-continue-cancellation').click();

    // Step 5: Final confirm — find the hidden cancel button
    const confirmStep = page.getByTestId('cancel-step-confirm');
    await expect(confirmStep).toBeVisible();

    // The actual cancel is a hidden, tiny button
    const hiddenCancel = page.getByTestId('hidden-cancel-confirm');
    await expect(hiddenCancel).toBeVisible();
    await hiddenCancel.click();

    // Verify cancellation succeeded
    const result = page.getByTestId('level2-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('escaped');
  });
});
