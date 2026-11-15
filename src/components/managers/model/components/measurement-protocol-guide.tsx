import {
  BODY_MEASUREMENT_PROTOCOL_V1,
  getBodyMeasurementProtocolFieldV1,
} from 'lib/cloth/body/measurement-protocol-v1';
import { FoldCaret, GroupLabel, Text } from 'ui';
import { useSheetMeasurementFocus } from './sheet-measurement-focus';
import { displayMeasurementValue, type MeasurementUnit, useMeasurementUnit } from './units';

export function formatProtocolToleranceV1(toleranceMm: number, unit: MeasurementUnit): string {
  return `${displayMeasurementValue(toleranceMm, unit)} ${unit}`;
}

export function MeasurementProtocolGuide() {
  const { active } = useSheetMeasurementFocus();
  const { unit } = useMeasurementUnit();
  const field = getBodyMeasurementProtocolFieldV1(active);

  return (
    <details
      className='group border-y border-borderColor py-2'
      data-measurement-protocol-guide={BODY_MEASUREMENT_PROTOCOL_V1.protocolId}
    >
      <summary className='flex cursor-pointer list-none items-center justify-between gap-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor [&::-webkit-details-marker]:hidden'>
        <Text
          component='span'
          size='micro'
          variant='label'
          tracking='group'
          className='font-bold uppercase'
        >
          measurement protocol v1 · {BODY_MEASUREMENT_PROTOCOL_V1.minimumIndependentObservations}{' '}
          readings
          <FoldCaret open='details' />
        </Text>
        {field && (
          <Text component='span' size='micro' variant='label' className='truncate text-right'>
            {field.label}
          </Text>
        )}
      </summary>

      <div className='flex flex-col gap-3 pt-3'>
        <ol className='grid list-decimal gap-1 pl-4 text-xs text-labelColor md:grid-cols-3 md:gap-4'>
          <li>
            <b className='text-textColor'>prepare</b> · close-fitting clothing, neutral stance,
            marked landmarks; tool in contact without compression or slack
          </li>
          <li>
            <b className='text-textColor'>repeat</b> · take 2 independent readings, releasing and
            repositioning the tool before the second
          </li>
          <li>
            <b className='text-textColor'>resolve</b> · if the spread exceeds tolerance, take a
            third; enter the rounded mean of the closest passing pair
          </li>
        </ol>

        {field ? (
          <div data-measurement-protocol-active-field={field.wireField}>
            <GroupLabel
              flush
              action={
                <Text component='span' size='micro' variant='label' className='tabular-nums'>
                  repeat tolerance {formatProtocolToleranceV1(field.repeatToleranceMm, unit)}
                </Text>
              }
            >
              <span className='text-textColor'>{field.label}</span>
            </GroupLabel>
            <div className='grid gap-x-5 gap-y-2 pt-2 text-xs md:grid-cols-2'>
              <Text size='micro' className='leading-relaxed text-textColor'>
                {field.shortDefinition}
              </Text>
              <Text size='micro' className='leading-relaxed'>
                <b className='text-textColor'>landmarks</b> · {field.landmarks.join('; ')}
              </Text>
              <Text size='micro' className='leading-relaxed'>
                <b className='text-textColor'>path</b> · {field.path}
              </Text>
              <Text size='micro' className='leading-relaxed'>
                <b className='text-textColor'>posture</b> · {field.posture}
              </Text>
            </div>
          </div>
        ) : (
          <Text size='micro' variant='errorLabel'>
            Protocol entry unavailable for the active measurement.
          </Text>
        )}

        <Text size='micro' className='border-t border-borderColor pt-2 leading-relaxed'>
          <b className='text-warning'>readings unrecorded</b> · source and protocol metadata stays
          bound only to an unchanged value; editing the number clears it. This form does not infer
          protocol use, and raw readings or operator identity are not stored
        </Text>
      </div>
    </details>
  );
}
