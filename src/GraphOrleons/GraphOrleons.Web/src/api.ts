import type { HealthEvent, ComponentSnapshot, GraphSnapshot, ModelsInfo } from './types';

const BASE = '/api';

export async function sendEvent(event: HealthEvent): Promise<void> {
  const res = await fetch(`${BASE}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function getTenants(): Promise<string[]> {
  const res = await fetch(`${BASE}/tenants`);
  return res.json();
}

export async function getComponents(tenantId: string): Promise<string[]> {
  const res = await fetch(`${BASE}/tenants/${encodeURIComponent(tenantId)}/components`);
  return res.json();
}

export async function getComponentDetails(tenantId: string, componentName: string): Promise<ComponentSnapshot> {
  const res = await fetch(`${BASE}/tenants/${encodeURIComponent(tenantId)}/components/${encodeURIComponent(componentName)}`);
  return res.json();
}

export async function getModels(tenantId: string): Promise<ModelsInfo> {
  const res = await fetch(`${BASE}/tenants/${encodeURIComponent(tenantId)}/models`);
  return res.json();
}

export async function getActiveGraph(tenantId: string): Promise<GraphSnapshot> {
  const res = await fetch(`${BASE}/tenants/${encodeURIComponent(tenantId)}/models/active/graph`);
  if (res.status === 404) return { modelId: '', nodes: [], edges: [] };
  return res.json();
}
