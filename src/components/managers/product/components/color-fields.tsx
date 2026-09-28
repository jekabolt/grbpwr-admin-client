import {
  ColourwayPaletteEditor,
  type PaletteValue,
} from 'components/managers/tech-card/components/colourway-palette';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useFormContext } from 'react-hook-form';
import FieldsGroupContainer from 'ui/components/fields-group';
import InputField from 'ui/form/fields/input-field';
import Text from 'ui/components/text';

import type { ProductFormData } from '../utility/schema';

// T45: a colourway is its own name (+ translations per storefront language), a palette of 1…8
// colours (the first one main; each a pantone code or a label, hex for preview) and a mandatory
// dictionary FAMILY — the filter tag the catalogue and the assembly match on, no longer the SKU
// identity (the server mints the SKU token itself; see the header). The family is suggested from
// the main colour's hex with the server's own measure and confirmed or changed in the select.
// One editor for the studio window, the AI proposal and this form — so the operator finds the
// same questions in the same order wherever a colourway is born or edited.
export function ColorFields({ editMode }: { editMode: boolean }) {
  const { dictionary } = useDictionary();
  const { watch, setValue, formState } = useFormContext<ProductFormData>();

  const colorCode = watch('product.productBodyInsert.colorCode') as string | undefined;
  const development = watch('product.development');
  // Per-colourway shade tweak; when empty the storefront falls back to the family's hex.
  const hexOverride = watch('product.productBodyInsert.colorHexOverride') as string | undefined;

  const value: PaletteValue = {
    name: development?.name ?? '',
    rows: development?.colours ?? [],
    colorCode: colorCode ?? '',
    nameI18n: development?.nameI18n ?? {},
  };
  const onChange = (next: PaletteValue) => {
    const opts = { shouldDirty: true, shouldValidate: true } as const;
    if (next.colorCode !== value.colorCode) {
      setValue('product.productBodyInsert.colorCode', next.colorCode, opts);
    }
    setValue(
      'product.development',
      { name: next.name, colours: next.rows, nameI18n: next.nameI18n },
      opts,
    );
  };

  const devErrors = formState.errors.product?.development;
  const devError =
    devErrors?.name?.message ?? devErrors?.colours?.message ?? devErrors?.message ?? '';
  const familyError = formState.errors.product?.productBodyInsert?.colorCode?.message;
  const activeColors = (dictionary?.colors ?? []).filter((c) => !c.archived && c.code);

  return (
    <div className='space-y-3'>
      <ColourwayPaletteEditor
        name='product'
        value={value}
        onChange={onChange}
        colours={dictionary?.colors}
        languages={dictionary?.languages}
        readOnly={!editMode}
      />
      {editMode && (devError || familyError) && (
        <Text size='small' variant='error' className='normal-case' data-product-colour-error=''>
          {String(devError || familyError)}
        </Text>
      )}

      {/* The family drives the storefront swatch; the hex override is a rarely-used per-colourway
          shade tweak, so it lives behind "advanced". Auto-opens when an override is actually set so
          an active tweak is never hidden. The field is preserved — utils keeps the
          undefined-when-empty round-trip. */}
      <FieldsGroupContainer
        title='advanced'
        isOpen={Boolean(hexOverride)}
        childrenSpacingClass='space-y-3'
        headerContentGapClass='space-y-3'
      >
        <InputField
          type='color'
          name='product.productBodyInsert.colorHexOverride'
          label='color hex override (optional)'
          readOnly={!editMode}
        />
      </FieldsGroupContainer>
      {!activeColors.length && (
        <Text variant='inactive' size='small'>
          no colors in the dictionary yet — add them under dictionaries › colors
        </Text>
      )}
    </div>
  );
}
