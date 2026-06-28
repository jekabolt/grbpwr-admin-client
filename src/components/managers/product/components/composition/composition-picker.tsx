import { composition as dict, CompositionStructure } from 'constants/garment-composition';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import { FormLabel } from 'ui/form';
import { CompositionModal } from './composition-modal/composition-modal';

// Parse a stored composition string: the structured JSON the picker writes, or the legacy
// "COD:60, POL:40" form.
export function parseComposition(value?: string): CompositionStructure {
  const v = value?.trim();
  if (!v) return {};
  try {
    return JSON.parse(v) as CompositionStructure;
  } catch {
    const items = v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((it) => {
        const [code, p] = it.split(':').map((x) => x.trim());
        return { code, percent: parseInt(p, 10) || 0 };
      })
      .filter((i) => i.code);
    return items.length ? { body: items } : {};
  }
}

function formatComposition(structure: CompositionStructure): string {
  const parts: string[] = [];
  for (const [partKey, items] of Object.entries(structure)) {
    if (items && items.length > 0) {
      const partName = dict.garment_parts[partKey as keyof typeof dict.garment_parts] ?? partKey;
      const itemsStr = items
        .filter((i: { code: string; percent: number }) => i.percent > 0)
        .map((i: { code: string; percent: number }) => `${i.code}:${i.percent}%`)
        .join(', ');
      if (itemsStr) parts.push(`${partName}: ${itemsStr}`);
    }
  }
  return parts.join(' | ');
}

// A name-parameterized composition picker reusing the product CompositionModal. Stores the
// structured JSON in the given string form field; shows a readable summary. Used by the
// product form and the tech-card BOM article rows.
export function CompositionPicker({
  name,
  label = 'composition',
  editMode = true,
}: {
  name: string;
  label?: string;
  editMode?: boolean;
}) {
  const { setValue } = useFormContext();
  const [open, setOpen] = useState(false);
  const raw = (useWatch({ name }) as string) || '';

  const display = (() => {
    if (!raw) return '';
    try {
      return formatComposition(JSON.parse(raw));
    } catch {
      return raw;
    }
  })();

  const selectComposition = (c: CompositionStructure) => {
    setValue(name, Object.keys(c).length > 0 ? JSON.stringify(c) : '', {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  return (
    <div className='space-y-1'>
      <FormLabel>{label}</FormLabel>
      <div className='flex items-center gap-2 border-b border-textColor'>
        <Input value={display} readOnly placeholder='—' className='flex-1 border-none' />
        {editMode && (
          <div className='flex gap-1'>
            {raw && (
              <Button
                type='button'
                variant='simple'
                onClick={() => selectComposition({})}
                className='px-2 py-1 text-xs uppercase'
              >
                clear
              </Button>
            )}
            <Button
              type='button'
              variant='secondary'
              onClick={() => setOpen(true)}
              className='px-2 py-1 text-xs uppercase'
            >
              select
            </Button>
          </div>
        )}
      </div>
      <CompositionModal
        isOpen={open}
        selectedComposition={parseComposition(raw)}
        selectComposition={selectComposition}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
