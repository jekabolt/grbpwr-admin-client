import { common_Sample } from 'api/proto-http/admin';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { samplePurposeLabel } from './sample-options';
import { useSamples } from './useSamples';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

// Optional chooser of a tech card's samples (NF-04). Native select — labels each sample by its
// per-card number, purpose and sewn size. 0 = unset.
export function sampleLabel(s: common_Sample, sizeName?: string): string {
  const p = samplePurposeLabel(s.sample?.purpose);
  return `#${s.number ?? '?'} ${p}${sizeName ? ` · ${sizeName}` : ''}`;
}

export function SamplePicker({
  techCardId,
  value,
  onChange,
  disabled,
}: {
  techCardId?: number;
  value: number;
  onChange: (sampleId: number) => void;
  disabled?: boolean;
}) {
  const { dictionary } = useDictionary();
  const { data, isLoading } = useSamples(techCardId);
  const samples = data?.samples ?? [];

  return (
    <select
      className={cell}
      value={value || 0}
      disabled={disabled || !techCardId}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
    >
      <option value={0}>{isLoading ? 'loading…' : '— no sample —'}</option>
      {samples.map((s) => (
        <option key={s.id} value={s.id}>
          {sampleLabel(
            s,
            s.sample?.sizeId
              ? String(findInDictionary(dictionary, s.sample.sizeId, 'size') || s.sample.sizeId)
              : undefined,
          )}
        </option>
      ))}
    </select>
  );
}
