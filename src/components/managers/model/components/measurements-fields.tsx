import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import { BODY_MEASUREMENT_GROUPS } from './measurements';

export function MeasurementsFields() {
  return (
    <div className='space-y-4'>
      <Text variant='inactive' size='small'>
        all values in millimetres (mm) — leave blank if not measured
      </Text>
      {BODY_MEASUREMENT_GROUPS.map((group) => (
        <div key={group.title} className='space-y-2'>
          <Text variant='uppercase' size='small'>
            {group.title}
          </Text>
          <div className='grid grid-cols-2 gap-3 lg:grid-cols-3'>
            {group.measurements.map((m) => (
              <InputField
                key={m.name}
                name={`measurements.${m.name}`}
                label={m.label}
                type='number'
                min={0}
                step={1}
                valueAsNumber
                placeholder='mm'
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
