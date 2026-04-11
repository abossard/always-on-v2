import { test, expect } from '@playwright/test';

test.describe('HelloOrleons API', () => {
  test('health check returns 200 @smoke', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.status()).toBe(200);
  });

  test('root page returns Scalar API docs @smoke', async ({ request }) => {
    const response = await request.get('/scalar/v1');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('scalar');
  });

  test('say hello returns name and count', async ({ request }) => {
    const name = `e2e-${Date.now()}`;

    const res1 = await request.get(`/hello/${name}`);
    expect(res1.status()).toBe(200);
    const data1 = await res1.json();
    expect(data1.name).toBe(name);
    expect(data1.count).toBe(1);

    const res2 = await request.get(`/hello/${name}`);
    const data2 = await res2.json();
    expect(data2.count).toBe(2);
  });

  test('different names have independent counters', async ({ request }) => {
    const name1 = `alice-${Date.now()}`;
    const name2 = `bob-${Date.now()}`;

    await request.get(`/hello/${name1}`);
    await request.get(`/hello/${name2}`);
    await request.get(`/hello/${name1}`);

    const res1 = await request.get(`/hello/${name1}`);
    const data1 = await res1.json();
    expect(data1.count).toBe(3);

    const res2 = await request.get(`/hello/${name2}`);
    const data2 = await res2.json();
    expect(data2.count).toBe(2);
  });
});
