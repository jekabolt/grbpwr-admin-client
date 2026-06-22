import { common_TechCard, common_TechCardPomActual } from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { techCardMeasurementUnitOptions } from 'constants/filter';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import TextareaField from 'ui/form/fields/textarea-field';
import { decimalToInput } from 'utils/decimal';
import { TechCardFormData } from './schema';

const unitLabels: Record<string, string> = Object.fromEntries(
  techCardMeasurementUnitOptions.map((o) => [o.value, o.label]),
);

const VERDICT: Record<string, { symbol: string; label: string }> = {
  TECH_CARD_POM_VERDICT_IN_TOLERANCE: { symbol: '✓', label: 'in' },
  TECH_CARD_POM_VERDICT_OVER: { symbol: '▲', label: 'over' },
  TECH_CARD_POM_VERDICT_UNDER: { symbol: '▼', label: 'under' },
};

// Renders the server-computed verdict/deviation of an actual (output-only). Stale once
// rows are reordered/added locally; refreshes on the next save + reload.
function VerdictBadge({ actual }: { actual?: common_TechCardPomActual }) {
  const v = actual?.verdict ? VERDICT[actual.verdict] : undefined;
  if (!v)
    return (
      <Text variant='inactive' size='small'>
        —
      </Text>
    );
  const dev = decimalToInput(actual?.deviation);
  const signed = dev && !dev.startsWith('-') ? `+${dev}` : dev;
  return (
    <Text size='small'>
      {v.symbol} {signed} {v.label}
    </Text>
  );
}

const emptyPomPoint = {
  section: '',
  code: '',
  name: '',
  howToMeasure: '',
  baseValue: '',
  tolerancePlus: '',
  toleranceMinus: '',
  grades: [],
  actuals: [],
};

// One point of measure (Sheet «Измерения»). Graded per size (sizeId ∈ size range);
// values are in the card's measurement_unit. Actuals optionally link a fitting.
function PomPointRow({
  index,
  unitLabel,
  sizeOptions,
  fittingOptions,
  originalActuals,
  onRemove,
}: {
  index: number;
  unitLabel: string;
  sizeOptions: Array<{ value: number; label: string }>;
  fittingOptions: Array<{ value: number; label: string }>;
  originalActuals: common_TechCardPomActual[];
  onRemove: () => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const grades = useFieldArray({
    control,
    name: `pomPoints.${index}.grades` as `pomPoints.${number}.grades`,
  });
  const actuals = useFieldArray({
    control,
    name: `pomPoints.${index}.actuals` as `pomPoints.${number}.actuals`,
  });

  return (
    <div className='space-y-3 border border-textInactiveColor p-3'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='small'>
          point {index + 1}
        </Text>
        <Button
          type='button'
          variant='secondary'
          aria-label='remove measurement'
          onClick={onRemove}
        >
          ✕
        </Button>
      </div>

      <div className='grid grid-cols-1 gap-3 lg:grid-cols-3'>
        <InputField
          name={`pomPoints.${index}.section`}
          label='section'
          placeholder='ВЕРХ / КОРПУС'
        />
        <InputField name={`pomPoints.${index}.code`} label='code' />
        <InputField name={`pomPoints.${index}.name`} label='name *' />
      </div>

      <TextareaField
        name={`pomPoints.${index}.howToMeasure`}
        label='how to measure'
        rows={2}
        maxLength={1000}
      />

      <div className='grid grid-cols-3 gap-3'>
        <InputField name={`pomPoints.${index}.baseValue`} label={`base (${unitLabel})`} />
        <InputField name={`pomPoints.${index}.tolerancePlus`} label='tolerance +' />
        <InputField name={`pomPoints.${index}.toleranceMinus`} label='tolerance −' />
      </div>

      <div className='space-y-2 border-t border-textInactiveColor pt-3'>
        <Text variant='uppercase' size='small'>
          graded values ({unitLabel})
        </Text>
        {sizeOptions.length === 0 ? (
          <Text variant='inactive' size='small'>
            pick sizes in the size range section to grade this point
          </Text>
        ) : (
          <>
            {grades.fields.map((f, j) => (
              <div key={f.id} className='grid grid-cols-1 items-end gap-2 lg:grid-cols-3'>
                <SelectField
                  name={`pomPoints.${index}.grades.${j}.sizeId`}
                  label='size'
                  items={sizeOptions}
                  valueAsNumber
                />
                <InputField name={`pomPoints.${index}.grades.${j}.value`} label='value' />
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='remove grade'
                  onClick={() => grades.remove(j)}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              type='button'
              className='uppercase'
              onClick={() => grades.append({ sizeId: sizeOptions[0]?.value ?? 0, value: '' })}
            >
              add size value
            </Button>
          </>
        )}
      </div>

      <div className='space-y-2 border-t border-textInactiveColor pt-3'>
        <Text variant='uppercase' size='small'>
          actuals
        </Text>
        {actuals.fields.map((f, j) => (
          <div key={f.id} className='grid grid-cols-1 items-end gap-2 lg:grid-cols-6'>
            <InputField
              name={`pomPoints.${index}.actuals.${j}.label`}
              label='label'
              placeholder='примерка 1'
            />
            <SelectField
              name={`pomPoints.${index}.actuals.${j}.sizeId`}
              label='size'
              items={[{ value: 0, label: '— size —' }, ...sizeOptions]}
              valueAsNumber
            />
            {fittingOptions.length > 0 ? (
              <SelectField
                name={`pomPoints.${index}.actuals.${j}.fittingId`}
                label='fitting'
                items={[{ value: 0, label: '— none —' }, ...fittingOptions]}
                valueAsNumber
              />
            ) : (
              <InputField
                name={`pomPoints.${index}.actuals.${j}.fittingId`}
                type='number'
                valueAsNumber
                label='fitting id'
              />
            )}
            <InputField name={`pomPoints.${index}.actuals.${j}.value`} label='value' />
            <div className='space-y-1'>
              <Text variant='uppercase' size='small'>
                verdict
              </Text>
              <VerdictBadge actual={originalActuals[j]} />
            </div>
            <Button
              type='button'
              variant='secondary'
              aria-label='remove actual'
              onClick={() => actuals.remove(j)}
            >
              ✕
            </Button>
          </div>
        ))}
        <Button
          type='button'
          className='uppercase'
          onClick={() => actuals.append({ fittingId: 0, label: '', value: '', sizeId: 0 })}
        >
          add actual
        </Button>
      </div>
    </div>
  );
}

// Points of measure (Sheet «Измерения»).
export function PomField({
  fittingOptions = [],
  techCard,
}: {
  fittingOptions?: Array<{ value: number; label: string }>;
  techCard?: common_TechCard;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'pomPoints' });
  const { dictionary } = useDictionary();

  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const measurementUnit = useWatch({ control, name: 'measurementUnit' }) as string | undefined;
  const unitLabel = unitLabels[measurementUnit ?? ''] ?? 'cm';

  const sizeById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);

  const sizeOptions = sizeIds.map((id) => ({
    value: id,
    label: formatSizeName(sizeById.get(id) ?? `#${id}`),
  }));

  return (
    <div className='space-y-4'>
      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          no measurements
        </Text>
      ) : (
        fields.map((f, index) => (
          <PomPointRow
            key={f.id}
            index={index}
            unitLabel={unitLabel}
            sizeOptions={sizeOptions}
            fittingOptions={fittingOptions}
            originalActuals={techCard?.techCard?.pomPoints?.[index]?.actuals ?? []}
            onRemove={() => remove(index)}
          />
        ))
      )}

      <Button
        type='button'
        variant='main'
        className='uppercase'
        onClick={() => append({ ...emptyPomPoint })}
      >
        add measurement
      </Button>
    </div>
  );
}
