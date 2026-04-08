import { useState } from 'react';
import { sendEvent } from '../api';

interface Props { onSent: () => void; }

const SAMPLE_COMPONENTS = ['web-server', 'database', 'cache', 'auth-service', 'queue', 'api-gateway'];

export function EventGenerator({ onSent }: Props) {
  const [tenant, setTenant] = useState('demo-tenant');
  const [status, setStatus] = useState('');

  const sendRandom = async () => {
    const comp = SAMPLE_COMPONENTS[Math.floor(Math.random() * SAMPLE_COMPONENTS.length)];
    try {
      await sendEvent({
        tenant,
        component: comp,
        payload: { status: Math.random() > 0.5 ? 'healthy' : 'degraded', cpu: Math.round(Math.random() * 100), ts: new Date().toISOString() },
      });
      setStatus(`✓ Sent to ${comp}`);
      onSent();
    } catch (e) { setStatus(`✗ ${e}`); }
  };

  const sendRelationship = async () => {
    const i = Math.floor(Math.random() * (SAMPLE_COMPONENTS.length - 1));
    const source = SAMPLE_COMPONENTS[i];
    const target = SAMPLE_COMPONENTS[i + 1];
    const impacts = ['None', 'Partial', 'Full'] as const;
    const impact = impacts[Math.floor(Math.random() * 3)];
    try {
      await sendEvent({
        tenant,
        component: `${source}/${target}`,
        payload: { impact, description: `${source} depends on ${target}` },
      });
      setStatus(`✓ Relationship: ${source} → ${target} (${impact})`);
      onSent();
    } catch (e) { setStatus(`✗ ${e}`); }
  };

  const sendBatch = async () => {
    for (let i = 0; i < 10; i++) {
      await sendRandom();
      if (Math.random() > 0.5) await sendRelationship();
    }
  };

  return (
    <div className="p-4 flex items-center gap-4 flex-wrap">
      <label className="text-sm text-gray-400">Tenant:</label>
      <input
        value={tenant}
        onChange={e => setTenant(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm w-40"
      />
      <button onClick={sendRandom} className="bg-emerald-700 hover:bg-emerald-600 px-3 py-1.5 rounded text-sm font-medium transition">
        Send Event
      </button>
      <button onClick={sendRelationship} className="bg-amber-700 hover:bg-amber-600 px-3 py-1.5 rounded text-sm font-medium transition">
        Send Relationship
      </button>
      <button onClick={sendBatch} className="bg-blue-700 hover:bg-blue-600 px-3 py-1.5 rounded text-sm font-medium transition">
        Send Batch (10)
      </button>
      {status && <span className="text-xs text-gray-400">{status}</span>}
    </div>
  );
}
