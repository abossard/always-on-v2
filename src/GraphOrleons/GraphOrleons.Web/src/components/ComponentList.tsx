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
    <div className="rounded-xl border border-dashed border-white/10 bg-white/3 p-5 text-sm text-slate-400" data-testid="component-list-empty">
      Choose a tenant to inspect instrument properties.
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="component-list-panel">
      <h2 className="text-lg font-semibold text-white">Instruments ({components.length})</h2>

      <ul className="mt-3 flex-1 space-y-1 overflow-auto">
        {components.map(c => (
          <li key={c}>
            <button
              onClick={() => handleClick(c)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                selected?.name === c
                  ? 'border-emerald-300/35 bg-emerald-400/12 text-white'
                  : 'border-white/8 bg-white/4 text-slate-300 hover:bg-white/7'
              }`}
            >
              {c}
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <div className="mt-4 rounded-xl border border-white/10 bg-slate-900/80 p-4" data-testid="component-detail">
          <h3 className="text-lg font-semibold text-emerald-300">{selected.name}</h3>
          <p className="mt-1 text-xs text-slate-400">
            Events: {selected.totalCount} · Last update: {new Date(selected.lastEffectiveUpdate).toLocaleString()}
          </p>

          {selected.properties.length > 0 ? (
            <table className="mt-3 w-full text-sm" data-testid="property-table">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="pb-2">Property</th>
                  <th className="pb-2">Value</th>
                  <th className="pb-2">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {selected.properties.map((p) => (
                  <tr key={p.name} className="border-t border-white/5">
                    <td className="py-1.5 text-slate-200">{p.name}</td>
                    <td className="py-1.5 text-slate-300 font-mono text-xs">{p.value}</td>
                    <td className="py-1.5 text-slate-400 text-xs">{new Date(p.lastUpdated).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-slate-400" data-testid="no-properties">No properties yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
