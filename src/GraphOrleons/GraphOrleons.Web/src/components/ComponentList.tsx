import { useState } from 'react';
import { getComponentDetails } from '../api';
import type { ComponentSnapshot } from '../types';

interface Props {
  tenantId: string | null;
  components: string[];
}

export function ComponentList({ tenantId, components }: Props) {
  const [selected, setSelected] = useState<ComponentSnapshot | null>(null);

  const handleClick = async (name: string) => {
    if (!tenantId) return;
    const details = await getComponentDetails(tenantId, name);
    setSelected(details);
  };

  if (!tenantId) return (
    <div className="rounded-[26px] border border-dashed border-white/10 bg-white/3 p-5 text-sm text-slate-400">
      Choose a live tenant to inspect emitted component payloads and event history.
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="component-list-panel">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Component explorer</div>
          <h2 className="mt-2 text-xl font-semibold text-white">Components ({components.length})</h2>
        </div>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200">
          {tenantId}
        </span>
      </div>

      <ul className="mt-4 flex-1 space-y-2 overflow-auto pr-1">
        {components.map(c => (
          <li key={c}>
            <button
              onClick={() => handleClick(c)}
              className={`w-full rounded-2xl border px-3 py-3 text-left text-sm transition ${
                selected?.name === c
                  ? 'border-emerald-300/35 bg-emerald-400/12 text-white shadow-[0_10px_24px_rgba(16,185,129,0.12)]'
                  : 'border-white/8 bg-white/4 text-slate-300 hover:border-white/16 hover:bg-white/7'
              }`}
            >
              {c}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="mt-4 rounded-[26px] border border-white/10 bg-slate-900/80 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-emerald-300">{selected.name}</h3>
              <p className="mt-1 text-xs uppercase tracking-[0.24em] text-slate-400">Total events: {selected.totalCount}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-300">
              Latest sample
            </span>
          </div>
          {selected.latestPayload && (
            <div className="mt-4">
              <p className="mb-2 text-xs uppercase tracking-[0.24em] text-slate-500">Latest payload</p>
              <pre className="max-h-40 overflow-auto rounded-2xl border border-white/8 bg-slate-950/85 p-3 text-xs text-slate-200">
                {JSON.stringify(selected.latestPayload, null, 2)}
              </pre>
            </div>
          )}
          {selected.history.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs uppercase tracking-[0.24em] text-slate-500">History ({selected.history.length})</p>
              {selected.history.map((h, i) => (
                <div key={i} className="mb-2 rounded-2xl border border-white/8 bg-slate-950/72 p-3 text-xs text-slate-200">
                  <span className="text-slate-500">{new Date(h.receivedAt).toLocaleTimeString()}</span>
                  <pre className="mt-2 max-h-24 overflow-auto">{JSON.stringify(h.payload, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
