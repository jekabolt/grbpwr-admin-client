import { useController, useFormContext, useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import Tooltip, { TooltipProvider } from 'ui/components/tooltip';
import { MeasurementPictogram } from './measurement-pictograms';
import { BODY_MEASUREMENT_GROUPS } from './measurements';

// One inline measurement row: label on the left, a plain (non-spinner) numeric
// text field on the right. Tabbing moves straight down the list.
//
// The label doubles as a hover/focus tooltip trigger showing a small pictogram of where/how
// the measurement is taken on a body (admin #63) — names like "high hip" vs "hip" or "across
// front" vs "across back" aren't self-explanatory at a glance.
function MeasurementInput({
  name,
  label,
  measurementName,
}: {
  name: string;
  label: string;
  measurementName: string;
}) {
  const { control } = useFormContext();
  const { field } = useController({ control, name });
  return (
    <label className='flex items-center justify-between gap-2 py-1'>
      <Tooltip
        trigger={
          <span
            tabIndex={0}
            className='w-fit cursor-help underline decoration-textInactiveColor decoration-dotted underline-offset-4 focus:outline-none focus-visible:decoration-textColor'
          >
            <Text size='small' component='span'>
              {label}
            </Text>
          </span>
        }
      >
        <div className='flex w-24 flex-col items-center gap-1.5'>
          <MeasurementPictogram measurementName={measurementName} label={label} />
          <Text variant='inactive' size='small' className='text-center leading-tight'>
            {label}
          </Text>
        </div>
      </Tooltip>
      <span className='flex shrink-0 items-center gap-1'>
        <input
          type='text'
          inputMode='numeric'
          value={field.value ?? ''}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^0-9]/g, '');
            field.onChange(digits === '' ? undefined : parseInt(digits, 10));
          }}
          placeholder='—'
          className='w-20 border border-textInactiveColor bg-bgColor px-2 py-1 text-right text-textBaseSize focus:border-textInactiveColor focus:outline-none'
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
    <TooltipProvider delayDuration={200} skipDelayDuration={150}>
      <div className='space-y-8'>
        <Text variant='inactive' size='small'>
          all values in mm · {filled}/{totalCount} filled
        </Text>
        {BODY_MEASUREMENT_GROUPS.map((group) => (
          <div key={group.title} className='space-y-2'>
            <Text variant='uppercase' className='border-b border-textInactiveColor pb-1'>
              {group.title}
            </Text>
            <div className='grid grid-cols-1 gap-x-10 gap-y-1 sm:grid-cols-2'>
              {group.measurements.map((m) => (
                <MeasurementInput
                  key={m.name}
                  name={`measurements.${m.name}`}
                  label={m.label}
                  measurementName={m.name}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}
