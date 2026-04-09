import { useState } from 'react';
import { sendEvent } from '../api';
import { buildSeedEvents, demoScenarios } from '../topologyStudio';

interface Props {
  onSent: () => void;
  onTenantUsed?: (tenant: string) => void;
}

const SAMPLE_COMPONENTS = ['web-server', 'database', 'cache', 'auth-service', 'queue', 'api-gateway'];

export function EventGenerator({ onSent, onTenantUsed }: Props) {
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
      onTenantUsed?.(tenant);
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
      onTenantUsed?.(tenant);
      onSent();
    } catch (e) { setStatus(`✗ ${e}`); }
  };

  const sendBatch = async () => {
    for (let i = 0; i < 10; i++) {
      await sendRandom();
      if (Math.random() > 0.5) await sendRelationship();
    }
  };

  const seedScenario = async (scenarioId: (typeof demoScenarios)[number]['id']) => {
    const events = buildSeedEvents(tenant, scenarioId);

    try {
      onTenantUsed?.(tenant);
      for (const event of events) {
        await sendEvent(event);
      }

      const scenario = demoScenarios.find((entry) => entry.id === scenarioId) ?? demoScenarios[0];
      setStatus(`✓ Seeded ${scenario.name} with ${events.length} deterministic events`);
      onSent();
    } catch (e) {
      setStatus(`✗ ${e}`);
    }
  };

  return (
    <div className="space-y-4" data-testid="event-generator">
      <div>
        <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Event tools</div>
        <h2 className="mt-2 text-xl font-semibold text-white">Seed or poke the topology</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Use the deterministic scenario buttons for screenshotable comparisons, or fire random events when you want noisier live data.
        </p>
      </div>

      <div>
        <label htmlFor="event-tenant-input" className="mb-2 block text-sm font-medium text-slate-300">Tenant</label>
        <input
          id="event-tenant-input"
          value={tenant}
          onChange={e => setTenant(e.target.value)}
          className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-300/40"
          data-testid="event-tenant-input"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <button onClick={sendRandom} className="rounded-2xl border border-emerald-300/25 bg-emerald-400/12 px-4 py-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/18" data-testid="send-random-event">
          Send health event
        </button>
        <button onClick={sendRelationship} className="rounded-2xl border border-amber-300/25 bg-amber-400/12 px-4 py-3 text-sm font-medium text-amber-100 transition hover:bg-amber-400/18" data-testid="send-relationship-event">
          Send relationship
        </button>
        <button onClick={sendBatch} className="rounded-2xl border border-sky-300/25 bg-sky-400/12 px-4 py-3 text-sm font-medium text-sky-100 transition hover:bg-sky-400/18 sm:col-span-2 xl:col-span-1 2xl:col-span-2" data-testid="send-batch-events">
          Send batch (10)
        </button>
      </div>

      <div className="rounded-[24px] border border-white/10 bg-white/4 p-4">
        <div className="text-[11px] uppercase tracking-[0.26em] text-slate-400">Deterministic scenes</div>
        <div className="mt-3 grid gap-2">
          {demoScenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              onClick={() => void seedScenario(scenario.id)}
              className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/8"
              data-testid={`seed-scenario-${scenario.id}`}
            >
              <div className="text-sm font-medium text-white">{scenario.name}</div>
              <div className="mt-1 text-xs leading-5 text-slate-400">{scenario.focus}</div>
            </button>
          ))}
        </div>
      </div>

      {status && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-300" data-testid="event-status">
          {status}
        </div>
      )}
    </div>
  );
}
