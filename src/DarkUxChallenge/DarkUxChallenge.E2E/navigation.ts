import { expect, type Page } from '@playwright/test';

async function dismissChallengeBriefing(page: Page) {
  await expect(page.getByTestId('challenge-briefing')).toBeVisible();
  await page.getByTestId('challenge-acknowledge').check();
  await expect(page.getByTestId('dismiss-challenge-briefing')).toBeEnabled({ timeout: 3000 });
  await page.getByTestId('dismiss-challenge-briefing').click();
  await expect(page.getByTestId('challenge-sync-curtain')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('challenge-sync-curtain')).toBeHidden({ timeout: 3000 });
}

export async function startChallenge(page: Page) {
  await page.goto('/');
  await page.getByTestId('start-challenge').click();
  await dismissChallengeBriefing(page);
}

export async function enterLevel(page: Page, level: number) {
  const link = page.getByTestId(`level-link-${level}`);
  await link.click();
  await expect(link).toContainText('Confirm entry');
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/levels/${level}$`));
  await dismissChallengeBriefing(page);
}
