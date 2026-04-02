# ADR-0043: Accessibility-First Selectors for E2E Testing

## Status
Accepted

## Context
We are introducing Playwright E2E tests for the Level0 React frontend. A core decision is how tests locate elements in the DOM. The selector strategy directly impacts test stability (resilience to UI refactors), readability, and — crucially — whether our tests implicitly enforce accessibility.

Traditional approaches use CSS selectors (`.btn-primary`), XPath, or `data-testid` attributes. These couple tests to implementation details: class names change during redesigns, DOM structure shifts during refactors, and `data-testid` attributes exist solely for testing — they tell you nothing about whether the app is actually usable.

Playwright (since v1.27) natively provides Testing Library–style queries that interrogate the **accessibility tree** rather than the DOM structure: `getByRole`, `getByLabel`, `getByText`, `getByPlaceholder`. The `playwright-testing-library` package is now archived because Playwright absorbed this functionality entirely.

## Decision
All Playwright E2E tests **must** use accessibility-first locators with the following priority:

1. **`getByRole`** — first choice for interactive elements (buttons, links, headings, inputs with ARIA roles). Matches how screen readers and assistive technology see the page.
2. **`getByLabel`** — for form controls associated with a `<label>`.
3. **`getByText`** — for unique visible text content.
4. **`getByPlaceholder`** — for inputs identified by placeholder text.
5. **`getByTestId`** — escape hatch only when no accessible attribute exists. Requires a code comment explaining why.
6. **CSS/XPath `locator()`** — forbidden unless explicitly approved in code review.

Additionally, every page-level E2E test suite must include an **axe-core accessibility audit** (`@axe-core/playwright`) to catch WCAG violations automatically.

## Alternatives Considered
- **`data-testid` as primary strategy** — Stable against DOM changes but invisible to users and assistive technology. Tests pass even when the app is inaccessible. Adds testing-only attributes that pollute production markup.
- **CSS selectors** — Brittle. A CSS framework upgrade or design system change breaks every test. No accessibility benefit.
- **Testing Library as a separate package** — The `playwright-testing-library` npm package is archived. Playwright's native `getBy*` methods are the maintained replacement with identical semantics.

## Consequences
- **Positive**: Tests break when accessibility breaks — if a button loses its accessible name, the test fails, catching a real bug. Tests are resilient to CSS/DOM refactors since they target semantic meaning, not structure. Test code reads like user intent (`getByRole('button', { name: 'Save' })`) making it reviewable by non-developers.
- **Negative**: Requires the React frontend to have proper semantic HTML, ARIA labels, and associated labels on form controls. Components with poor accessibility will be harder to test — this is by design, as it forces fixes.

## References
- [Playwright: Migrating from Testing Library](https://playwright.dev/docs/testing-library)
- [Playwright: Locators](https://playwright.dev/docs/locators)
- [Playwright: Best Practices](https://playwright.dev/docs/best-practices)
- [Testing Library: Priority of Queries](https://testing-library.com/docs/queries/about/#priority)
- [axe-core Playwright integration](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright)
