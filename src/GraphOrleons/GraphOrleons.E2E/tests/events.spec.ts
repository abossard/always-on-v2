import { test, expect } from '@playwright/test';

const apiUrl = process.env.API_URL || 'http://localhost:5201';

async function postEvent(event: { tenant: string; component: string; payload: Record<string, unknown> }) {
  const response = await fetch(`${apiUrl}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });

  expect(response.ok).toBeTruthy();
}

async function waitForTenant(page: Parameters<Parameters<typeof test.describe>[1]>[0]['page'], tenant: string) {
  await page.goto('/');

  await expect.poll(async () => {
    return page.getByTestId('tenant-selector').locator('option').allTextContents();
  }, {
    timeout: 15000,
  }).toContain(tenant);
}

test.describe('GraphOrleons SPA', () => {
  test('page loads with the live dependency tree and informative panels', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('GraphOrleons topology explorer');
    await expect(page.getByTestId('topology-studio')).toBeVisible();
    await expect(page.getByTestId('topology-studio')).toHaveAttribute('data-view-variant', 'atlas');
    await expect(page.getByTestId('comparison-sidebar')).toContainText('How to read this');
    await expect(page.getByTestId('selected-node-panel')).toContainText('Selected node');
  });

  test('event generator sends events and tenant appears', async ({ page }) => {
    await page.goto('/');

    const tenantInput = page.getByTestId('event-tenant-input');
    await tenantInput.clear();
    await tenantInput.fill('e2e-test');

    await page.getByTestId('send-random-event').click();
    await expect(page.getByTestId('event-status')).toContainText('Sent to', { timeout: 15000 });
    await waitForTenant(page, 'e2e-test');
  });

  test('component list shows after selecting tenant', async ({ page }) => {
    const tenant = `e2e-${Date.now()}`;
    await postEvent({ tenant, component: 'web-svc', payload: { status: 'ok' } });
    await postEvent({ tenant, component: 'db-svc', payload: { status: 'ok' } });

    await page.goto('/');
    await waitForTenant(page, tenant);

    const selector = page.getByTestId('tenant-selector');
    await selector.selectOption(tenant);
    await expect(page.getByTestId('component-list-panel')).toContainText('web-svc', { timeout: 15000 });

    await expect(page.getByTestId('component-list-panel')).toContainText('Components');
    await expect(page.locator(`text=web-svc`)).toBeVisible();
  });

  test('live tree renders seeded topology and captures a screenshot', async ({ page }) => {
    const tenant = `compare-${Date.now()}`;
    await page.goto('/');

    const tenantInput = page.getByTestId('event-tenant-input');
    await tenantInput.clear();
    await tenantInput.fill(tenant);

    await page.getByTestId('seed-scenario-checkout').click();
    await expect(page.getByTestId('event-status')).toContainText('Seeded Checkout Flow', { timeout: 15000 });
    await waitForTenant(page, tenant);

    await page.getByTestId('tenant-selector').selectOption(tenant);
    await page.getByTestId('refresh-live').click();
    await expect(page.getByTestId('selected-node-panel')).toContainText('impact', { timeout: 15000 });

    const graphCanvas = page.getByTestId('graph-canvas');
    await expect(graphCanvas).toBeVisible();

    const orbitBox = await page.locator('[data-node-label="checkout-api"]').first().boundingBox();
    expect(orbitBox).not.toBeNull();
    expect(orbitBox!.width).toBeLessThan(230);
    await graphCanvas.screenshot({ path: test.info().outputPath('atlas-live.png') });

    await expect(page.getByTestId('comparison-sidebar')).toContainText('shared dependenc');
  });

  test('component details show payload on click', async ({ page }) => {
    const tenant = `e2e-detail-${Date.now()}`;
    await postEvent({ tenant, component: 'my-service', payload: { cpu: 42, status: 'healthy' } });

    await page.goto('/');
    await waitForTenant(page, tenant);

    const selector = page.getByTestId('tenant-selector');
    await selector.selectOption(tenant);
    await expect(page.getByTestId('component-list-panel')).toContainText('my-service', { timeout: 15000 });

    await page.click('text=my-service');

    await expect(page.locator('text=Total events')).toBeVisible();
    await expect(page.locator('text=History (1)')).toBeVisible();
  });
});
