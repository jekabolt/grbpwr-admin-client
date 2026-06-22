import { techCardIssueSeverityOptions, techCardIssueStatusOptions } from 'constants/filter';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { TechCardFormData } from './schema';

const emptyIssue = {
  operationNumber: 0,
  calloutNumber: 0,
  raisedBy: '',
  severity: 'TECH_CARD_ISSUE_SEVERITY_MEDIUM',
  status: 'TECH_CARD_ISSUE_STATUS_OPEN',
  description: '',
  resolutionNote: '',
};

// Maker-flagged construction issues ("this seam is impossible"), pinned to an operation
// number and/or a sketch callout number. Raised by the seamstress, resolved by the
// technologist / manager.
export function IssuesField() {
  const { control } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'issues' });

  return (
    <div className='space-y-3'>
      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          no issues flagged
        </Text>
      ) : (
        <div className='space-y-3'>
          {fields.map((f, index) => (
            <div key={f.id} className='space-y-3 border border-textInactiveColor p-3'>
              <div className='flex items-center justify-between'>
                <Text variant='uppercase' size='small'>
                  issue {index + 1}
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='remove issue'
                  onClick={() => remove(index)}
                >
                  ✕
                </Button>
              </div>
              <div className='grid grid-cols-2 gap-3 lg:grid-cols-5'>
                <SelectField
                  name={`issues.${index}.severity`}
                  label='severity'
                  items={techCardIssueSeverityOptions}
                />
                <SelectField
                  name={`issues.${index}.status`}
                  label='status'
                  items={techCardIssueStatusOptions}
                />
                <InputField name={`issues.${index}.raisedBy`} label='raised by' />
                <InputField
                  name={`issues.${index}.operationNumber`}
                  type='number'
                  valueAsNumber
                  label='op # (0 = none)'
                />
                <InputField
                  name={`issues.${index}.calloutNumber`}
                  type='number'
                  valueAsNumber
                  label='callout # (0 = none)'
                />
              </div>
              <TextareaField
                name={`issues.${index}.description`}
                label='description *'
                rows={2}
                maxLength={2000}
              />
              <TextareaField
                name={`issues.${index}.resolutionNote`}
                label='resolution note'
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
        onClick={() => append({ ...emptyIssue })}
      >
        flag an issue
      </Button>
    </div>
  );
}
