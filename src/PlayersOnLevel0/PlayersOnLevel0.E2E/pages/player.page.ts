import { type Locator, type Page } from '@playwright/test';

/**
 * Page object for the Player Progression UI.
 * All selectors use accessible queries (getByRole, getByLabel, getByText)
 * — no CSS, no XPath, no data-testid. This ensures:
 *   1. Tests are resilient to DOM/styling changes
 *   2. The app stays accessible (if tests pass, screen readers work)
 */
export class PlayerPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(playerId: string) {
    await this.page.goto(`/?player=${playerId}`);
  }

  // Accessible locators — mirrors how a real user finds elements
  heading(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  scoreInput(): Locator {
    return this.page.getByLabel(/score/i);
  }

  submitButton(): Locator {
    return this.page.getByRole('button', { name: /submit|save|add/i });
  }

  levelDisplay(): Locator {
    return this.page.getByText(/level/i);
  }

  playerName(): Locator {
    return this.page.getByText(/player/i);
  }
}
