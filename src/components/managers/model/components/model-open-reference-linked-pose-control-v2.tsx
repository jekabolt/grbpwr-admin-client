import {
  useEffect,
  useId,
  useRef,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import type { MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2 } from 'lib/cloth/body/measurement-open-reference-linked-symmetric-pose-lanes-diagnostic-v2';
import { Button, Chip, ChipRow, Input, Pill, Text } from 'ui';

export const MODEL_OPEN_REFERENCE_LINKED_POSE_CONTROL_V2 =
  'model-open-reference-linked-pose-control/v2' as const;
export const MODEL_OPEN_REFERENCE_LINKED_POSE_KEYBOARD_IDLE_MS_V2 = 250;

export type ModelOpenReferenceLinkedPoseControlStatusV2 = 'idle' | 'pending' | 'building' | 'error';

export interface ModelOpenReferenceLinkedPoseControlV2Props {
  readonly draftSelection: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2;
  readonly appliedSelection: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2 | null;
  readonly hasBuiltPreview: boolean;
  readonly status: ModelOpenReferenceLinkedPoseControlStatusV2;
  readonly onDraftChange: (
    selection: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2,
  ) => void;
  readonly onApply: (selection: MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2) => void;
}

type LinkedPoseSelectionV2 = MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2;
type TimerHandle = ReturnType<typeof setTimeout>;

interface ModelOpenReferenceLinkedPoseApplyCoordinatorOptionsV2 {
  readonly hasBuiltPreview: () => boolean;
  readonly appliedSelection: () => LinkedPoseSelectionV2 | null;
  readonly onDraftChange: (selection: LinkedPoseSelectionV2) => void;
  readonly onApply: (selection: LinkedPoseSelectionV2) => void;
  readonly schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  readonly cancel?: (handle: TimerHandle) => void;
}

export interface ModelOpenReferenceLinkedPoseApplyCoordinatorV2 {
  readonly beginPointer: () => void;
  readonly changeRange: (selection: LinkedPoseSelectionV2) => void;
  readonly finishPointer: () => void;
  readonly chooseImmediate: (selection: LinkedPoseSelectionV2) => void;
  readonly dispose: () => void;
}

const A_REST = Object.freeze({ lane: 'relax' as const, degrees: 0 as const });
const RELAXED = Object.freeze({ lane: 'relax' as const, degrees: 4 as const });
const NEAR_T = Object.freeze({ lane: 'raise' as const, degrees: 25 as const });
const PRESETS: readonly (readonly [label: string, selection: LinkedPoseSelectionV2])[] =
  Object.freeze([
    Object.freeze(['A-rest', A_REST] as const),
    Object.freeze(['Relaxed', RELAXED] as const),
    Object.freeze(['Near-T', NEAR_T] as const),
  ]);
const RELAX_VALUES = Object.freeze([0, 1, 2, 3, 4] as const);
const RAISE_VALUES = Object.freeze([5, 10, 15, 20, 25] as const);

function selectionKey(selection: LinkedPoseSelectionV2 | null): string {
  return selection == null ? 'not-built' : `${selection.lane}:${selection.degrees}`;
}

export function modelOpenReferenceLinkedPoseSelectionEqualV2(
  left: LinkedPoseSelectionV2 | null,
  right: LinkedPoseSelectionV2 | null,
): boolean {
  return selectionKey(left) === selectionKey(right);
}

export function modelOpenReferenceLinkedPoseSelectionLabelV2(
  selection: LinkedPoseSelectionV2,
): string {
  if (selection.lane === 'relax' && selection.degrees === 0) return 'A-rest';
  return `${selection.lane} ${selection.degrees}°`;
}

export function modelOpenReferenceLinkedPoseValueTextV2(selection: LinkedPoseSelectionV2): string {
  if (selection.lane === 'relax') {
    if (selection.degrees === 0) return 'A-rest, shoulder 0 degrees, forearm 0 degrees';
    return `shoulder ${selection.degrees} degrees, forearm ${selection.degrees * 2} degrees`;
  }
  return `upper arm ${selection.degrees} degrees`;
}

function rangeSelection(lane: LinkedPoseSelectionV2['lane'], value: number): LinkedPoseSelectionV2 {
  if (lane === 'relax' && RELAX_VALUES.some((candidate) => candidate === value)) {
    return Object.freeze({ lane, degrees: value as (typeof RELAX_VALUES)[number] });
  }
  if (lane === 'raise' && RAISE_VALUES.some((candidate) => candidate === value)) {
    return Object.freeze({ lane, degrees: value as (typeof RAISE_VALUES)[number] });
  }
  throw new RangeError('Linked pose range emitted an off-grid value.');
}

export function createModelOpenReferenceLinkedPoseApplyCoordinatorV2(
  options: ModelOpenReferenceLinkedPoseApplyCoordinatorOptionsV2,
): ModelOpenReferenceLinkedPoseApplyCoordinatorV2 {
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle));
  let timer: TimerHandle | null = null;
  let pointerActive = false;
  let pointerChanged = false;
  let latestPointerSelection: LinkedPoseSelectionV2 | null = null;

  const cancelTimer = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const applyIfNeeded = (selection: LinkedPoseSelectionV2) => {
    if (
      options.hasBuiltPreview() &&
      !modelOpenReferenceLinkedPoseSelectionEqualV2(selection, options.appliedSelection())
    ) {
      options.onApply(selection);
    }
  };
  const updateDraft = (selection: LinkedPoseSelectionV2) => {
    options.onDraftChange(Object.freeze({ ...selection }) as LinkedPoseSelectionV2);
  };

  return Object.freeze({
    beginPointer: () => {
      cancelTimer();
      pointerActive = true;
      pointerChanged = false;
      latestPointerSelection = null;
    },
    changeRange: (selection: LinkedPoseSelectionV2) => {
      updateDraft(selection);
      if (pointerActive) {
        pointerChanged = true;
        latestPointerSelection = selection;
        return;
      }
      cancelTimer();
      timer = schedule(() => {
        timer = null;
        applyIfNeeded(selection);
      }, MODEL_OPEN_REFERENCE_LINKED_POSE_KEYBOARD_IDLE_MS_V2);
    },
    finishPointer: () => {
      if (!pointerActive) return;
      pointerActive = false;
      cancelTimer();
      if (pointerChanged && latestPointerSelection !== null) {
        applyIfNeeded(latestPointerSelection);
      }
      pointerChanged = false;
      latestPointerSelection = null;
    },
    chooseImmediate: (selection: LinkedPoseSelectionV2) => {
      cancelTimer();
      pointerActive = false;
      pointerChanged = false;
      latestPointerSelection = null;
      updateDraft(selection);
      applyIfNeeded(selection);
    },
    dispose: () => {
      cancelTimer();
      pointerActive = false;
      pointerChanged = false;
      latestPointerSelection = null;
    },
  });
}

const RANGE_CLASS =
  'h-5 min-h-0 cursor-pointer border-0 bg-transparent p-0 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor ' +
  '[&::-webkit-slider-runnable-track]:h-px [&::-webkit-slider-runnable-track]:bg-textColor ' +
  '[&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:size-[11px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-textColor [&::-webkit-slider-thumb]:bg-textColor ' +
  '[&::-moz-range-track]:h-px [&::-moz-range-track]:bg-textColor ' +
  '[&::-moz-range-thumb]:size-[11px] [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-textColor [&::-moz-range-thumb]:bg-textColor';

export function ModelOpenReferenceLinkedPoseControlV2({
  draftSelection,
  appliedSelection,
  hasBuiltPreview,
  status,
  onDraftChange,
  onApply,
}: ModelOpenReferenceLinkedPoseControlV2Props) {
  const inputId = useId();
  const latestPropsRef = useRef({
    appliedSelection,
    hasBuiltPreview,
    onDraftChange,
    onApply,
  });
  latestPropsRef.current = { appliedSelection, hasBuiltPreview, onDraftChange, onApply };
  const coordinatorRef = useRef<ModelOpenReferenceLinkedPoseApplyCoordinatorV2 | null>(null);
  coordinatorRef.current ??= createModelOpenReferenceLinkedPoseApplyCoordinatorV2({
    hasBuiltPreview: () => latestPropsRef.current.hasBuiltPreview,
    appliedSelection: () => latestPropsRef.current.appliedSelection,
    onDraftChange: (selection) => latestPropsRef.current.onDraftChange(selection),
    onApply: (selection) => latestPropsRef.current.onApply(selection),
  });
  const coordinator = coordinatorRef.current;

  useEffect(() => () => coordinator.dispose(), [coordinator]);

  const draftLabel = modelOpenReferenceLinkedPoseSelectionLabelV2(draftSelection);
  const appliedLabel =
    appliedSelection === null
      ? 'not built'
      : modelOpenReferenceLinkedPoseSelectionLabelV2(appliedSelection);
  const differsFromApplied = !modelOpenReferenceLinkedPoseSelectionEqualV2(
    draftSelection,
    appliedSelection,
  );
  const pending =
    status !== 'error' &&
    hasBuiltPreview &&
    (differsFromApplied || status === 'pending' || status === 'building');
  const range =
    draftSelection.lane === 'relax'
      ? ({ min: 0, max: 4, step: 1 } as const)
      : ({ min: 5, max: 25, step: 5 } as const);

  const changeRange = (event: ChangeEvent<HTMLInputElement>) => {
    coordinator.changeRange(rangeSelection(draftSelection.lane, Number(event.currentTarget.value)));
  };
  const finishPointer = (event: ReactPointerEvent<HTMLInputElement>) => {
    coordinator.finishPointer();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <fieldset
      className='flex flex-col gap-1'
      data-testid='model-open-reference-linked-pose-control-v2'
    >
      <legend className='sr-only'>Linked symmetric display pose</legend>

      <div className='flex flex-wrap items-center justify-between gap-stack'>
        <Text component='p' size='micro' variant='label'>
          display pose
        </Text>
        <ChipRow>
          {PRESETS.map(([label, selection]) => (
            <Chip
              key={label}
              selected={modelOpenReferenceLinkedPoseSelectionEqualV2(draftSelection, selection)}
              pressed={modelOpenReferenceLinkedPoseSelectionEqualV2(draftSelection, selection)}
              onClick={() => coordinator.chooseImmediate(selection)}
              aria-label={`Select ${label} linked display pose`}
            >
              {label}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <div className='flex flex-wrap items-center justify-between gap-stack'>
        <Text component='p' size='micro' variant='label'>
          arm control
        </Text>
        <ChipRow>
          <Chip
            selected={draftSelection.lane === 'relax'}
            pressed={draftSelection.lane === 'relax'}
            onClick={() =>
              coordinator.chooseImmediate(
                draftSelection.lane === 'relax' ? draftSelection : RELAXED,
              )
            }
            aria-label='Edit linked shoulder and forearm relaxation'
          >
            relax arms
          </Chip>
          <Chip
            selected={draftSelection.lane === 'raise'}
            pressed={draftSelection.lane === 'raise'}
            onClick={() =>
              coordinator.chooseImmediate(draftSelection.lane === 'raise' ? draftSelection : NEAR_T)
            }
            aria-label='Edit linked upper-arm raise'
          >
            raise arms
          </Chip>
        </ChipRow>
      </div>

      <div className='border-y border-hairline py-1'>
        <div className='mb-1 flex flex-wrap items-center justify-between gap-stack'>
          <label htmlFor={inputId} className='text-micro uppercase tracking-label text-labelColor'>
            {draftSelection.lane === 'relax' ? 'relaxation' : 'arm raise'}
          </label>
          <Text component='span' size='micro' className='tabular-nums'>
            {modelOpenReferenceLinkedPoseValueTextV2(draftSelection)}
          </Text>
        </div>
        <Input
          id={inputId}
          type='range'
          min={range.min}
          max={range.max}
          step={range.step}
          value={draftSelection.degrees}
          aria-label={
            draftSelection.lane === 'relax'
              ? 'Linked shoulder and forearm relaxation'
              : 'Linked upper-arm raise'
          }
          aria-valuetext={modelOpenReferenceLinkedPoseValueTextV2(draftSelection)}
          onPointerDown={(event: ReactPointerEvent<HTMLInputElement>) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            coordinator.beginPointer();
          }}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
          onLostPointerCapture={() => coordinator.finishPointer()}
          onChange={changeRange}
          className={RANGE_CLASS}
        />
      </div>

      <div className='flex flex-wrap items-center justify-between gap-stack'>
        <div className='flex flex-wrap items-center gap-1'>
          <Pill tone='ink'>draft {draftLabel}</Pill>
          <Pill tone={appliedSelection === null ? 'mut' : 'ok'}>preview {appliedLabel}</Pill>
          {status === 'error' ? (
            <Pill tone='warn'>pose update failed</Pill>
          ) : (
            pending && <Pill tone='attention'>pose pending</Pill>
          )}
        </div>
        <Button
          type='button'
          variant='underline'
          size='xs'
          onClick={() => coordinator.chooseImmediate(A_REST)}
        >
          reset pose
        </Button>
      </div>

      <Text
        component='p'
        size='micro'
        variant={status === 'error' ? 'errorLabel' : 'label'}
        role='status'
        aria-live='polite'
        aria-atomic='true'
        data-testid='model-open-reference-linked-pose-status-v2'
      >
        {status === 'building' && hasBuiltPreview
          ? `Updating pose; showing preview ${appliedLabel} until ready.`
          : status === 'error' && hasBuiltPreview
            ? differsFromApplied
              ? `Pose update failed; preview ${appliedLabel} remains visible. Draft ${draftLabel} is unapplied.`
              : `Pose update failed; preview ${appliedLabel} remains visible.`
            : status === 'error'
              ? `Pose update failed; draft ${draftLabel} is unapplied. No pose is applied.`
              : appliedSelection === null
                ? `Draft ${draftLabel}. Build preview to apply it.`
                : pending
                  ? `Draft ${draftLabel}; preview ${appliedLabel}.`
                  : `Preview ${appliedLabel}.`}
      </Text>
      <Text component='p' size='micro' variant='label'>
        Pose is preview-only and is not saved with the model.
      </Text>
    </fieldset>
  );
}
