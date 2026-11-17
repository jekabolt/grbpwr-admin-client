import { useEffect, useRef, useState } from 'react';
import { Button, CheckboxCommon, Chip, Text } from 'ui';

import type { ModelOpenReferenceFullBodyPoseControlStatusV4 } from './model-open-reference-full-body-pose-control-v4';
import type { ModelOpenReferenceDirectPosePersistenceV1 } from './model-open-reference-preview';
import {
  MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  modelOpenReferenceDirectPoseGeometryEqualV9,
  modelOpenReferenceDirectToggleSymmetryV9,
  snapshotModelOpenReferenceDirectPoseV9,
  type ModelOpenReferenceDirectPoseV9,
} from './model-open-reference-direct-pose-v9';

export const MODEL_OPEN_REFERENCE_DIRECT_POSE_CONTROL_V9 =
  'model-open-reference-direct-pose-control/v9' as const;

export interface ModelOpenReferenceDirectPoseControlPropsV9 {
  readonly draftPose: ModelOpenReferenceDirectPoseV9;
  readonly appliedPose: ModelOpenReferenceDirectPoseV9 | null;
  readonly status: ModelOpenReferenceFullBodyPoseControlStatusV4;
  readonly overlayStatus: 'pending' | 'ready' | 'unavailable';
  readonly overlayError: string | null;
  readonly onDraftChange: (pose: ModelOpenReferenceDirectPoseV9) => void;
  readonly onApply: (pose: ModelOpenReferenceDirectPoseV9) => void;
  readonly sessionPose?: Readonly<{
    readonly dirty: boolean;
    readonly canUndo: boolean;
    readonly onUndo: () => ModelOpenReferenceDirectPoseV9;
    readonly onReset: () => ModelOpenReferenceDirectPoseV9;
    readonly persistence?: ModelOpenReferenceDirectPosePersistenceV1;
  }>;
  /**
   * Desktop model form: an `edit pose` checkbox leads the bar and the tools follow it only while it
   * is on. Pose status and messages are in the block header, so none of them print here.
   */
  readonly editPoseToggle?: Readonly<{ on: boolean; onChange: (on: boolean) => void }>;
}

function sameTemporaryPose(
  left: ModelOpenReferenceDirectPoseV9,
  right: ModelOpenReferenceDirectPoseV9,
) {
  return (
    left.armMode === right.armMode &&
    left.legMode === right.legMode &&
    modelOpenReferenceDirectPoseGeometryEqualV9(left, right)
  );
}

export function modelOpenReferenceTemporaryAppliedHistoryCommitV9(options: {
  readonly history: readonly ModelOpenReferenceDirectPoseV9[];
  readonly previousApplied: ModelOpenReferenceDirectPoseV9 | null;
  readonly nextApplied: ModelOpenReferenceDirectPoseV9 | null;
  readonly suppress: boolean;
}): Readonly<{
  history: readonly ModelOpenReferenceDirectPoseV9[];
  previousApplied: ModelOpenReferenceDirectPoseV9 | null;
  suppress: boolean;
}> {
  const nextApplied = options.nextApplied
    ? snapshotModelOpenReferenceDirectPoseV9(options.nextApplied)
    : null;
  if (
    nextApplied === null ||
    options.previousApplied === null ||
    sameTemporaryPose(options.previousApplied, nextApplied)
  ) {
    return Object.freeze({ ...options, previousApplied: nextApplied });
  }
  if (options.suppress) {
    return Object.freeze({
      history: options.history,
      previousApplied: nextApplied,
      suppress: false,
    });
  }
  return Object.freeze({
    history: Object.freeze([
      ...options.history.slice(-49),
      snapshotModelOpenReferenceDirectPoseV9(options.previousApplied),
    ]),
    previousApplied: nextApplied,
    suppress: false,
  });
}

function instruction(props: ModelOpenReferenceDirectPoseControlPropsV9) {
  if (props.overlayError || props.overlayStatus === 'unavailable') {
    return 'Joint editing is unavailable.';
  }
  if (props.overlayStatus === 'ready') {
    return 'Drag a joint to pose. Drag empty space to orbit. Wheel to zoom.';
  }
  return 'Preparing mannequin controls.';
}

export function ModelOpenReferenceDirectPoseControlV9(
  props: ModelOpenReferenceDirectPoseControlPropsV9,
) {
  const { draftPose, status, onDraftChange, onApply } = props;
  const temporaryHistoryRef = useRef<ModelOpenReferenceDirectPoseV9[]>([]);
  const lastTemporaryAppliedRef = useRef<ModelOpenReferenceDirectPoseV9 | null>(
    props.appliedPose ? snapshotModelOpenReferenceDirectPoseV9(props.appliedPose) : null,
  );
  const suppressNextTemporaryHistoryRef = useRef(false);
  const [temporaryUndoDepth, setTemporaryUndoDepth] = useState(0);
  const sessionOwned = props.sessionPose !== undefined;
  const building = status === 'building';
  const neutral = modelOpenReferenceDirectPoseGeometryEqualV9(
    draftPose,
    MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  );
  const symmetry = draftPose.armMode === 'linked' && draftPose.legMode === 'linked';
  const persistence = props.sessionPose?.persistence;

  useEffect(() => {
    if (sessionOwned) {
      temporaryHistoryRef.current = [];
      lastTemporaryAppliedRef.current = props.appliedPose
        ? snapshotModelOpenReferenceDirectPoseV9(props.appliedPose)
        : null;
      suppressNextTemporaryHistoryRef.current = false;
      setTemporaryUndoDepth(0);
      return;
    }
    const transition = modelOpenReferenceTemporaryAppliedHistoryCommitV9({
      history: temporaryHistoryRef.current,
      previousApplied: lastTemporaryAppliedRef.current,
      nextApplied: props.appliedPose,
      suppress: suppressNextTemporaryHistoryRef.current,
    });
    temporaryHistoryRef.current = [...transition.history];
    lastTemporaryAppliedRef.current = transition.previousApplied;
    suppressNextTemporaryHistoryRef.current = transition.suppress;
    setTemporaryUndoDepth(temporaryHistoryRef.current.length);
  }, [props.appliedPose, sessionOwned]);

  const applyImmediately = (pose: ModelOpenReferenceDirectPoseV9) => {
    onDraftChange(pose);
    onApply(pose);
  };

  const undo = () => {
    if (props.sessionPose) {
      onApply(props.sessionPose.onUndo());
      return;
    }
    const previous = temporaryHistoryRef.current.pop();
    if (!previous) return;
    suppressNextTemporaryHistoryRef.current = true;
    setTemporaryUndoDepth(temporaryHistoryRef.current.length);
    onDraftChange(previous);
    onApply(previous);
  };

  const reset = () => {
    const resetPose = props.sessionPose?.onReset();
    if (resetPose) onApply(resetPose);
    else applyImmediately(MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9);
  };

  const toggle = props.editPoseToggle;
  const tools = (
    <>
      <Chip
        selected={symmetry}
        pressed={symmetry}
        className={toggle ? 'min-h-8 px-2' : 'min-h-11 px-2'}
        disabled={building}
        onClick={() => applyImmediately(modelOpenReferenceDirectToggleSymmetryV9(draftPose))}
      >
        symmetry
      </Chip>
      <Button
        type='button'
        variant='underline'
        size='xs'
        className={toggle ? 'min-h-8 px-2' : 'min-h-11 px-2'}
        disabled={
          (props.sessionPose ? !props.sessionPose.canUndo : temporaryUndoDepth === 0) || building
        }
        onClick={undo}
      >
        undo
      </Button>
      <Button
        type='button'
        variant='underline'
        size='xs'
        className={toggle ? 'min-h-8 px-2' : 'min-h-11 px-2'}
        disabled={neutral || building}
        onClick={reset}
      >
        reset
      </Button>
      {persistence?.conflict ? (
        <>
          <Button
            type='button'
            variant='underline'
            size='xs'
            className={toggle ? 'min-h-8 px-2' : 'min-h-11 px-2'}
            disabled={building}
            onClick={() => onApply(persistence.onReloadTheirs())}
          >
            reload theirs
          </Button>
          {persistence.showSave ? (
            <Button
              type='button'
              variant='underline'
              size='xs'
              className={toggle ? 'min-h-8 px-2' : 'min-h-11 px-2'}
              disabled={building}
              onClick={() => onApply(persistence.onKeepMine())}
            >
              keep mine
            </Button>
          ) : null}
        </>
      ) : persistence?.showSave ? (
        <Button
          type='button'
          variant='underline'
          size='xs'
          className={toggle ? 'min-h-8 px-2' : 'min-h-11 px-2'}
          disabled={!persistence.canSave || building}
          loading={persistence.saving}
          onClick={persistence.onSave}
        >
          save pose
        </Button>
      ) : null}
    </>
  );

  if (toggle) {
    return (
      <fieldset
        className='flex min-h-8 flex-wrap items-center gap-2'
        data-testid='model-open-reference-direct-pose-control-v9'
        data-edit-pose={toggle.on ? 'on' : 'off'}
      >
        <legend className='sr-only'>Direct mannequin pose editor</legend>
        <label className='flex cursor-pointer select-none items-center gap-2'>
          <CheckboxCommon
            name='mannequin-edit-toggle'
            checked={toggle.on}
            onChange={(checked: boolean) => toggle.onChange(checked === true)}
          />
          <Text component='span'>edit pose</Text>
        </label>
        {toggle.on ? (
          <div
            className='ml-2 flex flex-wrap items-center gap-1'
            role='toolbar'
            aria-label='Mannequin pose tools'
          >
            {tools}
          </div>
        ) : null}
        {persistence?.errorText ? (
          <Text component='p' size='micro' className='sr-only' role='alert'>
            {persistence.errorText}
          </Text>
        ) : null}
        <Text
          component='p'
          size='micro'
          className='sr-only'
          role='status'
          aria-live='polite'
          aria-atomic='true'
        >
          {building ? 'Updating the mannequin pose.' : toggle.on ? instruction(props) : ''}
        </Text>
      </fieldset>
    );
  }

  return (
    <fieldset
      className='flex flex-col gap-2 border-y border-hairline py-2'
      data-testid='model-open-reference-direct-pose-control-v9'
    >
      <legend className='sr-only'>Direct mannequin pose editor</legend>
      <div
        className='flex flex-wrap items-center justify-between gap-2'
        role='toolbar'
        aria-label='Mannequin pose tools'
      >
        <div className='flex w-full flex-wrap items-center gap-1'>
          <Text
            component='span'
            size='micro'
            variant='label'
            className='mr-auto'
            data-testid='model-mannequin-pose-session-status'
          >
            {persistence?.statusText ??
              `${props.sessionPose ? 'session pose' : 'temporary pose'} · not saved${
                props.sessionPose?.dirty ? ' · changed' : ''
              }`}
          </Text>
          {tools}
        </div>
      </div>
      {persistence?.errorText ? (
        <Text component='p' size='micro' variant='errorLabel' role='alert'>
          {persistence.errorText}
        </Text>
      ) : null}
      <Text
        component='p'
        size='micro'
        variant={
          props.overlayError || props.overlayStatus === 'unavailable' ? 'errorLabel' : 'label'
        }
      >
        {instruction(props)}
      </Text>
      <Text
        component='p'
        size='micro'
        className='sr-only'
        role='status'
        aria-live='polite'
        aria-atomic='true'
      >
        {building ? 'Updating the mannequin pose.' : instruction(props)}
      </Text>
    </fieldset>
  );
}
