import { useId, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Button, Input, Text } from 'ui';

import { CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1 } from './cad-mannequin-arrangement-document-v1';
import { usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1 } from './cad-workbench-split-shell-v1';
import {
  formatPatternImportDxfPhaseEMeasurementValueV1,
  patternImportDxfPhaseEMillimetresPerUnitV1,
  type PatternImportDxfPhaseEMeasurementUnitV1,
} from './measurement-units-v1';

const WORLD_AXES = [
  { label: 'X', component: 0 },
  { label: 'Y', component: 1 },
  { label: 'Z', component: 2 },
] as const;

type WorldAxis = (typeof WORLD_AXES)[number];

function OffsetField({
  axis,
  unit,
  committedM,
  onApply,
}: Readonly<{
  axis: WorldAxis['label'];
  unit: PatternImportDxfPhaseEMeasurementUnitV1;
  committedM: number;
  onApply: (valueM: number) => void;
}>) {
  const [draft, setDraft] = useState<string | null>(null);
  const fieldId = useId();
  const committed = formatPatternImportDxfPhaseEMeasurementValueV1(committedM * 1000, unit);
  const enteredM = draft?.trim()
    ? (Number(draft) * patternImportDxfPhaseEMillimetresPerUnitV1(unit)) / 1000
    : NaN;
  const valid =
    Number.isFinite(enteredM) &&
    Math.abs(enteredM) <= CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxOffsetMetres;
  const changed = draft !== null && valid && enteredM !== committedM;
  const invalid = draft !== null && draft !== '' && !valid;

  const apply = () => {
    if (!changed) return;
    onApply(enteredM === 0 ? 0 : enteredM);
    setDraft(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      apply();
    }
    if (event.key === 'Escape' && draft !== null) {
      event.preventDefault();
      event.stopPropagation();
      setDraft(null);
    }
  };

  return (
    <>
      <Input
        type='number'
        step='any'
        name={fieldId}
        data-cad-mannequin-pattern-offset=''
        aria-label={`${axis} offset from staged position (${unit})`}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${fieldId}-error` : undefined}
        value={draft ?? String(committed.value)}
        className='w-24 tabular-nums'
        onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.currentTarget.value)}
        onKeyDown={onKeyDown}
      />
      <Text component='span' size='micro' variant='label'>
        {unit}
      </Text>
      <Button type='button' size='xs' variant='secondary' disabled={!changed} onClick={apply}>
        Apply offset
      </Button>
      {invalid ? (
        <Text component='span' size='micro' variant='errorLabel' id={`${fieldId}-error`}>
          Enter an offset within ±{CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxOffsetMetres} m
        </Text>
      ) : null}
    </>
  );
}

export function CadMannequinPatternOffsetControlsV1({
  offsetM,
  onApply,
}: Readonly<{
  offsetM: readonly [number, number, number];
  onApply: (axis: WorldAxis['component'], valueM: number) => void;
}>) {
  const [axis, setAxis] = useState<WorldAxis>(WORLD_AXES[0]);
  const unit = usePatternImportDxfPhaseECadWorkbenchMeasurementUnitV1()?.unit ?? 'mm';
  const committedM = offsetM[axis.component];

  return (
    <div className='flex shrink-0 flex-wrap items-center gap-1 border-b border-borderColor px-2 py-1'>
      <Text component='span' size='micro' variant='label'>
        World offset from staged position
      </Text>
      <div role='group' aria-label='World offset axis' className='flex items-center gap-1'>
        {WORLD_AXES.map((option) => (
          <Button
            key={option.label}
            type='button'
            size='xs'
            variant={axis === option ? 'simpleReverseWithBorder' : 'underline'}
            aria-label={`${option.label} world offset axis`}
            aria-pressed={axis === option}
            onClick={() => setAxis(option)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <OffsetField
        key={`${axis.label}:${unit}:${committedM}`}
        axis={axis.label}
        unit={unit}
        committedM={committedM}
        onApply={(valueM) => onApply(axis.component, valueM)}
      />
    </div>
  );
}
