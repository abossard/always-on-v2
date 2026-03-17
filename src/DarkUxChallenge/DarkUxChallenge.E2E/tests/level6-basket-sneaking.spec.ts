import { test, expect } from '@playwright/test';

test.describe('Level 6: Basket Sneaking — Automation detects items added without consent', () => {
  test('adds item, detects sneaked items after checkout, removes them', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await page.getByTestId('level-link-6').click();

    // Add a product to the cart
    await page.getByTestId('add-headphones').click();

    // Proceed to checkout — this sneaks items into the cart
    const checkoutBtn = page.getByTestId('checkout-button');
    await expect(checkoutBtn).toBeVisible();
    await checkoutBtn.click();

    // Wait for sneaked items to appear in the cart after checkout
    const sneakedItems = page.locator('[data-testid^="sneaked-item-"]');
    await expect(sneakedItems.first()).toBeVisible({ timeout: 5000 });
    const sneakedCount = await sneakedItems.count();
    expect(sneakedCount).toBeGreaterThan(0);

    // Remove all sneaked items
    for (let i = sneakedCount - 1; i >= 0; i--) {
      const sneakedItem = sneakedItems.nth(i);
      const testId = await sneakedItem.getAttribute('data-testid');
      const itemId = testId!.replace('sneaked-item-', '');
      await page.getByTestId(`remove-${itemId}`).click();
      // Wait for the item to be removed from the DOM
      await expect(page.getByTestId(`sneaked-item-${itemId}`)).toBeHidden({ timeout: 5000 }).catch(() => {
        // Item may have been removed entirely from DOM
      });
    }

    // Verify only user-added items remain
    const remainingSneaked = page.locator('[data-testid^="sneaked-item-"]');
    await expect(remainingSneaked).toHaveCount(0);

    // Confirm purchase with clean cart
    await page.getByTestId('confirm-purchase').click();

    // Verify result
    const result = page.getByTestId('level6-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('caught all the sneaked items');
  });
});
