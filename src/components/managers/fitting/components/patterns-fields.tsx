import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { DxfQuickViewModal } from 'ui/components/dxf-quick-view-modal';
import Input from 'ui/components/input';
import { PatternUploadButton } from 'ui/components/pattern-upload-button';
import Text from 'ui/components/text';
import SelectField from 'ui/form/fields/select-field';
import { MAX_PATTERN_NAME, formatBytes, isDxfUrl } from 'utils/pattern';
import { FittingFormData } from './schema';

type Row = { id: string; url?: string; filename?: string; name?: string; sizeBytes?: number };

// Iteration выкройка for a fitting (§5): the pattern actually tried on — PDF or DXF —
// uploaded via the shared PatternUploadButton (which owns the naming modal). sizeId is
// optional (0 = not size-specific) and sourced from the linked sample's size (a fitting
// tries one sample, which carries one sizeId — the old multi-size picker this used to read
// from is gone). "Скопировать из тех карты" seeds it from the linked card's final patterns
// — names included — so an iteration can start from the current pattern.
export function PatternsFields({ sampleSizeId }: { sampleSizeId?: number }) {
  const { control } = useFormContext<FittingFormData>();
  const { dictionary } = useDictionary();
  const { fields, append, remove, update } = useFieldArray({ control, name: 'patterns' });

  const techCardId = (useWatch({ control, name: 'techCardId' }) as number) || 0;
  const { data: linkedCard } = useTechCard(techCardId || undefined);
  const cardPatterns = linkedCard?.techCard?.patterns ?? [];

  // DXF row open in the quick view (PDF rows keep the plain new-tab link).
  const [viewingDxf, setViewingDxf] = useState<Row | null>(null);
  const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);

  const sizeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);

  // Size options = the sample's own size, unioned with any size already on a pattern (e.g.
  // copied from the tech card) so every row's dropdown shows a real label rather than blank.
  const patternSizeIds = fields
    .map((f) => (f as { sizeId?: number }).sizeId)
    .filter((id): id is number => !!id);
  const optionSizeIds = [
    ...new Set([...(sampleSizeId ? [sampleSizeId] : []), ...patternSizeIds]),
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
        name: p.name ?? '',
        // int64 → string from grpc-gateway; coerce so z.number() doesn't block save
        sizeBytes: Number(p.sizeBytes) || 0,
      }),
    );

  const commitRename = (index: number, row: Row, value: string) => {
    // '' commits as a clear — the row falls back to the filename; the save path still sends
    // the empty name explicitly so the clear reaches the server.
    const { id: _id, ...rest } = row;
    update(index, { ...rest, name: value.trim().slice(0, MAX_PATTERN_NAME) });
    setEditing(null);
  };

  return (
    <div className='space-y-3'>
      <Text variant='inactive' size='small'>
        выкройка, которую мерили в этой примерке (итерация), PDF или DXF. Можно несколько; размер —
        необязателен.
      </Text>

      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          выкройка не прикреплена
        </Text>
      ) : (
        <ul className='space-y-2'>
          {fields.map((f, index) => {
            const row = f as Row;
            const label = row.name || row.filename || '(без имени)';
            return (
              <li
                key={f.id}
                className='flex flex-wrap items-end gap-2 border-b border-hairline pb-2'
              >
                <div className='min-w-0 flex-1'>
                  {editing?.index === index ? (
                    <Input
                      name={`fitting-pattern-rename-${index}`}
                      value={editing.value}
                      placeholder={row.filename || 'название'}
                      maxLength={MAX_PATTERN_NAME}
                      autoFocus
                      autoComplete='off'
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setEditing({ index, value: e.target.value })
                      }
                      onBlur={() => commitRename(index, row, editing.value)}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitRename(index, row, editing.value);
                        }
                        if (e.key === 'Escape') setEditing(null);
                      }}
                    />
                  ) : (
                    <>
                      <span className='flex items-center gap-1.5'>
                        {isDxfUrl(row.url) ? (
                          <button
                            type='button'
                            onClick={() => setViewingDxf(row)}
                            className='min-w-0 truncate text-left text-textBaseSize underline hover:opacity-70'
                            title={row.filename}
                          >
                            {label}
                          </button>
                        ) : (
                          <a
                            href={row.url || '#'}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='min-w-0 truncate text-textBaseSize underline hover:opacity-70'
                            title={row.filename}
                          >
                            {label}
                          </a>
                        )}
                        {isDxfUrl(row.url) && (
                          <span className='shrink-0 border border-textColor px-1 text-nano uppercase leading-snug tracking-label'>
                            dxf
                          </span>
                        )}
                      </span>
                      {row.name && row.filename && (
                        <span className='block truncate text-nano text-labelColor'>
                          {row.filename}
                        </span>
                      )}
                    </>
                  )}
                </div>
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
                {isDxfUrl(row.url) && (
                  <Button
                    type='button'
                    variant='secondary'
                    className='shrink-0'
                    onClick={() => setViewingDxf(row)}
                  >
                    просмотр
                  </Button>
                )}
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='rename pattern'
                  title='переименовать'
                  className='shrink-0'
                  onClick={() => setEditing({ index, value: row.name ?? '' })}
                >
                  ✎
                </Button>
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
          label='+ загрузить PDF/DXF'
          onUploaded={(p) => append({ sizeId: 0, ...p })}
        />
        {cardPatterns.length > 0 && (
          <Button type='button' className='uppercase' onClick={copyFromCard}>
            скопировать из тех карты ({cardPatterns.length})
          </Button>
        )}
      </div>

      <DxfQuickViewModal
        url={viewingDxf?.url ?? null}
        title={viewingDxf ? viewingDxf.name || viewingDxf.filename : undefined}
        sizeBytes={viewingDxf?.sizeBytes}
        onClose={() => setViewingDxf(null)}
      />
    </div>
  );
}
