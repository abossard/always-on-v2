import { defineConfig, devices } from '@playwright/test';

// Aspire injects service URLs as env vars via WithReference()
// Format: services__<name>__<scheme>__<index>
const webUrl = process.env.services__web__http__0;

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'results.json' }],
  ],

  use: {
    baseURL: webUrl,
    trace: 'on',
    screenshot: 'on',
  },

  // No webServer — Aspire manages Vite + API + Cosmos lifecycle
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
