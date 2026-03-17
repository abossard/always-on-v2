import { defineConfig, devices } from '@playwright/test';

const webUrl = process.env.services__web__http__0;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: webUrl,
    trace: 'on',
    screenshot: 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
