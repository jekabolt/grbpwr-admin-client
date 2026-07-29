import { cn } from 'lib/utility';
import { ReactNode, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import ComboField from 'ui/form/fields/combo-field';
import InputField from 'ui/form/fields/input-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { TechCardFormData } from './schema';
import {
  bagStickerOptions,
  foldingMethodOptions,
  insertsOptions,
  polybagOptions,
} from './tech-card-options';

// Packaging spec (Sheet «Этикетки и упаковка») drawn as what it physically is: a garment inside a
// polybag inside a carton. Three nested panels, each indented from its parent, each showing its own
// count and weight and opening into its own fields.
//
// This replaces the summary tiles + two-level <details>, where "edit packaging spec ▸ shipping
// carton ▸" put units-per-box, box marking, dimensions and gross weight two disclosures deep —
// invisible to the very people (shipping) who need to fill them. Nothing about the data changed:
// every field still round-trips (schema + map in/out) and prints to the tech pack, and the whole
// spec is still optional (mapPackagingOut sends it unset when every field is blank).

type PackagingValues = {
  foldingMethod?: string;
  polybag?: string;
  bagSticker?: string;
  inserts?: string;
  unitsPerBox?: number | string;
  boxMarking?: string;
  boxDimensions?: string;
  weightNetGrams?: number | string;
  weightGrossGrams?: number | string;
  notes?: string;
};

type Level = 'garment' | 'polybag' | 'carton';

const num = (v?: number | string): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const grams = (v?: number | string): string => {
  const n = num(v);
  return n > 0 ? `${n} g` : '';
};

const kilos = (g: number): string => `${(g / 1000).toFixed(g >= 10000 ? 0 : 1)} kg`;

const dotted = (...parts: Array<string | undefined>) =>
  parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' · ');

// One nesting level. The box IS the drawing — a bordered panel indented from the one above it —
// so the containment reads before you open anything.
function NestPanel({
  title,
  meta,
  sub,
  indent,
  open,
  onToggle,
  children,
}: {
  title: string;
  meta?: string;
  sub?: string;
  indent: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={cn('border border-borderColor p-2.5', indent)}>
      <button
        type='button'
        onClick={onToggle}
        aria-expanded={open}
        className='flex w-full items-baseline gap-2 text-left'
      >
        <Text size='control' component='span' tracking='label' className='font-bold uppercase'>
          {title}
        </Text>
        {meta ? (
          <Text size='micro' variant='label' component='span' className='truncate'>
            {meta}
          </Text>
        ) : null}
        <span className='ml-auto shrink-0 text-labelColor' aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {sub ? (
        <Text size='micro' variant='label' className='mt-0.5 truncate'>
          {sub}
        </Text>
      ) : null}
      {open && <div className='mt-2 border-t border-hairline pt-2'>{children}</div>}
    </div>
  );
}

export function PackagingField() {
  const { control } = useFormContext<TechCardFormData>();
  const pkg = (useWatch({ control, name: 'packaging' }) ?? {}) as PackagingValues;
  const sizeQuantities = (useWatch({ control, name: 'sizeQuantities' }) ?? []) as Array<{
    orderQty?: number;
  }>;
  const [open, setOpen] = useState<Level | null>(null);
  const toggle = (level: Level) => setOpen((prev) => (prev === level ? null : level));

  const perBox = num(pkg.unitsPerBox);
  const grossG = num(pkg.weightGrossGrams);
  const netG = num(pkg.weightNetGrams);

  // The derived line reads the size run off the patterns tab (size_quantities), so "how many
  // cartons does this style ship in" answers itself instead of being arithmetic on a napkin.
  const run = sizeQuantities.reduce((n, q) => n + (q.orderQty ?? 0), 0);
  const cartons = run > 0 && perBox > 0 ? Math.ceil(run / perBox) : 0;
  const runWeightG = cartons > 0 && grossG > 0 ? cartons * grossG : run > 0 ? run * netG : 0;

  return (
    <div id='packaging-spec' className='flex flex-col gap-1.5'>
      <NestPanel
        title='1 garment'
        meta={grams(pkg.weightNetGrams) || 'net weight not set'}
        sub={dotted(pkg.foldingMethod, pkg.inserts) || 'folding / inserts not set'}
        indent=''
        open={open === 'garment'}
        onToggle={() => toggle('garment')}
      >
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
          <ComboField
            name='packaging.foldingMethod'
            label='folding method'
            options={foldingMethodOptions}
          />
          <ComboField name='packaging.inserts' label='inserts' options={insertsOptions} />
          <InputField
            name='packaging.weightNetGrams'
            type='number'
            valueAsNumber
            keyboardRestriction={/[0-9]/}
            label='weight net (g)'
          />
          <div className='sm:col-span-2'>
            <TextareaField name='packaging.notes' label='notes' rows={2} maxLength={2000} />
          </div>
        </div>
      </NestPanel>

      <NestPanel
        title='1 polybag'
        meta={pkg.polybag?.trim() || 'polybag not set'}
        sub={pkg.bagSticker?.trim() ? `sticker: ${pkg.bagSticker.trim()}` : 'no bag sticker set'}
        indent='ml-3'
        open={open === 'polybag'}
        onToggle={() => toggle('polybag')}
      >
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
          <ComboField
            name='packaging.polybag'
            label='polybag (type / size)'
            options={polybagOptions}
          />
          <ComboField name='packaging.bagSticker' label='bag sticker' options={bagStickerOptions} />
        </div>
      </NestPanel>

      <NestPanel
        title={perBox > 0 ? `${perBox} per carton` : 'carton'}
        meta={dotted(pkg.boxDimensions, grossG > 0 ? `${kilos(grossG)} gross` : '') || 'not set'}
        sub={pkg.boxMarking?.trim() ? `marking: ${pkg.boxMarking.trim()}` : 'no carton marking set'}
        indent='ml-6'
        open={open === 'carton'}
        onToggle={() => toggle('carton')}
      >
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
          <InputField
            name='packaging.unitsPerBox'
            type='number'
            valueAsNumber
            keyboardRestriction={/[0-9]/}
            label='units per box'
          />
          <InputField
            name='packaging.boxMarking'
            label='box marking'
            placeholder='style number + qty'
          />
          <InputField
            name='packaging.boxDimensions'
            label='box dimensions (L×W×H)'
            placeholder='напр. 40×30×20'
          />
          <InputField
            name='packaging.weightGrossGrams'
            type='number'
            valueAsNumber
            keyboardRestriction={/[0-9]/}
            label='weight gross (g)'
          />
        </div>
      </NestPanel>

      {run > 0 && (
        <Text size='micro' variant='label'>
          {`${run}-piece run`}
          {cartons > 0
            ? ` → ${cartons} ${cartons === 1 ? 'carton' : 'cartons'}`
            : ' → set units per box for a carton count'}
          {runWeightG > 0 ? ` · ${kilos(runWeightG)}` : ''}
        </Text>
      )}
    </div>
  );
}
