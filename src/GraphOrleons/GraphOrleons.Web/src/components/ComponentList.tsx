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
    <div className="p-4 text-gray-500 text-sm">Select a tenant to view components</div>
  );

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-3 text-emerald-400">Components ({components.length})</h2>
      <ul className="space-y-1">
        {components.map(c => (
          <li key={c}>
            <button
              onClick={() => handleClick(c)}
              className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-gray-800 transition ${
                selected?.name === c ? 'bg-gray-800 border border-emerald-600' : ''
              }`}
            >
              {c}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="mt-4 border-t border-gray-800 pt-4">
          <h3 className="font-semibold text-emerald-400">{selected.name}</h3>
          <p className="text-xs text-gray-400 mt-1">Total events: {selected.totalCount}</p>
          {selected.latestPayload && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">Latest payload:</p>
              <pre className="bg-gray-900 p-2 rounded text-xs overflow-auto max-h-32">
                {JSON.stringify(selected.latestPayload, null, 2)}
              </pre>
            </div>
          )}
          {selected.history.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">History ({selected.history.length}):</p>
              {selected.history.map((h, i) => (
                <div key={i} className="bg-gray-900 p-2 rounded text-xs mb-1">
                  <span className="text-gray-500">{new Date(h.receivedAt).toLocaleTimeString()}</span>
                  <pre className="overflow-auto max-h-16 mt-1">{JSON.stringify(h.payload, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
