import { techCardIssueSeverityOptions, techCardIssueStatusOptions } from 'constants/filter';
import { useMemo } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
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

type PickerOption = { value: number; label: string };
type OpInfo = { node?: string; placement?: string };
type CalloutInfo = { part?: string };

// One maker-flagged issue. operationNumber/calloutNumber are pickers sourced from the card's own
// operations/callouts (:62) rather than raw number inputs — a typo or a since-renumbered operation
// used to silently misattribute a flagged defect to the wrong step. Each picker also resolves the
// node/part label next to the number so the pick is legible without cross-checking another tab.
function IssueRow({
  index,
  onRemove,
  operationOptions,
  operationByNumber,
  calloutOptions,
  calloutByNumber,
}: {
  index: number;
  onRemove: () => void;
  operationOptions: PickerOption[];
  operationByNumber: Map<number, OpInfo>;
  calloutOptions: PickerOption[];
  calloutByNumber: Map<number, CalloutInfo>;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const opNumber = (useWatch({ control, name: `issues.${index}.operationNumber` }) ?? 0) as number;
  const calloutNumber = (useWatch({ control, name: `issues.${index}.calloutNumber` }) ??
    0) as number;

  // If the referenced operation/callout was since removed or renumbered, keep the stored number
  // visible (as a flagged, findable option) instead of silently blanking the picker — losing the
  // number outright would be worse than showing it can't be resolved.
  const operationItems = useMemo(() => {
    if (!opNumber || operationByNumber.has(opNumber)) return operationOptions;
    return [...operationOptions, { value: opNumber, label: `#${opNumber} — not found (removed?)` }];
  }, [opNumber, operationOptions, operationByNumber]);
  const calloutItems = useMemo(() => {
    if (!calloutNumber || calloutByNumber.has(calloutNumber)) return calloutOptions;
    return [
      ...calloutOptions,
      { value: calloutNumber, label: `#${calloutNumber} — not found (removed?)` },
    ];
  }, [calloutNumber, calloutOptions, calloutByNumber]);

  const opInfo = opNumber ? operationByNumber.get(opNumber) : undefined;
  const calloutInfo = calloutNumber ? calloutByNumber.get(calloutNumber) : undefined;

  return (
    <div className='space-y-3 border border-textInactiveColor p-3'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='small'>
          issue {index + 1}
        </Text>
        <Button type='button' variant='secondary' aria-label='remove issue' onClick={onRemove}>
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
        <div className='space-y-1'>
          <SelectField
            name={`issues.${index}.operationNumber`}
            label='operation'
            items={operationItems}
            valueAsNumber
          />
          {opInfo && (
            <Text variant='inactive' size='small' className='truncate'>
              {[opInfo.node, opInfo.placement].filter(Boolean).join(' · ') || '—'}
            </Text>
          )}
        </div>
        <div className='space-y-1'>
          <SelectField
            name={`issues.${index}.calloutNumber`}
            label='sketch callout'
            items={calloutItems}
            valueAsNumber
          />
          {calloutInfo && (
            <Text variant='inactive' size='small' className='truncate'>
              {calloutInfo.part || '—'}
            </Text>
          )}
        </div>
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
  );
}

// Maker-flagged construction issues ("this seam is impossible"), pinned to an operation
// number and/or a sketch callout number. Raised by the seamstress, resolved by the
// technologist / manager.
export function IssuesField() {
  const { control } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'issues' });

  // Operation numbers are positional ((position+1)*10 — see operations-field.tsx / schema.ts),
  // not a stored id, so options are derived from the live `operations` array position, same as
  // OperationsField's own callout "pin" picker derives from `callouts`.
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as Array<{
    node?: string;
    placement?: string;
  }>;
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as Array<{
    number?: number;
    part?: string;
  }>;

  const operationOptions = useMemo<PickerOption[]>(
    () => [
      { value: 0, label: '— none —' },
      ...operations.map((o, i) => {
        const num = (i + 1) * 10;
        const info = [o.node, o.placement].filter(Boolean).join(' · ');
        return { value: num, label: `#${num}${info ? ` — ${info}` : ''}` };
      }),
    ],
    [operations],
  );
  const operationByNumber = useMemo(() => {
    const m = new Map<number, OpInfo>();
    operations.forEach((o, i) => m.set((i + 1) * 10, { node: o.node, placement: o.placement }));
    return m;
  }, [operations]);

  const calloutOptions = useMemo<PickerOption[]>(
    () => [
      { value: 0, label: '— none —' },
      ...callouts
        .filter((c) => (c.number ?? 0) > 0)
        .map((c) => ({
          value: c.number as number,
          label: `#${c.number}${c.part?.trim() ? ` ${c.part}` : ''}`,
        })),
    ],
    [callouts],
  );
  const calloutByNumber = useMemo(() => {
    const m = new Map<number, CalloutInfo>();
    callouts.forEach((c) => {
      if ((c.number ?? 0) > 0) m.set(c.number as number, { part: c.part });
    });
    return m;
  }, [callouts]);

  return (
    <div className='space-y-3'>
      {fields.length === 0 ? (
        <Text variant='inactive' size='small'>
          no issues flagged
        </Text>
      ) : (
        <div className='space-y-3'>
          {fields.map((f, index) => (
            <IssueRow
              key={f.id}
              index={index}
              onRemove={() => remove(index)}
              operationOptions={operationOptions}
              operationByNumber={operationByNumber}
              calloutOptions={calloutOptions}
              calloutByNumber={calloutByNumber}
            />
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
