import { useState, useEffect, useCallback } from 'react';
import { TenantSelector } from './components/TenantSelector';
import { ComponentList } from './components/ComponentList';
import { GraphView } from './components/GraphView';
import { EventGenerator } from './components/EventGenerator';
import { getTenants, getComponents, getActiveGraph } from './api';
import type { GraphSnapshot } from './types';

export default function App() {
  const [tenants, setTenants] = useState<string[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [components, setComponents] = useState<string[]>([]);
  const [graph, setGraph] = useState<GraphSnapshot>({ modelId: '', nodes: [], edges: [] });

  const refresh = useCallback(async () => {
    const t = await getTenants();
    setTenants(t);
    if (selectedTenant) {
      const c = await getComponents(selectedTenant);
      setComponents(c);
      try {
        const g = await getActiveGraph(selectedTenant);
        setGraph(g);
      } catch { setGraph({ modelId: '', nodes: [], edges: [] }); }
    }
  }, [selectedTenant]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!selectedTenant) return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [selectedTenant, refresh]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <header className="border-b border-gray-800 p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-emerald-400">GraphOrleons</h1>
        <TenantSelector tenants={tenants} selected={selectedTenant} onSelect={setSelectedTenant} />
      </header>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-0">
        <div className="border-r border-gray-800 overflow-auto">
          <ComponentList tenantId={selectedTenant} components={components} />
        </div>
        <div className="md:col-span-2 relative">
          <GraphView graph={graph} />
        </div>
      </div>
      <div className="border-t border-gray-800">
        <EventGenerator onSent={refresh} />
      </div>
    </div>
  );
}
