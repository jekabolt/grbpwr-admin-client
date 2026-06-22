import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { TechCardFormData } from './schema';

const emptyRevision = {
  version: '',
  revisionDate: '',
  author: '',
  section: '',
  changeNote: '',
};

// Spec-document changelog (what changed in which section, by whom). This is NOT fit
// history — fitting verdicts/measurements live in the separate fitting feature.
export function RevisionsField() {
  const { control } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'revisions' });

  return (
    <div className='space-y-3'>
      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          no revisions
        </Text>
      ) : (
        <div className='space-y-3'>
          {fields.map((f, index) => (
            <div key={f.id} className='space-y-3 border border-textInactiveColor p-3'>
              <div className='flex items-center justify-between'>
                <Text variant='uppercase' size='small'>
                  revision {index + 1}
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='remove revision'
                  onClick={() => remove(index)}
                >
                  ✕
                </Button>
              </div>
              <div className='grid grid-cols-1 gap-3 lg:grid-cols-4'>
                <InputField name={`revisions.${index}.version`} label='version' />
                <InputField name={`revisions.${index}.revisionDate`} type='date' label='date' />
                <InputField name={`revisions.${index}.author`} label='author' />
                <InputField name={`revisions.${index}.section`} label='section' />
              </div>
              <TextareaField
                name={`revisions.${index}.changeNote`}
                label='change note'
                rows={2}
                maxLength={2000}
              />
            </div>
          ))}
        </div>
      )}

      <Button
        type='button'
        variant='main'
        className='uppercase'
        onClick={() => append({ ...emptyRevision })}
      >
        add revision
      </Button>
    </div>
  );
}
