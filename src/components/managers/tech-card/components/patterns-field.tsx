import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { PatternUploadButton } from 'ui/components/pattern-upload-button';
import Text from 'ui/components/text';
import { formatBytes } from 'utils/pattern';
import { TechCardFormData } from './schema';

type PatternRow = { sizeId?: number; url?: string; filename?: string; sizeBytes?: number };

function PatternList({
  rows,
  onRemove,
}: {
  rows: Array<{ row: PatternRow; index: number }>;
  onRemove: (index: number) => void;
}) {
  if (rows.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        нет выкроек
      </Text>
    );
  }
  return (
    <ul className='space-y-1'>
      {rows.map(({ row, index }) => (
        <li
          key={index}
          className='flex items-center justify-between gap-3 border border-textInactiveColor px-2 py-1'
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
          <Button
            type='button'
            variant='secondary'
            aria-label='remove pattern'
            className='shrink-0'
            onClick={() => onRemove(index)}
          >
            ✕
          </Button>
        </li>
      ))}
    </ul>
  );
}

// Per-size PDF выкройки (§2). Driven by the card's size range: one upload panel per
// declared size, plus a defensive group for any pattern whose size was removed. The flat
// `patterns` array is the source of truth (full-replace on save); upload appends, ✕ removes.
export function PatternsField() {
  const { control } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();
  const { fields, append, remove } = useFieldArray({ control, name: 'patterns' });
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];

  const sizeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);

  const rowsBySize = useMemo(() => {
    const m = new Map<number, Array<{ row: PatternRow; index: number }>>();
    fields.forEach((f, index) => {
      const row = f as PatternRow & { id: string };
      const sid = row.sizeId ?? 0;
      if (!m.has(sid)) m.set(sid, []);
      m.get(sid)!.push({ row, index });
    });
    return m;
  }, [fields]);

  // sizes that have patterns but are no longer in the card's range (size removed elsewhere).
  // sid 0 is the unset sentinel, not a real removed size — don't flag it as orphaned.
  const orphanSizeIds = [...rowsBySize.keys()].filter((sid) => sid > 0 && !sizeIds.includes(sid));

  if (sizeIds.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        задайте размерный ряд выше, чтобы загрузить выкройки по размерам
      </Text>
    );
  }

  return (
    <div className='space-y-4'>
      <Text variant='inactive' size='small'>
        финальные выкройки изделия — отдельный PDF на каждый размер (можно несколько листов на
        размер). Загруженный файл сохраняется вместе с тех картой.
      </Text>

      {sizeIds.map((id) => (
        <div key={id} className='space-y-2 border border-textInactiveColor p-3'>
          <Text variant='uppercase' size='small'>
            размер {formatSizeName(sizeById.get(id) ?? `#${id}`)}
          </Text>
          <PatternList rows={rowsBySize.get(id) ?? []} onRemove={remove} />
          <PatternUploadButton
            label='+ загрузить PDF'
            onUploaded={(p) => append({ sizeId: id, ...p })}
          />
        </div>
      ))}

      {orphanSizeIds.map((id) => (
        <div key={`orphan-${id}`} className='space-y-2 border border-warning p-3'>
          <Text size='small' className='block text-warning'>
            выкройки для размера #{id}, которого больше нет в размерном ряду — удалите или верните
            размер
          </Text>
          <PatternList rows={rowsBySize.get(id) ?? []} onRemove={remove} />
        </div>
      ))}
    </div>
  );
}
