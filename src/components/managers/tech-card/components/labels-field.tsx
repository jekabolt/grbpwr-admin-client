import { techCardLabelTypeOptions } from 'constants/filter';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { TechCardFormData } from './schema';

const emptyLabel = {
  labelType: 'TECH_CARD_LABEL_TYPE_MAIN',
  content: '',
  placement: '',
  attachment: '',
  size: '',
  note: '',
};

// Labels / tags (Sheet «Этикетки и упаковка»). label_type is required on each.
export function LabelsField() {
  const { control } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'labels' });

  return (
    <div className='space-y-3'>
      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          no labels
        </Text>
      ) : (
        <div className='space-y-3'>
          {fields.map((f, index) => (
            <div key={f.id} className='space-y-3 border border-textInactiveColor p-3'>
              <div className='flex items-center justify-between'>
                <Text variant='uppercase' size='small'>
                  label {index + 1}
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='remove label'
                  onClick={() => remove(index)}
                >
                  ✕
                </Button>
              </div>
              <div className='grid grid-cols-1 gap-3 lg:grid-cols-3'>
                <SelectField
                  name={`labels.${index}.labelType`}
                  label='type *'
                  items={techCardLabelTypeOptions}
                />
                <InputField name={`labels.${index}.content`} label='content / ref' />
                <InputField name={`labels.${index}.placement`} label='placement' />
                <InputField name={`labels.${index}.attachment`} label='attachment' />
                <InputField name={`labels.${index}.size`} label='size' />
                <InputField name={`labels.${index}.note`} label='note' />
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        type='button'
        variant='main'
        className='uppercase'
        onClick={() => append({ ...emptyLabel })}
      >
        add label
      </Button>
    </div>
  );
}
