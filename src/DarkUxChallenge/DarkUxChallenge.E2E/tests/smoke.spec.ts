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

  test('API health endpoint responds', async ({ request }) => {
    const apiBase = process.env.services__api__http__0 || 'http://localhost:5000';
    const response = await request.get(`${apiBase}/health`);
    expect(response.ok()).toBeTruthy();
  });
});
