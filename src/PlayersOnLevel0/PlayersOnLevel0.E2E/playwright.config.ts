import { defineConfig, devices } from '@playwright/test';

// Aspire injects service URLs as env vars via WithReference()
// Format: services__<name>__<scheme>__<index>
const webUrl = process.env.services__web__http__0 || 'http://localhost:5173';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: webUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // No webServer — Aspire manages Vite + API + Cosmos lifecycle
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
