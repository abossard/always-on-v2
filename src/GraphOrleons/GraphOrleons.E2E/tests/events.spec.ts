import { test, expect } from '@playwright/test';

test.describe('GraphOrleons SPA', () => {
  test('page loads with title and layout', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('GraphOrleons');
    await expect(page.locator('text=Select a tenant')).toBeVisible();
    await expect(page.locator('text=Send Event')).toBeVisible();
    await expect(page.locator('text=Send Relationship')).toBeVisible();
  });

  test('event generator sends events and tenant appears', async ({ page }) => {
    await page.goto('/');

    // Fill tenant name
    const tenantInput = page.locator('input').first();
    await tenantInput.clear();
    await tenantInput.fill('e2e-test');

    // Send an event
    await page.click('text=Send Event');
    await page.waitForTimeout(1000);

    // Verify tenant appears in selector
    const selector = page.locator('select');
    await page.waitForTimeout(2000);
    // Reload to pick up the new tenant
    await page.goto('/');
    await page.waitForTimeout(1000);
    const options = await selector.locator('option').allTextContents();
    expect(options.some(o => o.includes('e2e-test') || o.includes('demo-tenant'))).toBeTruthy();
  });

  test('component list shows after selecting tenant', async ({ page, request }) => {
    // Send events via API
    const tenant = `e2e-${Date.now()}`;
    await request.post('/api/events', {
      data: { tenant, component: 'web-svc', payload: { status: 'ok' } },
    });
    await request.post('/api/events', {
      data: { tenant, component: 'db-svc', payload: { status: 'ok' } },
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // Select the tenant
    const selector = page.locator('select');
    await selector.selectOption(tenant);
    await page.waitForTimeout(2000);

    // Verify components show up
    await expect(page.locator('text=Components')).toBeVisible();
    await expect(page.locator(`text=web-svc`)).toBeVisible();
  });

  test('graph view renders after relationship events', async ({ page, request }) => {
    const tenant = `e2e-graph-${Date.now()}`;
    // Send relationship event
    await request.post('/api/events', {
      data: { tenant, component: 'frontend/backend', payload: { impact: 'Full' } },
    });
    await request.post('/api/events', {
      data: { tenant, component: 'backend/database', payload: { impact: 'Partial' } },
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    const selector = page.locator('select');
    await selector.selectOption(tenant);
    await page.waitForTimeout(3000);

    // React Flow renders nodes - check for the canvas
    const reactFlow = page.locator('.react-flow');
    await expect(reactFlow).toBeVisible({ timeout: 5000 });
  });

  test('component details show payload on click', async ({ page, request }) => {
    const tenant = `e2e-detail-${Date.now()}`;
    await request.post('/api/events', {
      data: { tenant, component: 'my-service', payload: { cpu: 42, status: 'healthy' } },
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    const selector = page.locator('select');
    await selector.selectOption(tenant);
    await page.waitForTimeout(2000);

    // Click on component
    await page.click('text=my-service');
    await page.waitForTimeout(1000);

    // Should show payload details
    await expect(page.locator('text=Total events')).toBeVisible();
    await expect(page.locator('text=Latest payload')).toBeVisible();
  });

  test('send batch generates multiple events', async ({ page }) => {
    await page.goto('/');

    const tenantInput = page.locator('input').first();
    await tenantInput.clear();
    await tenantInput.fill('batch-test');

    await page.click('text=Send Batch');
    await page.waitForTimeout(3000);

    // Should show success status
    const status = page.locator('text=✓');
    await expect(status.first()).toBeVisible({ timeout: 10000 });
  });
});
