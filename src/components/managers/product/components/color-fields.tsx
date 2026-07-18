import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
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
  const { watch, setValue } = useFormContext();

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

      {/* Full colour palette as swatch tiles — the whole dictionary is pickable at a glance, not just
          from the dropdown. Add more colours under dictionaries › colors. */}
      {editMode && activeColors.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {activeColors.map((color) => {
            const isSelected = color.code === selectedCode;
            return (
              <button
                key={color.code}
                type='button'
                title={`${color.code} · ${color.name ?? ''}`.trim()}
                aria-pressed={isSelected}
                onClick={() =>
                  setValue('product.productBodyInsert.colorCode', color.code || '', {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                className={cn(
                  'h-7 w-7 border transition-transform hover:scale-110',
                  isSelected
                    ? 'border-textColor ring-1 ring-textColor'
                    : 'border-textInactiveColor',
                )}
                style={{ backgroundColor: color.hex || 'transparent' }}
              />
            );
          })}
        </div>
      )}

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
