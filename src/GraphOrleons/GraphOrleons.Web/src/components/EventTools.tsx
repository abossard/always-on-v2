import { useState } from 'react';
import { sendEvent } from '../api';

interface Props {
  tenant: string | null;
  components: string[];
  onSent: () => void;
  onTenantUsed: (tenant: string) => void;
}

const LOCATIONS = ['ICU-A', 'ICU-B', 'Ward-3', 'OR-1', 'ER'];
const IMPACTS = ['None', 'Partial', 'Full'] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Deep hospital tree topology — narrow but many levels
const HOSPITAL_TREE = {
  nodes: [
    // Root
    'central-station',
    // Level 1: 3 hubs
    'icu-hub', 'surgery-hub', 'er-hub',
    // Level 2: departments
    'icu-bay-1', 'icu-bay-2',
    'pre-op', 'or-suite',
    'triage', 'resus-bay',
    // Level 3: instrument clusters
    'icu-bay-1-rack', 'icu-bay-2-rack',
    'anesthesia-cart', 'surgical-tower',
    'triage-station', 'resus-cart',
    // Level 4: instruments
    'ventilator-1', 'heart-monitor-1',
    'ventilator-2', 'pulse-ox-2',
    'anesthesia-unit', 'gas-mixer',
    'surgical-monitor', 'cautery-unit',
    'triage-ecg', 'triage-bp',
    'defib-resus', 'resus-monitor',
    // Level 5: sensors
    'vent-1-flow-sensor', 'vent-1-pressure-sensor',
    'hm-1-lead-sensor',
    'vent-2-o2-sensor',
    'gas-mixer-valve',
    'cautery-temp-sensor',
    'defib-charge-sensor',
  ],
  edges: [
    // Level 0→1
    { src: 'central-station', dst: 'icu-hub', impact: 'Full' as const },
    { src: 'central-station', dst: 'surgery-hub', impact: 'Full' as const },
    { src: 'central-station', dst: 'er-hub', impact: 'Full' as const },
    // Level 1→2
    { src: 'icu-hub', dst: 'icu-bay-1', impact: 'Full' as const },
    { src: 'icu-hub', dst: 'icu-bay-2', impact: 'Partial' as const },
    { src: 'surgery-hub', dst: 'pre-op', impact: 'Partial' as const },
    { src: 'surgery-hub', dst: 'or-suite', impact: 'Full' as const },
    { src: 'er-hub', dst: 'triage', impact: 'Partial' as const },
    { src: 'er-hub', dst: 'resus-bay', impact: 'Full' as const },
    // Level 2→3
    { src: 'icu-bay-1', dst: 'icu-bay-1-rack', impact: 'Full' as const },
    { src: 'icu-bay-2', dst: 'icu-bay-2-rack', impact: 'Full' as const },
    { src: 'pre-op', dst: 'anesthesia-cart', impact: 'Full' as const },
    { src: 'or-suite', dst: 'surgical-tower', impact: 'Full' as const },
    { src: 'triage', dst: 'triage-station', impact: 'Partial' as const },
    { src: 'resus-bay', dst: 'resus-cart', impact: 'Full' as const },
    // Level 3→4
    { src: 'icu-bay-1-rack', dst: 'ventilator-1', impact: 'Full' as const },
    { src: 'icu-bay-1-rack', dst: 'heart-monitor-1', impact: 'Partial' as const },
    { src: 'icu-bay-2-rack', dst: 'ventilator-2', impact: 'Full' as const },
    { src: 'icu-bay-2-rack', dst: 'pulse-ox-2', impact: 'None' as const },
    { src: 'anesthesia-cart', dst: 'anesthesia-unit', impact: 'Full' as const },
    { src: 'anesthesia-cart', dst: 'gas-mixer', impact: 'Partial' as const },
    { src: 'surgical-tower', dst: 'surgical-monitor', impact: 'Partial' as const },
    { src: 'surgical-tower', dst: 'cautery-unit', impact: 'Full' as const },
    { src: 'triage-station', dst: 'triage-ecg', impact: 'None' as const },
    { src: 'triage-station', dst: 'triage-bp', impact: 'None' as const },
    { src: 'resus-cart', dst: 'defib-resus', impact: 'Full' as const },
    { src: 'resus-cart', dst: 'resus-monitor', impact: 'Partial' as const },
    // Level 4→5 (deepest)
    { src: 'ventilator-1', dst: 'vent-1-flow-sensor', impact: 'Full' as const },
    { src: 'ventilator-1', dst: 'vent-1-pressure-sensor', impact: 'Partial' as const },
    { src: 'heart-monitor-1', dst: 'hm-1-lead-sensor', impact: 'Full' as const },
    { src: 'ventilator-2', dst: 'vent-2-o2-sensor', impact: 'Full' as const },
    { src: 'gas-mixer', dst: 'gas-mixer-valve', impact: 'Full' as const },
    { src: 'cautery-unit', dst: 'cautery-temp-sensor', impact: 'Partial' as const },
    { src: 'defib-resus', dst: 'defib-charge-sensor', impact: 'Full' as const },
  ],
};

export function EventTools({ tenant, components, onSent, onTenantUsed }: Props) {
  const [inputTenant, setInputTenant] = useState('hospital-1');
  const [status, setStatus] = useState('');

  const activeTenant = tenant || inputTenant;
  const hasComponents = components.length > 0;

  const sendComponent = async () => {
    if (!hasComponents) return;
    const comp = pick(components);
    const loc = pick(LOCATIONS);
    try {
      await sendEvent({
        tenant: activeTenant,
        component: comp,
        payload: {
          status: Math.random() > 0.2 ? 'online' : 'warning',
          location: loc,
          battery: Math.round(Math.random() * 100),
          temp: (35 + Math.random() * 4).toFixed(1),
        },
      });
      setStatus(`✓ ${comp} @ ${loc}`);
      onTenantUsed(activeTenant);
      onSent();
    } catch (e) { setStatus(`✗ ${e}`); }
  };

  const sendRelationship = async () => {
    if (components.length < 2) return;
    const shuffled = [...components].sort(() => Math.random() - 0.5);
    const src = shuffled[0];
    const dst = shuffled[1];
    const impact = pick(IMPACTS);
    try {
      await sendEvent({
        tenant: activeTenant,
        component: `${src}/${dst}`,
        payload: { impact, link: `${src} feeds ${dst}` },
      });
      setStatus(`✓ ${src} → ${dst} (${impact})`);
      onTenantUsed(activeTenant);
      onSent();
    } catch (e) { setStatus(`✗ ${e}`); }
  };

  const seedHospital = async () => {
    try {
      for (const node of HOSPITAL_TREE.nodes) {
        await sendEvent({
          tenant: activeTenant,
          component: node,
          payload: {
            status: Math.random() > 0.15 ? 'online' : 'warning',
            location: pick(LOCATIONS),
            battery: Math.round(50 + Math.random() * 50),
          },
        });
      }
      for (const edge of HOSPITAL_TREE.edges) {
        await sendEvent({
          tenant: activeTenant,
          component: `${edge.src}/${edge.dst}`,
          payload: { impact: edge.impact },
        });
      }
      setStatus(`✓ Seeded ${HOSPITAL_TREE.nodes.length} instruments, ${HOSPITAL_TREE.edges.length} connections`);
      onTenantUsed(activeTenant);
      onSent();
    } catch (e) { setStatus(`✗ ${e}`); }
  };

  return (
    <div className="space-y-3" data-testid="event-tools">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-teal-700">Event Tools</label>
        {status && (
          <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs text-teal-600" data-testid="event-status">
            {status}
          </span>
        )}
      </div>

      {!tenant && (
        <input
          value={inputTenant}
          onChange={(e) => setInputTenant(e.target.value)}
          placeholder="Tenant name"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-200"
          data-testid="event-tenant-input"
        />
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={sendComponent}
          disabled={!hasComponents}
          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-700 transition hover:bg-teal-100 active:bg-teal-200 disabled:cursor-not-allowed disabled:opacity-40"
          data-testid="send-random-event"
        >
          📡 Component
        </button>
        <button
          onClick={sendRelationship}
          disabled={components.length < 2}
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-100 active:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-40"
          data-testid="send-relationship-event"
        >
          🔗 Relationship
        </button>
      </div>
      <button
        onClick={seedHospital}
        className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 active:bg-emerald-200"
        data-testid="seed-hospital"
      >
        🏥 Seed Hospital Tree ({HOSPITAL_TREE.nodes.length} instruments, {HOSPITAL_TREE.edges.length} connections)
      </button>
    </div>
  );
}
