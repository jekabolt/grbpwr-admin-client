import { common_Material } from 'api/proto-http/admin';
import { useMemo, useState } from 'react';
import Text from 'ui/components/text';
import { useMaterials } from './useMaterials';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

// Reusable material chooser: a free-text filter over the (non-archived) catalog feeding a native
// <select>. Native, not a floating listbox, so it never clips inside the movement modals / run
// detail it is dropped into. Shared by the warehouse movement modals (W1.5), aux output material
// (W4) and anywhere a BOM line links a catalog Material.
export function MaterialPicker({
  value,
  onChange,
  section = '',
  disabled,
  placeholder = 'search name / code',
}: {
  value: number;
  onChange: (materialId: number, material?: common_Material) => void;
  section?: string; // UI enum constant to pre-narrow the catalog (e.g. packaging for aux output)
  disabled?: boolean;
  placeholder?: string;
}) {
  const { data, isLoading } = useMaterials(section, false);
  const materials = useMemo(() => data?.materials ?? [], [data]);
  const [q, setQ] = useState('');

  // Always keep the selected material selectable even when the filter would hide it, so typing a
  // query never silently drops the current choice.
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return materials.filter((m) => {
      if (m.id === value) return true;
      if (!needle) return true;
      return (
        (m.name ?? '').toLowerCase().includes(needle) ||
        (m.code ?? '').toLowerCase().includes(needle) ||
        (m.supplierRef ?? '').toLowerCase().includes(needle)
      );
    });
  }, [materials, q, value]);

  const label = (m: common_Material) => `${m.code ? `${m.code} · ` : ''}${m.name ?? `#${m.id}`}`;

  return (
    <div className='flex flex-col gap-1'>
      <input
        className={cell}
        placeholder={placeholder}
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
      />
      <select
        className={cell}
        value={value || 0}
        disabled={disabled || isLoading}
        onChange={(e) => {
          const id = Number(e.target.value) || 0;
          onChange(
            id,
            materials.find((m) => m.id === id),
          );
        }}
      >
        <option value={0}>{isLoading ? 'loading…' : '— select material —'}</option>
        {filtered.map((m) => (
          <option key={m.id} value={m.id}>
            {label(m)}
          </option>
        ))}
      </select>
      {!isLoading && materials.length === 0 ? (
        <Text variant='inactive' size='small'>
          no materials in catalog
        </Text>
      ) : null}
    </div>
  );
}
