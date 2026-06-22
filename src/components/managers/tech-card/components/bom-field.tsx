import { techCardBomSectionOptions, techCardFabricDirectionOptions } from 'constants/filter';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { multiplyDecimalInputs } from 'utils/decimal';
import { TechCardFormData } from './schema';

const emptyBomItem = {
  section: 'TECH_CARD_BOM_SECTION_FABRIC',
  name: '',
  placement: '',
  supplier: '',
  supplierRef: '',
  color: '',
  composition: '',
  spec: '',
  consumption: '',
  unit: '',
  quantity: '',
  unitPrice: '',
  currency: '',
  comment: '',
  colorwayColors: [],
};

// One BOM line (Sheet «Спецификация»). Decimals (consumption/quantity/unit_price) are
// edited as strings. line_total is server-computed (output-only) — shown here only as a
// live client preview. Per-colourway colour cells reference colourways by index.
function BomItemRow({ index, onRemove }: { index: number; onRemove: () => void }) {
  const { control } = useFormContext<TechCardFormData>();
  const colorwayColors = useFieldArray({
    control,
    name: `bomItems.${index}.colorwayColors` as `bomItems.${number}.colorwayColors`,
  });
  const colorways = (useWatch({ control, name: 'colorways' }) ?? []) as Array<{
    name?: string;
    code?: string;
  }>;

  const consumption = useWatch({ control, name: `bomItems.${index}.consumption` }) as string;
  const quantity = useWatch({ control, name: `bomItems.${index}.quantity` }) as string;
  const unitPrice = useWatch({ control, name: `bomItems.${index}.unitPrice` }) as string;
  // proto: line_total = quantity*unit_price (else consumption*unit_price)
  const lineTotal = multiplyDecimalInputs(quantity?.trim() ? quantity : consumption, unitPrice);

  const colorwayOptions = colorways.map((c, i) => ({
    value: i,
    label: c.name ? `${c.name}${c.code ? ` (${c.code})` : ''}` : `colourway ${i + 1}`,
  }));

  return (
    <div className='space-y-3 border border-textInactiveColor p-3'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='small'>
          line {index + 1}
        </Text>
        <Button type='button' variant='secondary' aria-label='remove BOM line' onClick={onRemove}>
          ✕
        </Button>
      </div>

      <div className='grid grid-cols-1 gap-3 lg:grid-cols-3'>
        <SelectField
          name={`bomItems.${index}.section`}
          label='section *'
          items={techCardBomSectionOptions}
        />
        <InputField name={`bomItems.${index}.name`} label='name *' />
        <InputField name={`bomItems.${index}.placement`} label='placement' />
        <InputField name={`bomItems.${index}.supplier`} label='supplier' />
        <InputField name={`bomItems.${index}.supplierRef`} label='supplier ref' />
        <InputField name={`bomItems.${index}.color`} label='color' />
        <InputField name={`bomItems.${index}.composition`} label='composition' />
        <InputField name={`bomItems.${index}.spec`} label='spec (width / weight)' />
        <InputField name={`bomItems.${index}.unit`} label='unit' placeholder='m / pcs' />
      </div>

      <div className='grid grid-cols-2 items-end gap-3 lg:grid-cols-5'>
        <InputField name={`bomItems.${index}.consumption`} label='consumption' />
        <InputField name={`bomItems.${index}.quantity`} label='quantity' />
        <InputField name={`bomItems.${index}.unitPrice`} label='unit price' />
        <InputField name={`bomItems.${index}.currency`} label='currency' placeholder='EUR' />
        <div className='space-y-1'>
          <Text variant='uppercase' size='small'>
            line total
          </Text>
          <Text variant='inactive'>{lineTotal || '—'}</Text>
        </div>
      </div>

      <TextareaField name={`bomItems.${index}.comment`} label='comment' rows={2} maxLength={1000} />

      <div className='space-y-2 border-t border-textInactiveColor pt-3'>
        <Text variant='uppercase' size='small'>
          fabric data (for the cutter)
        </Text>
        <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
          <InputField name={`bomItems.${index}.fabricWidth`} label='width (cm)' />
          <InputField name={`bomItems.${index}.fabricWeightGsm`} label='weight (g/m²)' />
          <SelectField
            name={`bomItems.${index}.fabricDirection`}
            label='direction'
            items={techCardFabricDirectionOptions}
          />
          <InputField name={`bomItems.${index}.wastagePercent`} label='wastage %' />
        </div>
      </div>

      <div className='space-y-2 border-t border-textInactiveColor pt-3'>
        <Text variant='uppercase' size='small'>
          colourway colours
        </Text>
        {colorways.length === 0 ? (
          <Text variant='inactive' size='small'>
            define colourways above to assign per-colourway colours
          </Text>
        ) : (
          <>
            {colorwayColors.fields.map((f, j) => (
              <div key={f.id} className='grid grid-cols-1 items-end gap-2 lg:grid-cols-4'>
                <SelectField
                  name={`bomItems.${index}.colorwayColors.${j}.colorwayIndex`}
                  label='colourway'
                  items={colorwayOptions}
                  valueAsNumber
                />
                <InputField name={`bomItems.${index}.colorwayColors.${j}.color`} label='color' />
                <InputField
                  name={`bomItems.${index}.colorwayColors.${j}.pantone`}
                  label='pantone'
                />
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='remove colour'
                  onClick={() => colorwayColors.remove(j)}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              type='button'
              className='uppercase'
              onClick={() => colorwayColors.append({ colorwayIndex: 0, color: '', pantone: '' })}
            >
              add colour
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// Bill of materials (Sheet «Спецификация»).
export function BomField() {
  const { control } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'bomItems' });

  return (
    <div className='space-y-4'>
      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          no BOM lines
        </Text>
      ) : (
        fields.map((f, index) => (
          <BomItemRow key={f.id} index={index} onRemove={() => remove(index)} />
        ))
      )}

      <Button
        type='button'
        variant='main'
        className='uppercase'
        onClick={() => append({ ...emptyBomItem })}
      >
        add BOM line
      </Button>
    </div>
  );
}
