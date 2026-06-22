import { techCardSignoffSectionOptions, techCardSignoffStateOptions } from 'constants/filter';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { TechCardFormData } from './schema';

const emptySignoff = {
  section: 'TECH_CARD_SIGNOFF_SECTION_DESIGN',
  state: 'TECH_CARD_SIGNOFF_STATE_PENDING',
  signedBy: '',
  signedAt: '',
  note: '',
};

// Per-section sign-off — one responsible role approves a sheet, so the header
// approval_state isn't the only gate. One row per section (unique per card).
export function SignoffsField() {
  const { control } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'signoffs' });

  return (
    <div className='space-y-3'>
      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          no sign-offs
        </Text>
      ) : (
        <div className='space-y-2'>
          {fields.map((f, index) => (
            <div
              key={f.id}
              className='grid grid-cols-1 items-end gap-2 border border-textInactiveColor p-2 lg:grid-cols-5'
            >
              <SelectField
                name={`signoffs.${index}.section`}
                label='section'
                items={techCardSignoffSectionOptions}
              />
              <SelectField
                name={`signoffs.${index}.state`}
                label='state'
                items={techCardSignoffStateOptions}
              />
              <InputField name={`signoffs.${index}.signedBy`} label='signed by' />
              <InputField name={`signoffs.${index}.signedAt`} type='date' label='signed at' />
              <div className='flex items-end gap-2'>
                <div className='flex-1'>
                  <InputField name={`signoffs.${index}.note`} label='note' />
                </div>
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='remove sign-off'
                  onClick={() => remove(index)}
                >
                  ✕
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        type='button'
        variant='main'
        className='uppercase'
        onClick={() => append({ ...emptySignoff })}
      >
        sign a section
      </Button>
    </div>
  );
}
