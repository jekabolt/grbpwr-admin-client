import { ReactNode } from 'react';
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

// Packaging spec (Sheet «Этикетки и упаковка») drawn as a small grid of scannable cards, one per
// logical group — folding & inserts, polybag, carton — so the specs shipping actually fills (units
// per box, box marking, box dimensions L×W×H, net/gross weight) read at a glance instead of sitting
// two disclosures deep.
//
// This replaces the nested garment ▸ polybag ▸ carton panels, where "edit packaging spec ▸ shipping
// carton ▸" buried units-per-box, dimensions and weights. Nothing about the data changed: every
// field still round-trips (schema + map in/out) and prints to the tech pack, and the whole spec is
// still optional (mapPackagingOut sends it unset when every field is blank).

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

const num = (v?: number | string): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const kilos = (g: number): string => `${(g / 1000).toFixed(g >= 10000 ? 0 : 1)} kg`;

// A scannable spec card: a bordered white tile with an uppercase group title over its fields.
function SpecCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className='border border-borderColor bg-bgColor p-3'>
      <Text size='control' tracking='label' className='mb-2 font-bold uppercase'>
        {title}
      </Text>
      {children}
    </div>
  );
}

export function PackagingField() {
  const { control } = useFormContext<TechCardFormData>();
  const pkg = (useWatch({ control, name: 'packaging' }) ?? {}) as PackagingValues;
  const sizeQuantities = (useWatch({ control, name: 'sizeQuantities' }) ?? []) as Array<{
    orderQty?: number;
  }>;

  const perBox = num(pkg.unitsPerBox);
  const grossG = num(pkg.weightGrossGrams);
  const netG = num(pkg.weightNetGrams);

  // The derived line reads the size run off the patterns tab (size_quantities), so "how many
  // cartons does this style ship in" answers itself instead of being arithmetic on a napkin.
  const run = sizeQuantities.reduce((n, q) => n + (q.orderQty ?? 0), 0);
  const cartons = run > 0 && perBox > 0 ? Math.ceil(run / perBox) : 0;
  const runWeightG = cartons > 0 && grossG > 0 ? cartons * grossG : run > 0 ? run * netG : 0;

  return (
    <div id='packaging-spec' className='flex flex-col gap-3'>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <SpecCard title='folding & inserts'>
          <div className='flex flex-col gap-2'>
            <ComboField
              name='packaging.foldingMethod'
              label='folding method'
              options={foldingMethodOptions}
            />
            <ComboField name='packaging.inserts' label='inserts' options={insertsOptions} />
          </div>
        </SpecCard>

        <SpecCard title='polybag'>
          <div className='flex flex-col gap-2'>
            <ComboField
              name='packaging.polybag'
              label='polybag (type / size)'
              options={polybagOptions}
            />
            <ComboField
              name='packaging.bagSticker'
              label='bag sticker'
              options={bagStickerOptions}
            />
          </div>
        </SpecCard>

        <div className='sm:col-span-2'>
          <SpecCard title='carton'>
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
              <InputField
                name='packaging.weightNetGrams'
                type='number'
                valueAsNumber
                keyboardRestriction={/[0-9]/}
                label='weight net (g)'
              />
            </div>
          </SpecCard>
        </div>
      </div>

      <TextareaField name='packaging.notes' label='notes' rows={2} maxLength={2000} />

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
