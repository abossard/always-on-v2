interface Props {
  tenants: string[];
  selected: string | null;
  onSelect: (tenant: string | null) => void;
}

export function TenantSelector({ tenants, selected, onSelect }: Props) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-400">Tenant:</label>
      <select
        value={selected ?? ''}
        onChange={e => onSelect(e.target.value || null)}
        className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
      >
        <option value="">Select a tenant…</option>
        {tenants.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  );
}
