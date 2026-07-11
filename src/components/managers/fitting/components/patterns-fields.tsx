import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { PatternUploadButton } from 'ui/components/pattern-upload-button';
import Text from 'ui/components/text';
import SelectField from 'ui/form/fields/select-field';
import { formatBytes } from 'utils/pattern';
import { FittingFormData } from './schema';

// Iteration выкройка for a fitting (§5): the pattern actually tried on, uploaded via the
// shared PatternUploadButton. sizeId is optional (0 = not size-specific) and sourced from
// the fitting's own sizes. "Скопировать из тех карты" seeds it from the linked card's
// final patterns so an iteration can start from the current pattern.
export function PatternsFields() {
  const { control } = useFormContext<FittingFormData>();
  const { dictionary } = useDictionary();
  const { fields, append, remove } = useFieldArray({ control, name: 'patterns' });

  const sizes = (useWatch({ control, name: 'sizes' }) ?? []) as Array<{ sizeId?: number }>;
  const techCardId = (useWatch({ control, name: 'techCardId' }) as number) || 0;
  const { data: linkedCard } = useTechCard(techCardId || undefined);
  const cardPatterns = linkedCard?.techCard?.patterns ?? [];

  const sizeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);

  // Size options = the fitting's own sizes, unioned with any size already on a pattern (e.g.
  // copied from the tech card) so every row's dropdown shows a real label rather than blank.
  const patternSizeIds = fields
    .map((f) => (f as { sizeId?: number }).sizeId)
    .filter((id): id is number => !!id);
  const optionSizeIds = [
    ...new Set([
      ...sizes.map((s) => s.sizeId).filter((id): id is number => !!id),
      ...patternSizeIds,
    ]),
  ];
  const sizeOptions = [
    { value: 0, label: '— общий —' },
    ...optionSizeIds.map((id) => ({
      value: id,
      label: formatSizeName(sizeById.get(id) ?? `#${id}`),
    })),
  ];

  const copyFromCard = () =>
    cardPatterns.forEach((p) =>
      append({
        sizeId: p.sizeId || 0,
        url: p.url || '',
        filename: p.filename || '',
        // int64 → string from grpc-gateway; coerce so z.number() doesn't block save
        sizeBytes: Number(p.sizeBytes) || 0,
      }),
    );

  return (
    <div className='space-y-3'>
      <Text variant='inactive' size='small'>
        выкройка, которую мерили в этой примерке (итерация). Можно несколько; размер — необязателен.
      </Text>

      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          выкройка не прикреплена
        </Text>
      ) : (
        <ul className='space-y-2'>
          {fields.map((f, index) => {
            const row = f as { id: string; url?: string; filename?: string; sizeBytes?: number };
            return (
              <li
                key={f.id}
                className='flex flex-wrap items-end gap-2 border border-textInactiveColor p-2'
              >
                <a
                  href={row.url || '#'}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='min-w-0 flex-1 truncate text-textBaseSize underline hover:opacity-70'
                  title={row.filename}
                >
                  {row.filename || '(без имени)'}
                </a>
                <Text variant='inactive' size='small' className='shrink-0'>
                  {formatBytes(row.sizeBytes)}
                </Text>
                <div className='w-28 shrink-0'>
                  <SelectField
                    name={`patterns.${index}.sizeId`}
                    label='размер'
                    items={sizeOptions}
                    valueAsNumber
                  />
                </div>
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='remove pattern'
                  className='shrink-0'
                  onClick={() => remove(index)}
                >
                  ✕
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className='flex flex-wrap items-center gap-2'>
        <PatternUploadButton
          label='+ загрузить PDF'
          onUploaded={(p) => append({ sizeId: 0, ...p })}
        />
        {cardPatterns.length > 0 && (
          <Button type='button' className='uppercase' onClick={copyFromCard}>
            скопировать из тех карты ({cardPatterns.length})
          </Button>
        )}
      </div>
    </div>
  );
}
