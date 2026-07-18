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
//
// Two tiers of disclosure: the default view keeps the per-garment fields (how THIS style is
// folded/bagged and its own net weight). Per-shipment carton logistics and the brand-wide
// label defaults live one level deeper, in a nested collapsed block — rarely touched, so they
// don't crowd the fields that change per style. Every field still round-trips (schema + map
// in/out) and prints to the tech pack; only their placement changes.
export function PackagingField() {
  return (
    <details>
      <summary className='cursor-pointer select-none text-textBaseSize uppercase text-labelColor hover:text-text'>
        packaging spec — всё опционально, заполняйте только нужное фабрике
      </summary>
      <div className='mt-3 space-y-3'>
        {/* Per-garment: how this style is folded/bagged and its own net weight. */}
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
          <InputField
            name='packaging.weightNetGrams'
            type='number'
            valueAsNumber
            keyboardRestriction={/[0-9]/}
            label='weight net (g)'
          />
        </div>

        <TextareaField name='packaging.notes' label='notes' rows={2} maxLength={2000} />

        {/* Per-shipment logistics + brand-wide label defaults — rarely edited per style, so
            they're one level deeper. All fields still round-trip and print to the tech pack. */}
        <details className='border border-textInactiveColor'>
          <summary className='cursor-pointer select-none px-3 py-2 text-textBaseSize uppercase hover:bg-highlightColor/5'>
            shipping carton (optional) — логистика отгрузки, не дизайн изделия
          </summary>
          <div className='flex flex-col gap-3 border-t border-textInactiveColor p-3'>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
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

            {/* Brand-wide defaults — usually the same for every style (see the Labels tab).
                Kept here (still in the schema + PDF) so they don't restate Labels up top. */}
            <div className='space-y-3 border-t border-textInactiveColor pt-3'>
              <Text variant='label' size='small'>
                бренд-умолчания — обычно одинаковы для всех стилей (см. вкладку Labels)
              </Text>
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                <ComboField
                  name='packaging.bagSticker'
                  label='bag sticker'
                  options={bagStickerOptions}
                />
                <ComboField name='packaging.inserts' label='inserts' options={insertsOptions} />
              </div>
            </div>
          </div>
        </details>
      </div>
    </details>
  );
}
