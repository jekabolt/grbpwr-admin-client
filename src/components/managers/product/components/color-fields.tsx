import { colors } from 'constants/filter';
import { useFormContext } from 'react-hook-form';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';

export function ColorFields() {
  const { setValue } = useFormContext();

  const handleColorChange = (selectedColorName: string) => {
    const selectedColor = colors.find(
      (color) => color.name.toLowerCase().replace(/\s/g, '_') === selectedColorName,
    );

    if (selectedColor) {
      setValue('product.productBodyInsert.color', selectedColorName);
      setValue('product.productBodyInsert.colorHex', selectedColor.hex);
    }
  };

  return (
    <div className='space-y-3'>
      <SelectField
        fullWidth
        name='product.productBodyInsert.color'
        label='color'
        items={colors.map((color) => ({
          label: color.name.toLowerCase().replace(/\s/g, '_'),
          value: color.name.toLowerCase().replace(/\s/g, '_'),
        }))}
        onValueChange={handleColorChange}
      />
      <InputField type='color' name='product.productBodyInsert.colorHex' label='color hex' />
    </div>
  );
}
