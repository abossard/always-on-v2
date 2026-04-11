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
  }, { timeout: 15000 }).toContain(tenant);
}

test.describe('GraphOrleons SPA — SSE-driven', () => {

  // ── Page load & empty states ──

  test('page loads with header and tenant selector', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Hospital Instrument Monitor');
    await expect(page.getByTestId('tenant-selector')).toBeVisible();
    await expect(page.getByTestId('empty-state')).toContainText('Choose a ward');
  });

  test('deselecting tenant shows empty state again', async ({ page }) => {
    const tenant = `e2e-desel-${Date.now()}`;
    await postEvent({ tenant, component: 'a/b', payload: { impact: 'None' } });
    await waitForTenant(page, tenant);
    await page.getByTestId('tenant-selector').selectOption(tenant);
    await expect(page.getByTestId('graph-view')).toBeVisible();
    await page.getByTestId('tenant-selector').selectOption('');
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });

  // ── SSE initial dump ──

  test('SSE delivers initial model on tenant selection', async ({ page }) => {
    const tenant = `e2e-init-${Date.now()}`;
    // Pre-seed: 2 nodes + 1 edge
    await postEvent({ tenant, component: 'monitor/pump', payload: { impact: 'Full' } });
    await postEvent({ tenant, component: 'monitor', payload: { status: 'online', temp: '36.5' } });
    await postEvent({ tenant, component: 'pump', payload: { status: 'online', flow: '120' } });

    await waitForTenant(page, tenant);
    await page.getByTestId('tenant-selector').selectOption(tenant);

    // SSE should deliver the initial model without any polling
    await expect(page.getByTestId('connection-status')).toContainText('Live', { timeout: 10000 });
    await expect(page.getByTestId('current-model')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('instrument-count')).toContainText('2');
    await expect(page.getByTestId('connection-count')).toContainText('1');
    await expect(page.getByTestId('tree-view')).toBeVisible();
  });

  test('SSE delivers initial component payloads', async ({ page }) => {
    const tenant = `e2e-payload-${Date.now()}`;
    await postEvent({ tenant, component: 'sensor/actuator', payload: { impact: 'Partial' } });
    await postEvent({ tenant, component: 'sensor', payload: { temp: '37.1', battery: '85' } });

    await waitForTenant(page, tenant);
    await page.getByTestId('tenant-selector').selectOption(tenant);
    await expect(page.getByTestId('connection-status')).toContainText('Live', { timeout: 10000 });
    await expect(page.getByTestId('current-model')).toBeVisible({ timeout: 10000 });

    // Switch to list view to see inline payloads
    await page.getByText('📋 List').click();
    await expect(page.getByTestId('instrument-list')).toBeVisible();

    // sensor should have inline properties visible
    const sensorItem = page.getByTestId('instrument-item').filter({ hasText: 'sensor' }).first();
    await expect(sensorItem.getByTestId('inline-props')).toBeVisible({ timeout: 5000 });
  });

  // ── SSE streaming updates ──

  test('new model edges arrive via SSE without page reload', async ({ page }) => {
    const tenant = `e2e-stream-model-${Date.now()}`;
    // Start with one edge
    await postEvent({ tenant, component: 'ventilator/pump', payload: { impact: 'Full' } });
    await postEvent({ tenant, component: 'ventilator', payload: { status: 'online' } });

    await waitForTenant(page, tenant);
    await page.getByTestId('tenant-selector').selectOption(tenant);
    await expect(page.getByTestId('connection-status')).toContainText('Live', { timeout: 10000 });
    await expect(page.getByTestId('current-model')).toBeVisible({ timeout: 10000 });

    // Verify initial state: 2 nodes, 1 edge
    await expect(page.getByTestId('instrument-count')).toContainText('2');
    await expect(page.getByTestId('connection-count')).toContainText('1');

    // Now add a second edge — SSE should deliver the update
    await postEvent({ tenant, component: 'pump/alarm', payload: { impact: 'Partial' } });

    // Wait for the model update to stream through
    await expect(page.getByTestId('instrument-count')).toContainText('3', { timeout: 15000 });
    await expect(page.getByTestId('connection-count')).toContainText('2', { timeout: 15000 });
  });

  test('component payload updates arrive via SSE', async ({ page }) => {
    const tenant = `e2e-stream-comp-${Date.now()}`;
    await postEvent({ tenant, component: 'ecg/monitor', payload: { impact: 'None' } });
    await postEvent({ tenant, component: 'ecg', payload: { heartRate: '72' } });

    await waitForTenant(page, tenant);
    await page.getByTestId('tenant-selector').selectOption(tenant);
    await expect(page.getByTestId('connection-status')).toContainText('Live', { timeout: 10000 });
    await expect(page.getByTestId('current-model')).toBeVisible({ timeout: 10000 });

    // Switch to list view
    await page.getByText('📋 List').click();
    const ecgItem = page.getByTestId('instrument-item').filter({ hasText: 'ecg' }).first();
    await expect(ecgItem.getByTestId('inline-props')).toContainText('heartRate=72', { timeout: 10000 });

    // Send an updated payload — heartRate changes
    await postEvent({ tenant, component: 'ecg', payload: { heartRate: '88' } });

    // The updated value should arrive via SSE
    await expect(ecgItem.getByTestId('inline-props')).toContainText('heartRate=88', { timeout: 15000 });
  });

  // ── View switching ──

  test('tree and list views both work and can switch', async ({ page }) => {
    const tenant = `e2e-views-${Date.now()}`;
    await postEvent({ tenant, component: 'a/b', payload: { impact: 'Partial' } });
    await postEvent({ tenant, component: 'a', payload: { x: '1' } });
    await postEvent({ tenant, component: 'b', payload: { y: '2' } });

    await waitForTenant(page, tenant);
    await page.getByTestId('tenant-selector').selectOption(tenant);
    await expect(page.getByTestId('current-model')).toBeVisible({ timeout: 10000 });

    // Default is tree
    await expect(page.getByTestId('tree-view')).toBeVisible();
    await expect(page.getByTestId('view-switcher')).toBeVisible();

    // Switch to list
    await page.getByText('📋 List').click();
    await expect(page.getByTestId('instrument-list')).toBeVisible();
    await expect(page.getByTestId('instrument-item')).toHaveCount(2);

    // Switch back to tree
    await page.getByText('🌳 Tree').click();
    await expect(page.getByTestId('tree-view')).toBeVisible();
  });

  // ── Empty tenant ──

  test('tenant with no relationships shows empty model', async ({ page }) => {
    const tenant = `e2e-empty-${Date.now()}`;
    await postEvent({ tenant, component: 'lonely', payload: { x: 1 } });

    await waitForTenant(page, tenant);
    await page.getByTestId('tenant-selector').selectOption(tenant);

    // No relationships → no model edges/nodes in graph → empty model
    await expect(page.getByTestId('empty-model')).toBeVisible({ timeout: 15000 });
  });

  // ── Graph grows live ──

  test('graph grows from 0 to populated via SSE', async ({ page }) => {
    const tenant = `e2e-grow-${Date.now()}`;
    // Create tenant with only a plain component (no graph)
    await postEvent({ tenant, component: 'seed', payload: { v: 1 } });

    await waitForTenant(page, tenant);
    await page.getByTestId('tenant-selector').selectOption(tenant);
    await expect(page.getByTestId('connection-status')).toContainText('Live', { timeout: 10000 });

    // Initially empty model
    await expect(page.getByTestId('empty-model')).toBeVisible({ timeout: 10000 });

    // Now send a relationship — graph should appear via SSE
    await postEvent({ tenant, component: 'alpha/beta', payload: { impact: 'Full' } });

    // The model should appear without page reload
    await expect(page.getByTestId('current-model')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('instrument-count')).toContainText('2', { timeout: 15000 });
  });

  // ── Multi-tenant isolation & subscription switching ──

  test('only receives events from the subscribed tenant, not other tenants', async ({ page }) => {
    const tenantA = `e2e-iso-a-${Date.now()}`;
    const tenantB = `e2e-iso-b-${Date.now()}`;

    // Seed both tenants with different graphs
    await postEvent({ tenant: tenantA, component: 'heart-monitor/pump-a', payload: { impact: 'Full' } });
    await postEvent({ tenant: tenantA, component: 'heart-monitor', payload: { ward: 'ICU' } });
    await postEvent({ tenant: tenantB, component: 'ventilator/alarm-b', payload: { impact: 'Partial' } });
    await postEvent({ tenant: tenantB, component: 'ventilator', payload: { ward: 'OR' } });

    // Collect console logs to verify subscribe/unsubscribe
    const consoleLogs: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('[SSE]')) consoleLogs.push(msg.text());
    });

    // Go to page, wait for both tenants
    await waitForTenant(page, tenantA);
    await waitForTenant(page, tenantB);

    // Select tenant A
    await page.getByTestId('tenant-selector').selectOption(tenantA);
    await expect(page.getByTestId('connection-status')).toContainText('Live', { timeout: 10000 });
    await expect(page.getByTestId('current-model')).toBeVisible({ timeout: 10000 });

    // Verify we see tenant A's data (heart-monitor, pump-a)
    await expect(page.getByTestId('instrument-count')).toContainText('2');
    await page.getByText('📋 List').click();
    await expect(page.getByTestId('instrument-list')).toBeVisible();
    const listTextA = await page.getByTestId('instrument-list').textContent();
    expect(listTextA).toContain('heart-monitor');
    expect(listTextA).toContain('pump-a');
    // Must NOT contain tenant B's nodes
    expect(listTextA).not.toContain('ventilator');
    expect(listTextA).not.toContain('alarm-b');

    // Now send an event to tenant B while subscribed to A
    await postEvent({ tenant: tenantB, component: 'ventilator', payload: { ward: 'ER', extra: 'new' } });
    // Wait a moment to ensure the event has had time to route
    await page.waitForTimeout(2000);

    // Tenant A's model should NOT have changed — still 2 instruments
    await expect(page.getByTestId('instrument-count')).toContainText('2');
    const listTextA2 = await page.getByTestId('instrument-list').textContent();
    expect(listTextA2).not.toContain('ventilator');

    // Verify console log shows subscribe to A
    expect(consoleLogs.some(l => l.includes(`Subscribing`) && l.includes(tenantA))).toBe(true);

    // ── Switch to tenant B ──
    await page.getByText('🌳 Tree').click(); // back to tree for variety
    await page.getByTestId('tenant-selector').selectOption(tenantB);
    await expect(page.getByTestId('connection-status')).toContainText('Live', { timeout: 10000 });
    await expect(page.getByTestId('current-model')).toBeVisible({ timeout: 10000 });

    // Verify we now see tenant B's data
    await expect(page.getByTestId('instrument-count')).toContainText('2');
    await page.getByText('📋 List').click();
    const listTextB = await page.getByTestId('instrument-list').textContent();
    expect(listTextB).toContain('ventilator');
    expect(listTextB).toContain('alarm-b');
    // Must NOT contain tenant A's nodes
    expect(listTextB).not.toContain('heart-monitor');
    expect(listTextB).not.toContain('pump-a');

    // Verify console logs show unsubscribe from A and subscribe to B
    expect(consoleLogs.some(l => l.includes('Unsubscribing') && l.includes(tenantA))).toBe(true);
    expect(consoleLogs.some(l => l.includes('Subscribing') && l.includes(tenantB))).toBe(true);
  });

  test('switching tenants receives live updates only from the new tenant', async ({ page }) => {
    const tenantX = `e2e-switch-x-${Date.now()}`;
    const tenantY = `e2e-switch-y-${Date.now()}`;

    // Seed tenant X
    await postEvent({ tenant: tenantX, component: 'x-sensor/x-relay', payload: { impact: 'None' } });
    // Seed tenant Y
    await postEvent({ tenant: tenantY, component: 'y-probe/y-display', payload: { impact: 'Full' } });

    await waitForTenant(page, tenantX);
    await waitForTenant(page, tenantY);

    // Subscribe to X first
    await page.getByTestId('tenant-selector').selectOption(tenantX);
    await expect(page.getByTestId('connection-status')).toContainText('Live', { timeout: 10000 });
    await expect(page.getByTestId('current-model')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('instrument-count')).toContainText('2');

    // Switch to Y
    await page.getByTestId('tenant-selector').selectOption(tenantY);
    await expect(page.getByTestId('connection-status')).toContainText('Live', { timeout: 10000 });
    await expect(page.getByTestId('current-model')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('instrument-count')).toContainText('2');

    // Send a live update to Y — should arrive
    await postEvent({ tenant: tenantY, component: 'y-probe/y-alarm', payload: { impact: 'Partial' } });
    await expect(page.getByTestId('instrument-count')).toContainText('3', { timeout: 15000 });

    // Send a live update to X — should NOT affect Y's display
    await postEvent({ tenant: tenantX, component: 'x-sensor/x-backup', payload: { impact: 'Partial' } });
    await page.waitForTimeout(2000);
    // Still 3 instruments (Y's count), not affected by X's update
    await expect(page.getByTestId('instrument-count')).toContainText('3');
  });
});
