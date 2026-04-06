import { defineConfig } from '@playwright/test';

const baseURL = process.env.services__web__http__0 ?? 'http://localhost:4200';
const productionURL = process.env.PRODUCTION_URL ?? 'https://agents.alwayson.actor';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  projects: [
    {
      name: 'local',
      use: { baseURL, trace: 'on', screenshot: 'on' },
    },
    {
      name: 'production',
      use: { baseURL: productionURL, trace: 'on', screenshot: 'on' },
      grep: /@smoke/,
      retries: 1,
    },
  ],
});
