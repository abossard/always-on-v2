interface Props {
  tenants: string[];
  selected: string | null;
  onSelect: (tenant: string | null) => void;
}

export function TenantSelector({ tenants, selected, onSelect }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="live-tenant-selector" className="text-sm font-medium text-slate-300">Tenant</label>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-400">
          {tenants.length} known
        </span>
      </div>
      <select
        id="live-tenant-selector"
        value={selected ?? ''}
        onChange={e => onSelect(e.target.value || null)}
        className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-emerald-300/40"
        data-testid="tenant-selector"
      >
        <option value="">Select a tenant…</option>
        {tenants.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  );
}
