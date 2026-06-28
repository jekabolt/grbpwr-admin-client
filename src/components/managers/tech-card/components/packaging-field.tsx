import ComboField from 'ui/form/fields/combo-field';
import DecimalField from 'ui/form/fields/decimal-field';
import InputField from 'ui/form/fields/input-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { bagStickerOptions, foldingMethodOptions, polybagOptions } from './tech-card-options';

// Packaging spec (Sheet «Этикетки и упаковка»). 1:1 — sent as unset when every field
// is blank (see mapPackagingOut).
export function PackagingField() {
  return (
    <div className='space-y-3'>
      <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
        <ComboField
          name='packaging.foldingMethod'
          label='folding method'
          options={foldingMethodOptions}
        />
        <ComboField
          name='packaging.polybag'
          label='polybag (type / size)'
          options={polybagOptions}
        />
        <ComboField name='packaging.bagSticker' label='bag sticker' options={bagStickerOptions} />
        <InputField name='packaging.inserts' label='inserts' />
        <InputField
          name='packaging.unitsPerBox'
          type='number'
          valueAsNumber
          keyboardRestriction={/[0-9]/}
          label='units per box'
        />
        <InputField name='packaging.boxMarking' label='box marking' />
        <InputField name='packaging.boxDimensions' label='box dimensions (L×W×H)' />
        <DecimalField name='packaging.weightNet' label='weight net' />
        <DecimalField name='packaging.weightGross' label='weight gross' />
      </div>
      <TextareaField name='packaging.notes' label='notes' rows={2} maxLength={2000} />
    </div>
  );
}
