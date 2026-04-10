# ADR-0043: Accessibility-First Selectors for E2E Testing

**Status:** Decided

## Context
- Playwright E2E tests need a resilient, meaningful DOM selector strategy
- Traditional CSS/XPath/`data-testid` selectors couple tests to implementation details
- Playwright natively provides accessibility-tree queries (`getByRole`, `getByLabel`, etc.)

## Decision
- **Priority order:** `getByRole` → `getByLabel` → `getByText` → `getByPlaceholder` → `getByTestId` (escape hatch) → CSS/XPath (forbidden)
- Every E2E test suite must include an **axe-core accessibility audit** (`@axe-core/playwright`)
- `getByTestId` requires a code comment explaining why no accessible attribute exists

## Consequences
- Tests break when accessibility regresses — catches real bugs
- Resilient to CSS/DOM refactors (targets semantic meaning)
- Requires proper semantic HTML and ARIA labels in frontends

## Links
- [Playwright Locators](https://playwright.dev/docs/locators)
- [Testing Library Query Priority](https://testing-library.com/docs/queries/about/#priority)
- [axe-core Playwright](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright)
