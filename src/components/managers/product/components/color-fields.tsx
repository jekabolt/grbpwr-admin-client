import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import Text from 'ui/components/text';

// R1/R9: colour identity is the controlled dictionary color_code (FK Dictionary.colors), not a
// hardcoded free-text name/hex. The picker is fed from DictionaryProvider; color_hex_override is an
// optional per-colourway shade tweak (when empty the storefront falls back to dictionary_color.hex).
export function ColorFields({ editMode }: { editMode: boolean }) {
  const { dictionary } = useDictionary();
  const { watch } = useFormContext();

  const activeColors = useMemo(
    () => (dictionary?.colors ?? []).filter((c) => !c.archived && c.code),
    [dictionary?.colors],
  );

  const selectedCode = watch('product.productBodyInsert.colorCode') as string | undefined;
  const selected = activeColors.find((c) => c.code === selectedCode);
  const swatch = (watch('product.productBodyInsert.colorHexOverride') as string) || selected?.hex;

  return (
    <div className='space-y-3'>
      <div className='flex items-end gap-3'>
        <div className='grow'>
          <SelectField
            fullWidth
            name='product.productBodyInsert.colorCode'
            label='color'
            items={activeColors.map((color) => ({
              label: `${color.code} · ${color.name ?? ''}`.trim(),
              value: color.code || '',
            }))}
            readOnly={!editMode}
          />
        </div>
        {swatch && (
          <span
            className='mb-1 inline-block h-8 w-8 shrink-0 border border-textInactiveColor'
            style={{ backgroundColor: swatch }}
            title={swatch}
          />
        )}
      </div>
      <InputField
        type='color'
        name='product.productBodyInsert.colorHexOverride'
        label='color hex override (optional)'
        readOnly={!editMode}
      />
      {!activeColors.length && (
        <Text variant='inactive' size='small'>
          no colors in the dictionary yet — add them under dictionaries › colors
        </Text>
      )}
    </div>
  );
}
