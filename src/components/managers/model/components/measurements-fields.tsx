import { useController, useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import { BODY_MEASUREMENT_GROUPS } from './measurements';

// One inline measurement row: label on the left, a compact right-aligned mm input
// on the right. Tabbing moves straight down the list.
function MeasurementInput({ name, label }: { name: string; label: string }) {
  const { control } = useFormContext();
  const { field } = useController({ control, name });
  return (
    <label className='flex items-center justify-between gap-2 border-b border-dashed border-textInactiveColor py-1'>
      <Text size='small'>{label}</Text>
      <span className='flex shrink-0 items-center gap-1'>
        <input
          type='number'
          min={0}
          inputMode='numeric'
          value={field.value ?? ''}
          onChange={(e) =>
            field.onChange(
              e.target.value === '' ? undefined : Math.max(0, e.target.valueAsNumber || 0),
            )
          }
          // Prevent the mouse wheel from accidentally changing the value.
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          placeholder='—'
          className='w-16 border-b border-textColor bg-bgColor text-right text-textBaseSize focus:outline-none'
        />
        <Text variant='inactive' size='small'>
          mm
        </Text>
      </span>
    </label>
  );
}

export function MeasurementsFields() {
  const { control } = useFormContext();
  const measurements = (useWatch({ control, name: 'measurements' }) ?? {}) as Record<
    string,
    number | undefined
  >;
  const filled = Object.values(measurements).filter((v) => v != null && Number(v) > 0).length;
  const totalCount = BODY_MEASUREMENT_GROUPS.reduce((n, g) => n + g.measurements.length, 0);

  return (
    <div className='space-y-4'>
      <Text variant='inactive' size='small'>
        all values in mm · {filled}/{totalCount} filled
      </Text>
      {BODY_MEASUREMENT_GROUPS.map((group) => (
        <div key={group.title} className='space-y-1'>
          <Text variant='uppercase' size='small'>
            {group.title}
          </Text>
          <div className='grid grid-cols-1 gap-x-8 sm:grid-cols-2'>
            {group.measurements.map((m) => (
              <MeasurementInput key={m.name} name={`measurements.${m.name}`} label={m.label} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
