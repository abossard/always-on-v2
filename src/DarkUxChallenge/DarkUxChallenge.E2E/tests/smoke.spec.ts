import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('welcome page loads and has start button', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('start-challenge')).toBeVisible();
  });

  test('start challenge navigates to hub with level cards', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-challenge').click();
    await expect(page.getByTestId('level-card-1')).toBeVisible();
    await expect(page.getByTestId('level-card-2')).toBeVisible();
    await expect(page.getByTestId('level-card-3')).toBeVisible();
  });

  test('API health endpoint responds', async ({ baseURL, request }) => {
    // In CI, the API is proxied through the SPA's Vite dev server
    const response = await request.get(`${baseURL}/api/users/00000000-0000-0000-0000-000000000000`);
    // 404 = API is reachable (user doesn't exist, but the endpoint works)
    expect(response.status()).toBe(404);
  });
});
