import {
  composition as dict,
  CompositionItem,
  CompositionStructure,
} from 'constants/garment-composition';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { FormLabel } from 'ui/form';
import { CompositionModal } from './composition-modal/composition-modal';
import { compositionToValue } from './composition-modal/utils';

// A BOM line snapshotted off a linked material carries its blend under `fibre`
// (materials/material-code.ts), a key `garment_parts` has no tab for — so the dialog used to open
// with every tab empty while that data sat invisible underneath it, blocking save on a sum no
// visible tab explained and double-printing on the care label once the operator re-entered the blend
// under `body`. Fold it into `body`, which is the tab that shows it. When `body` is already taken the
// key is left alone: GarmentPartTabs renders a chip for any key it does not know, so either way the
// data is visible and removable rather than hidden.
function foldMaterialFibres(structure: CompositionStructure): CompositionStructure {
  const parts = structure as Record<string, CompositionItem[] | undefined>;
  const fibres = parts.fibre;
  if (!fibres?.length || parts.body?.length) return structure;
  const next: Record<string, CompositionItem[] | undefined> = { ...parts, body: fibres };
  delete next.fibre;
  return next as CompositionStructure;
}

// Parse a stored composition string: the structured JSON the picker writes, or the legacy
// "COD:60, POL:40" form.
export function parseComposition(value?: string): CompositionStructure {
  const v = value?.trim();
  if (!v) return {};
  try {
    const parsed = JSON.parse(v) as unknown;
    // Valid JSON that is not an object of parts (a bare number, a string, an array) is not a
    // composition — hand back nothing rather than something Object.entries() will silently read as
    // empty further down.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return foldMaterialFibres(parsed as CompositionStructure);
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
    setValue(name, compositionToValue(c), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  return (
    <div className='space-y-1'>
      <FormLabel>{label}</FormLabel>
      <div className='flex items-center gap-1.5'>
        {/* The value is composed in the dialog, never typed — so it is a read-only PLATE, not an
            input that merely refuses keystrokes. */}
        <div className='min-h-[22px] min-w-0 flex-1 border border-borderColor bg-bgZebra px-[7px] py-[3px]'>
          <Text className={display ? 'truncate' : 'truncate text-textInactiveColor'}>
            {display || '—'}
          </Text>
        </div>
        {editMode && (
          <>
            {raw && (
              <Button
                type='button'
                size='xs'
                variant='secondary'
                className='shrink-0'
                onClick={() => selectComposition({})}
              >
                clear
              </Button>
            )}
            <Button
              type='button'
              size='sm'
              variant='secondary'
              className='shrink-0'
              onClick={() => setOpen(true)}
            >
              select
            </Button>
          </>
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
