import { common_CompositionEntry } from 'api/proto-http/admin';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';

// Structured fibre composition (S17/M1): the typed composition_entries projection of a style, resolved
// with dictionary fibre names. Read-only. The free-text `composition` string on BOM lines / materials
// is legacy plain text ONLY — it is NEVER parsed as JSON (M1); when composition_entries is empty the
// caller falls back to whatever plain-text composition it has.
export function formatCompositionEntries(entries?: common_CompositionEntry[]): string {
  return (entries ?? [])
    .map((e) => {
      const pct = decimalToInput(e.percent);
      const name = e.name?.trim() || e.fiberCode?.trim() || '—';
      return pct ? `${pct}% ${name}` : name;
    })
    .join(' · ');
}

export function CompositionEntries({
  entries,
  label = 'fibre composition',
}: {
  entries?: common_CompositionEntry[];
  label?: string;
}) {
  const rows = entries ?? [];
  if (rows.length === 0) return null;
  return (
    <div className='flex flex-col gap-1'>
      <Text variant='label' size='small'>
        {label}
      </Text>
      <Text size='small'>{formatCompositionEntries(rows)}</Text>
    </div>
  );
}
