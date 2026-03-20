import { test, expect } from '@playwright/test';

const apiBaseURL = process.env.services__api__http__0 ?? 'http://localhost:5100';

test.describe('HelloAgents Web UI', () => {
  test('chat page loads with CopilotKit', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-test-id="copilot-chat-ready"]')).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('.copilotKitSidebar')).toBeVisible();
  });

  test('agent replies with server time', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');

    // Wait for CopilotKit to be ready
    await expect(page.locator('[data-test-id="copilot-chat-ready"]')).toBeAttached({ timeout: 15_000 });

    // Open the sidebar if collapsed
    const window = page.locator('.copilotKitWindow');
    if (!(await window.isVisible())) {
      await page.locator('.copilotKitButton').click();
      await expect(window).toBeVisible({ timeout: 5_000 });
    }

    // Send a message that triggers the GetServerTime tool
    const input = page.locator('textarea[placeholder="Type a message..."]');
    await input.fill('What time is it?');
    await page.keyboard.press('Enter');

    // The agent should call GetServerTime and respond with a timestamp
    const lastReply = page.locator('.copilotKitAssistantMessage').last();
    await expect(lastReply).toContainText(/\d{1,2}:\d{2}/, { timeout: 60_000 });
  });
});

test.describe('HelloAgents API (direct)', () => {
  test('health endpoint returns 200', async ({ request }) => {
    const response = await request.get(`${apiBaseURL}/health`);
    expect(response.status()).toBe(200);
  });
});
