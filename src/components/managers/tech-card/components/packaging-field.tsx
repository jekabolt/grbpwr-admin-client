import { ReactNode } from 'react';
import Text from 'ui/components/text';
import ComboField from 'ui/form/fields/combo-field';
import InputField from 'ui/form/fields/input-field';
import TextareaField from 'ui/form/fields/textarea-field';
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
  // Nothing is watched here any more — every control below is a self-binding form field. The
  // component used to subscribe to `packaging` only to feed the derived carton line described
  // below, and re-rendered the whole spec grid on every keystroke to do it.
  //
  // NO derived "N-piece run → M cartons · X kg" line here any more. It multiplied the card's
  // typical calculation size run (size_quantities), which no longer exists — a style has no run
  // size of its own. The carton/weight arithmetic moved to the RUN PACK (наряд на партию), where
  // it is computed from the run's real plan lines. What stays here is the SPEC — units per box,
  // dimensions, net/gross weight, polybag — which is a property of the style and is what the run
  // pack multiplies. Do not re-derive a run figure on this tab: there is nothing to derive it from.

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
                placeholder='e.g. 40×30×20'
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
    </div>
  );
}
