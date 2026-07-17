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

// Packaging spec (Sheet «Этикетки и упаковка»). 1:1 — sent as unset when every field
// is blank (see mapPackagingOut). Nothing here is required by the backend, so the whole
// spec is collapsed by default — expand and fill in only what the factory actually needs.
export function PackagingField() {
  return (
    <details>
      <summary className='cursor-pointer select-none text-textBaseSize uppercase text-labelColor hover:text-text'>
        packaging spec — всё опционально, заполняйте только нужное фабрике
      </summary>
      <div className='mt-3 space-y-3'>
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
          <ComboField
            name='packaging.bagSticker'
            label='bag sticker'
            options={bagStickerOptions}
          />
          <ComboField name='packaging.inserts' label='inserts' options={insertsOptions} />
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
        </div>
        <div className='space-y-1.5'>
          <Text variant='label' size='small'>
            для отгрузки (нужен gross)
          </Text>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <InputField
              name='packaging.weightNetGrams'
              type='number'
              valueAsNumber
              keyboardRestriction={/[0-9]/}
              label='weight net (g)'
            />
            <InputField
              name='packaging.weightGrossGrams'
              type='number'
              valueAsNumber
              keyboardRestriction={/[0-9]/}
              label='weight gross (g)'
            />
          </div>
        </div>
        <TextareaField name='packaging.notes' label='notes' rows={2} maxLength={2000} />
      </div>
    </details>
  );
}
