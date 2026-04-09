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
  test('page loads with studio controls and informative panels', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('GraphOrleons topology explorer');
    await expect(page.getByTestId('topology-studio')).toBeVisible();
    await expect(page.getByTestId('source-mode-demo')).toBeVisible();
    await expect(page.getByTestId('view-variant-atlas')).toBeVisible();
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

  test('visual variants can be compared after seeding a deterministic scenario', async ({ page }) => {
    const tenant = `compare-${Date.now()}`;
    await page.goto('/');

    const tenantInput = page.getByTestId('event-tenant-input');
    await tenantInput.clear();
    await tenantInput.fill(tenant);

    await page.getByTestId('seed-scenario-checkout').click();
    await expect(page.getByTestId('event-status')).toContainText('Seeded Checkout Flow', { timeout: 15000 });
    await waitForTenant(page, tenant);

    await page.getByTestId('source-mode-live').click();
    await page.getByTestId('tenant-selector').selectOption(tenant);
    await page.getByTestId('refresh-live').click();
    await expect(page.getByTestId('selected-node-panel')).toContainText('impact', { timeout: 15000 });

    const graphCanvas = page.getByTestId('graph-canvas');
    await expect(graphCanvas).toBeVisible();

    const getCheckoutBox = async () => {
      const box = await page.locator('[data-node-label="checkout-api"]').first().boundingBox();
      expect(box).not.toBeNull();
      return box!;
    };

    await page.getByTestId('view-variant-atlas').click();
    await page.waitForTimeout(1200);
    const atlasBox = await getCheckoutBox();
    await graphCanvas.screenshot({ path: test.info().outputPath('atlas-live.png') });

    await page.getByTestId('view-variant-lanes').click();
    await page.waitForTimeout(1200);
    const lanesBox = await getCheckoutBox();
    await graphCanvas.screenshot({ path: test.info().outputPath('lanes-live.png') });

    await page.getByTestId('view-variant-orbit').click();
    await page.waitForTimeout(1200);
    const orbitBox = await getCheckoutBox();
    await graphCanvas.screenshot({ path: test.info().outputPath('orbit-live.png') });

    expect(Math.abs(atlasBox.y - lanesBox.y)).toBeGreaterThan(20);
    expect(Math.abs(atlasBox.x - orbitBox.x) + Math.abs(atlasBox.y - orbitBox.y)).toBeGreaterThan(30);
    await expect(page.getByTestId('comparison-sidebar')).toContainText('Switch variants');
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

  test('demo scenarios switch cleanly and produce screenshots', async ({ page }) => {
    await page.goto('/');

    await page.getByTestId('source-mode-demo').click();
    await page.getByTestId('scenario-incident').click();
    await page.getByTestId('view-variant-orbit').click();
    await expect(page.getByTestId('group-summary-panel')).toContainText('Experience');
    await page.getByTestId('graph-canvas').screenshot({ path: test.info().outputPath('incident-orbit-demo.png') });

    await page.getByTestId('scenario-release').click();
    await page.getByTestId('view-variant-lanes').click();
    await expect(page.getByTestId('selected-node-panel')).toContainText('depth');
    await page.getByTestId('graph-canvas').screenshot({ path: test.info().outputPath('release-lanes-demo.png') });
  });
});
