import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import { FittingFormData } from './schema';

type FormChangeRequest = { resolved?: boolean };

// The "what to change" work list a fitting produces. Each item can optionally reference a photo
// callout number and is toggled resolved when carried into the tech card. Full-replace on save.
export function ChangeRequestsFields() {
  const { control } = useFormContext<FittingFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'changeRequests' });
  const items = (useWatch({ control, name: 'changeRequests' }) ?? []) as FormChangeRequest[];

  return (
    <div className='space-y-3'>
      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          нет замечаний к доработке
        </Text>
      ) : (
        fields.map((f, index) => (
          <div key={f.id} className='space-y-2 border border-textInactiveColor p-3'>
            <div className='flex items-center justify-between'>
              <Text variant='uppercase' size='small'>
                change #{index + 1}
                {items[index]?.resolved ? ' · resolved' : ''}
              </Text>
              <Button
                type='button'
                variant='secondary'
                aria-label='remove change request'
                onClick={() => remove(index)}
              >
                ✕
              </Button>
            </div>
            <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
              <InputField
                name={`changeRequests.${index}.target`}
                label='target (part / area)'
                placeholder='sleeve, collar…'
              />
              <InputField
                name={`changeRequests.${index}.note`}
                label='what to change'
                placeholder='shorten 1cm'
              />
              <InputField
                name={`changeRequests.${index}.calloutNumber`}
                type='number'
                label='callout # (optional)'
                valueAsNumber
              />
            </div>
            <Controller
              control={control}
              name={`changeRequests.${index}.resolved`}
              render={({ field }) => (
                <label className='flex items-center gap-2'>
                  <input
                    type='checkbox'
                    checked={!!field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                  <Text size='small'>resolved (carried into the tech card)</Text>
                </label>
              )}
            />
          </div>
        ))
      )}
      <Button
        type='button'
        variant='main'
        className='uppercase'
        onClick={() => append({ id: 0, target: '', note: '', calloutNumber: 0, resolved: false })}
      >
        add change request
      </Button>
    </div>
  );
}
