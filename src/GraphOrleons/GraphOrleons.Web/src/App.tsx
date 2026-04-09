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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_28%),linear-gradient(180deg,#06111f_0%,#020617_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-[1820px] flex-col gap-6 px-4 py-5 sm:px-6 xl:px-8">
        <header className="rounded-[32px] border border-white/10 bg-slate-950/70 px-5 py-5 shadow-[0_28px_80px_rgba(2,6,23,0.38)] backdrop-blur-xl sm:px-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="text-[11px] uppercase tracking-[0.36em] text-emerald-300/80">
                Visual Tree Studio
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                GraphOrleons topology explorer
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                Compare multiple dependency-tree layouts, seed deterministic topologies, and inspect live Orleans event graphs without leaving the page.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3" data-testid="app-metrics">
              <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Tenants</div>
                <div className="mt-2 text-2xl font-semibold text-white">{tenants.length}</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Live nodes</div>
                <div className="mt-2 text-2xl font-semibold text-white">{graph.nodes.length}</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Live edges</div>
                <div className="mt-2 text-2xl font-semibold text-white">{graph.edges.length}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col gap-6">
            <section className="rounded-[30px] border border-white/10 bg-slate-950/70 p-5 shadow-[0_18px_60px_rgba(2,6,23,0.28)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Live tenant</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {selectedTenant || 'No tenant selected'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 transition hover:border-emerald-300/40 hover:bg-emerald-400/16"
                  data-testid="refresh-live"
                >
                  Refresh live data
                </button>
              </div>

              <div className="mt-4">
                <TenantSelector tenants={tenants} selected={selectedTenant} onSelect={setSelectedTenant} />
              </div>
            </section>

            <section className="min-h-0 flex-1 rounded-[30px] border border-white/10 bg-slate-950/70 p-5 shadow-[0_18px_60px_rgba(2,6,23,0.28)] backdrop-blur-xl">
              <ComponentList tenantId={selectedTenant} components={components} />
            </section>

            <section className="rounded-[30px] border border-white/10 bg-slate-950/70 p-5 shadow-[0_18px_60px_rgba(2,6,23,0.28)] backdrop-blur-xl">
              <EventGenerator onSent={refresh} onTenantUsed={setSelectedTenant} />
            </section>
          </aside>

          <section className="min-h-[860px] min-w-0">
            <GraphView graph={graph} selectedTenant={selectedTenant} />
          </section>
        </main>
      </div>
    </div>
  );
}
