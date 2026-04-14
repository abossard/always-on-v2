import { useState, useEffect } from 'react';
import { sendEvent } from '../api';
import type { MergedProperty } from '../types';

interface Props {
  tenant: string | null;
  components: string[];
  componentPayloads: Record<string, MergedProperty[]>;
  selectedNode: string | null;
  onSent: () => void;
}

interface KVRow {
  key: string;
  value: string;
}

const DEFAULT_ROWS: KVRow[] = [
  { key: 'status', value: 'online' },
  { key: 'battery', value: '95' },
  { key: 'temp', value: '36.6' },
  { key: 'location', value: 'ICU-A' },
];

export function PayloadSender({ tenant, components, componentPayloads, selectedNode, onSent }: Props) {
  const [selectedComponent, setSelectedComponent] = useState('');
  const [rows, setRows] = useState<KVRow[]>(DEFAULT_ROWS);
  const [status, setStatus] = useState('');

  // When a node is selected externally, update dropdown and prefill rows
  useEffect(() => {
    if (!selectedNode) return;
    setSelectedComponent(selectedNode);
    const props = componentPayloads[selectedNode] ?? [];
    if (props.length > 0) {
      setRows(props.map(p => ({ key: p.name, value: p.value })));
    }
  }, [selectedNode, componentPayloads]);

  const updateRow = (index: number, field: 'key' | 'value', val: string) => {
    setRows(prev => prev.map((r, i) => i === index ? { ...r, [field]: val } : r));
  };

  const addRow = () => setRows(prev => [...prev, { key: '', value: '' }]);

  const removeRow = (index: number) => setRows(prev => prev.filter((_, i) => i !== index));

  const send = async () => {
    if (!tenant || !selectedComponent) return;
    const payload: Record<string, unknown> = {};
    for (const row of rows) {
      if (!row.key) continue;
      const num = Number(row.value);
      payload[row.key] = !isNaN(num) && row.value.trim() !== '' ? num : row.value;
    }
    try {
      await sendEvent({ tenant, component: selectedComponent, payload });
      setStatus(`✓ Sent to ${selectedComponent}`);
      onSent();
    } catch (e) {
      setStatus(`✗ ${e}`);
    }
  };

  if (!tenant || components.length === 0) return null;

  return (
    <div className="space-y-3" data-testid="payload-sender">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-teal-700">Payload Sender</label>
        {status && (
          <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs text-teal-600" data-testid="payload-sender-status">
            {status}
          </span>
        )}
      </div>

      <select
        value={selectedComponent}
        onChange={e => setSelectedComponent(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-200"
        data-testid="payload-component-select"
        aria-label="Component"
      >
        <option value="">Select component…</option>
        {components.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      <div className="space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-1.5">
            <input
              value={row.key}
              onChange={e => updateRow(i, 'key', e.target.value)}
              placeholder="key"
              className="flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-teal-400"
              aria-label={`Key ${i + 1}`}
              data-testid="payload-key-input"
            />
            <input
              value={row.value}
              onChange={e => updateRow(i, 'value', e.target.value)}
              placeholder="value"
              className="flex-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 font-mono outline-none focus:border-teal-400"
              aria-label={`Value ${i + 1}`}
              data-testid="payload-value-input"
            />
            <button
              onClick={() => removeRow(i)}
              className="rounded border border-gray-200 px-1.5 text-xs text-gray-400 hover:text-red-500"
              aria-label={`Remove row ${i + 1}`}
              data-testid="payload-remove-row"
            >✕</button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={addRow}
          className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
          data-testid="payload-add-row"
        >
          + Add field
        </button>
        <button
          onClick={send}
          disabled={!selectedComponent}
          className="flex-1 rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 transition hover:bg-teal-100 active:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-40"
          data-testid="payload-send"
        >
          📤 Send Payload
        </button>
      </div>
    </div>
  );
}
