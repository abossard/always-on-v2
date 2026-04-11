import { useState } from 'react';
import { sendEvent } from '../api';

interface Props {
  tenant: string | null;
  onSent: () => void;
  onTenantUsed: (tenant: string) => void;
}

const INSTRUMENTS = [
  'ventilator', 'heart-monitor', 'infusion-pump', 'pulse-oximeter',
  'blood-pressure', 'ecg-machine', 'defibrillator', 'syringe-driver',
];

const LOCATIONS = ['ICU-A', 'ICU-B', 'Ward-3', 'OR-1', 'ER'];
const IMPACTS = ['None', 'Partial', 'Full'] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// A wide hospital tree topology
const HOSPITAL_TREE = {
  nodes: [
    'central-station',
    'icu-hub', 'surgery-hub', 'ward-hub', 'er-hub',
    'ventilator-1', 'ventilator-2', 'heart-monitor-1', 'heart-monitor-2',
    'anesthesia-unit', 'surgical-monitor', 'surgical-pump',
    'infusion-pump-1', 'infusion-pump-2', 'blood-pressure-1', 'ecg-ward',
    'defibrillator-er', 'pulse-ox-er', 'triage-monitor',
  ],
  edges: [
    // Level 1: central → hubs
    { src: 'central-station', dst: 'icu-hub', impact: 'Full' as const },
    { src: 'central-station', dst: 'surgery-hub', impact: 'Full' as const },
    { src: 'central-station', dst: 'ward-hub', impact: 'Partial' as const },
    { src: 'central-station', dst: 'er-hub', impact: 'Full' as const },
    // Level 2: hubs → instruments
    { src: 'icu-hub', dst: 'ventilator-1', impact: 'Full' as const },
    { src: 'icu-hub', dst: 'ventilator-2', impact: 'Full' as const },
    { src: 'icu-hub', dst: 'heart-monitor-1', impact: 'Partial' as const },
    { src: 'icu-hub', dst: 'heart-monitor-2', impact: 'Partial' as const },
    { src: 'surgery-hub', dst: 'anesthesia-unit', impact: 'Full' as const },
    { src: 'surgery-hub', dst: 'surgical-monitor', impact: 'Partial' as const },
    { src: 'surgery-hub', dst: 'surgical-pump', impact: 'None' as const },
    { src: 'ward-hub', dst: 'infusion-pump-1', impact: 'Partial' as const },
    { src: 'ward-hub', dst: 'infusion-pump-2', impact: 'Partial' as const },
    { src: 'ward-hub', dst: 'blood-pressure-1', impact: 'None' as const },
    { src: 'ward-hub', dst: 'ecg-ward', impact: 'None' as const },
    { src: 'er-hub', dst: 'defibrillator-er', impact: 'Full' as const },
    { src: 'er-hub', dst: 'pulse-ox-er', impact: 'Partial' as const },
    { src: 'er-hub', dst: 'triage-monitor', impact: 'Partial' as const },
  ],
};

export function EventTools({ tenant, onSent, onTenantUsed }: Props) {
  const [inputTenant, setInputTenant] = useState('hospital-1');
  const [status, setStatus] = useState('');

  const activeTenant = tenant || inputTenant;

  const sendComponent = async () => {
    const comp = pick(INSTRUMENTS);
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
    const i = Math.floor(Math.random() * (INSTRUMENTS.length - 1));
    const src = INSTRUMENTS[i];
    const dst = INSTRUMENTS[i + 1];
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
      // Send all node component events
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
      // Send all relationship events
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
          className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-700 transition hover:bg-teal-100 active:bg-teal-200"
          data-testid="send-random-event"
        >
          📡 Component
        </button>
        <button
          onClick={sendRelationship}
          className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-100 active:bg-blue-200"
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
        🏥 Seed Hospital Tree (19 instruments, 18 connections)
      </button>
    </div>
  );
}
