import { useState, useEffect, useCallback, useRef } from 'react';
import { TenantSelector } from './components/TenantSelector';
import { GraphView } from './components/GraphView';
import { EventTools } from './components/EventTools';
import { PayloadSender } from './components/PayloadSender';
import { getTenants } from './api';
import type { GraphSnapshot, MergedProperty } from './types';

const BASE = '/api';

export default function App() {
  const [tenants, setTenants] = useState<string[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphSnapshot>({ modelId: '', components: [], edges: [] });
  const [componentPayloads, setComponentPayloads] = useState<Record<string, MergedProperty[]>>({});
  const [connected, setConnected] = useState(false);
  const [originRegion, setOriginRegion] = useState<string | null>(null);
  const [flashedComponents, setFlashedComponents] = useState<Set<string>>(new Set());
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch tenants on mount + after sending events
  const refreshTenants = useCallback(async () => {
    const t = await getTenants();
    setTenants(t);
  }, []);

  useEffect(() => { refreshTenants(); }, [refreshTenants]);

  // SSE subscription — connect when tenant is selected, disconnect on deselect
  useEffect(() => {
    if (!selectedTenant) {
      setGraph({ modelId: '', components: [], edges: [] });
      setComponentPayloads({});
      setConnected(false);
      setOriginRegion(null);
      return;
    }

    const url = `${BASE}/tenants/${encodeURIComponent(selectedTenant)}/stream`;
    console.log(`[SSE] Subscribing to tenant "${selectedTenant}" → ${url}`);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('origin', (e) => {
      if (e.data) setOriginRegion(e.data);
    });

    es.addEventListener('model', (e) => {
      const data = JSON.parse(e.data) as GraphSnapshot;
      console.log(`[SSE] model event: ${data.components.length} components, ${data.edges.length} edges`);
      setGraph(data);
    });

    es.addEventListener('component', (e) => {
      const data = JSON.parse(e.data) as { name: string; properties: MergedProperty[] };
      if (data.name) {
        console.log(`[SSE] component event: "${data.name}" (${data.properties?.length ?? 0} props)`);
        setComponentPayloads(prev => ({ ...prev, [data.name]: data.properties ?? [] }));
        setFlashedComponents(prev => new Set(prev).add(data.name));
        setTimeout(() => {
          setFlashedComponents(prev => {
            const next = new Set(prev);
            next.delete(data.name);
            return next;
          });
        }, 10000);
      }
    });

    es.addEventListener('ready', () => {
      console.log(`[SSE] Initial dump complete for "${selectedTenant}" — stream live`);
      setConnected(true);
    });

    es.onerror = () => {
      console.warn(`[SSE] Connection error for "${selectedTenant}"`);
      setConnected(false);
    };

    return () => {
      console.log(`[SSE] Unsubscribing from tenant "${selectedTenant}"`);
      es.close();
      eventSourceRef.current = null;
      setConnected(false);
    };
  }, [selectedTenant]);

  const handleSent = useCallback(() => {
    refreshTenants();
  }, [refreshTenants]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <div className="mx-auto flex min-h-screen w-full flex-col gap-5 px-6 py-6" data-testid="app-container">
        {/* Header */}
        <header className="rounded-xl border border-teal-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏥</span>
            <div>
              <h1 className="text-2xl font-bold text-teal-800">Hospital Instrument Monitor</h1>
              <p className="mt-0.5 text-sm text-gray-500">
                Real-time instrument telemetry via server-sent events
              </p>
            </div>
            {selectedTenant && (
              <span
                className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium ${
                  connected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}
                data-testid="connection-status"
                title={originRegion ? `Region: ${originRegion}` : undefined}
                data-region={originRegion ?? undefined}
              >
                {connected ? `● Live${originRegion ? ` (${originRegion})` : ''}` : '○ Connecting…'}
              </span>
            )}
          </div>
        </header>

        {/* Controls row */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <TenantSelector tenants={tenants} selected={selectedTenant} onSelect={setSelectedTenant} />
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <EventTools
              tenant={selectedTenant}
              components={graph.components}
              onSent={handleSent}
              onTenantUsed={(t) => { setSelectedTenant(t); }}
            />
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <PayloadSender
              tenant={selectedTenant}
              components={graph.components}
              onSent={handleSent}
            />
          </div>
        </div>

        {/* Main content */}
        <main className="min-h-0 flex-1">
          <GraphView graph={graph} selectedTenant={selectedTenant} componentPayloads={componentPayloads} flashedComponents={flashedComponents} />
        </main>
      </div>
    </div>
  );
}
