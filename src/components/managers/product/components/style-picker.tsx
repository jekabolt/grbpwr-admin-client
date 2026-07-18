import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_TechCardListItem } from 'api/proto-http/admin';
import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import { FormLabel } from 'ui/form';

// StylePicker (Q9d/S5): attach a colourway to its parent style by SEARCHING (style number / name /
// brand) instead of hand-typing a numeric style id. Bound to the form's `styleId` string field.
const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

const styleLabel = (s: common_TechCardListItem) =>
  `${s.styleNumber ? `${s.styleNumber} · ` : ''}${s.name || `#${s.id}`}${
    s.brand ? ` · ${s.brand}` : ''
  }`;

export function StylePicker({ name = 'styleId', disabled }: { name?: string; disabled?: boolean }) {
  const { control, setValue } = useFormContext();
  const value = (useWatch({ control, name }) as string) || '';
  const [q, setQ] = useState('');

  // A page of recent styles, filtered client-side so a query can match the style NUMBER (the primary
  // identifier), not only the name (ListTechCards' server filter is name-only).
  const { data, isLoading } = useQuery({
    queryKey: ['stylePicker', 'styles'],
    queryFn: () =>
      adminService.ListTechCards({
        limit: 200,
        offset: 0,
        orderFactor: 'ORDER_FACTOR_DESC',
        stage: 'TECH_CARD_STAGE_UNKNOWN',
        gender: 'GENDER_ENUM_UNKNOWN',
        brand: '',
        name: '',
        productId: 0,
        purpose: undefined,
        skuSeason: undefined,
      }),
    staleTime: 5 * 60 * 1000,
  });
  const styles = useMemo(() => data?.techCards ?? [], [data]);
  const selectedId = Number(value) || 0;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return styles.filter((s) => {
      if (s.id === selectedId) return true; // keep the current choice visible
      if (!needle) return true;
      return (
        (s.styleNumber ?? '').toLowerCase().includes(needle) ||
        (s.name ?? '').toLowerCase().includes(needle) ||
        (s.brand ?? '').toLowerCase().includes(needle)
      );
    });
  }, [styles, q, selectedId]);

  return (
    <div className='flex flex-col gap-1'>
      <FormLabel>attach to style (search style № / name)</FormLabel>
      <input
        className={cell}
        placeholder='search style number / name / brand'
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
      />
      <select
        className={cell}
        value={selectedId || 0}
        disabled={disabled || isLoading}
        onChange={(e) =>
          setValue(name, String(Number(e.target.value) || 0), {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
      >
        <option value={0}>{isLoading ? 'loading…' : '— select style —'}</option>
        {filtered.map((s) => (
          <option key={s.id} value={s.id}>
            {styleLabel(s)}
          </option>
        ))}
      </select>
      <Text variant='inactive' size='small'>
        A colourway belongs to a style. Search by style number or name (copy prefills the source’s
        style). Variants, size chart and publishing come after creating the draft.
      </Text>
    </div>
  );
}
