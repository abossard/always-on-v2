import { test, expect } from '@playwright/test';

const apiBaseURL = process.env.services__api__http__0 ?? 'http://localhost:5100';

test.describe('HelloAgents Web UI', () => {
  test('chat page loads with CopilotKit', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-test-id="copilot-chat-ready"]')).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('.copilotKitSidebar')).toBeVisible();
  });

  test('real conversation with agent', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');

    // Wait for CopilotKit to be ready
    await expect(page.locator('[data-test-id="copilot-chat-ready"]')).toBeAttached({ timeout: 15_000 });

    // Open the sidebar if it's collapsed (click the toggle button)
    const window = page.locator('.copilotKitWindow');
    if (!(await window.isVisible())) {
      await page.locator('.copilotKitButton').click();
      await expect(window).toBeVisible({ timeout: 5_000 });
    }

    // Type a message in the chat input
    const input = page.locator('textarea[placeholder="Type a message..."]');
    await input.fill('What is the current server time?');
    await page.keyboard.press('Enter');

    // Wait for an assistant response message to appear with content
    const assistantMessage = page.locator('.copilotKitAssistantMessage').last();
    await expect(assistantMessage).toContainText(/time|UTC|server|current|\d{2}:\d{2}/i, {
      timeout: 60_000,
    });
  });
});

test.describe('HelloAgents API (direct)', () => {
  test('health endpoint returns 200', async ({ request }) => {
    const response = await request.get(`${apiBaseURL}/health`);
    expect(response.status()).toBe(200);
  });

  test('ask endpoint rejects empty message', async ({ request }) => {
    const response = await request.post(`${apiBaseURL}/api/ask`, {
      data: { message: '' },
    });
    expect(response.status()).toBe(400);
  });
});
