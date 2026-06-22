import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { TechCardFormData } from './schema';

const emptyOperation = {
  node: '',
  description: '',
  seamType: '',
  stitchesPerCm: '',
  topstitchWidth: '',
  thread: '',
  note: '',
};

// Per-node sewing operations (Sheet «Обработка», lower block).
export function OperationsField() {
  const { control } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'operations' });

  return (
    <div className='space-y-3'>
      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          no operations
        </Text>
      ) : (
        <div className='space-y-3'>
          {fields.map((f, index) => (
            <div key={f.id} className='space-y-3 border border-textInactiveColor p-3'>
              <div className='flex items-center justify-between'>
                <Text variant='uppercase' size='small'>
                  operation {index + 1}
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='remove operation'
                  onClick={() => remove(index)}
                >
                  ✕
                </Button>
              </div>
              <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
                <InputField
                  name={`operations.${index}.operationNumber`}
                  type='number'
                  valueAsNumber
                  label='op # (10, 20…)'
                />
                <InputField name={`operations.${index}.node`} label='node *' />
                <InputField name={`operations.${index}.machine`} label='machine' />
                <InputField
                  name={`operations.${index}.timeNorm`}
                  label='SAM (min)'
                  placeholder='1.8'
                />
                <InputField name={`operations.${index}.seamType`} label='seam type' />
                <InputField name={`operations.${index}.seamAllowance`} label='seam allowance' />
                <InputField name={`operations.${index}.stitchesPerCm`} label='stitches / cm' />
                <InputField name={`operations.${index}.topstitchWidth`} label='topstitch width' />
                <InputField name={`operations.${index}.needle`} label='needle' />
                <InputField name={`operations.${index}.thread`} label='thread' />
              </div>
              <TextareaField
                name={`operations.${index}.description`}
                label='description'
                rows={2}
                maxLength={1000}
              />
              <TextareaField
                name={`operations.${index}.note`}
                label='note'
                rows={2}
                maxLength={1000}
              />
            </div>
          ))}
        </div>
      )}

      <Button
        type='button'
        variant='main'
        className='uppercase'
        onClick={() => append({ ...emptyOperation })}
      >
        add operation
      </Button>
    </div>
  );
}
