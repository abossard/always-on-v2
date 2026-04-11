interface Props {
  tenants: string[];
  selected: string | null;
  onSelect: (tenant: string | null) => void;
}

export function TenantSelector({ tenants, selected, onSelect }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="live-tenant-selector" className="text-sm font-semibold text-teal-700">Ward / Tenant</label>
        <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-[11px] font-medium text-teal-600">
          {tenants.length} available
        </span>
      </div>
      <select
        id="live-tenant-selector"
        value={selected ?? ''}
        onChange={e => onSelect(e.target.value || null)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-teal-400 focus:ring-1 focus:ring-teal-200"
        data-testid="tenant-selector"
      >
        <option value="">Select a ward / tenant…</option>
        {tenants.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  );
}
