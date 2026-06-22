import InputField from 'ui/form/fields/input-field';
import TextareaField from 'ui/form/fields/textarea-field';

// Packaging spec (Sheet «Этикетки и упаковка»). 1:1 — sent as unset when every field
// is blank (see mapPackagingOut).
export function PackagingField() {
  return (
    <div className='space-y-3'>
      <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
        <InputField name='packaging.foldingMethod' label='folding method' />
        <InputField name='packaging.polybag' label='polybag (type / size)' />
        <InputField name='packaging.bagSticker' label='bag sticker' />
        <InputField name='packaging.inserts' label='inserts' />
        <InputField
          name='packaging.unitsPerBox'
          type='number'
          valueAsNumber
          label='units per box'
        />
        <InputField name='packaging.boxMarking' label='box marking' />
        <InputField name='packaging.boxDimensions' label='box dimensions (L×W×H)' />
        <InputField name='packaging.weightNet' label='weight net' />
        <InputField name='packaging.weightGross' label='weight gross' />
      </div>
      <TextareaField name='packaging.notes' label='notes' rows={2} maxLength={2000} />
    </div>
  );
}
