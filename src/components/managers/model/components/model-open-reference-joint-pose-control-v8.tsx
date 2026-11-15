import {
  MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4,
  type MakeHumanFullBodyJointOverlayGroupIdV4,
} from 'lib/cloth/body/makehuman-full-body-joint-overlay-runtime-v4';
import { useEffect, useRef, useState } from 'react';
import { Button, Chip, Text } from 'ui';

import {
  MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
  modelOpenReferenceFullBodyPoseGeometryEqualV4,
  modelOpenReferenceFullBodyPoseLinkArmsFromV4,
  modelOpenReferenceFullBodyPoseUnlinkArmsV4,
  snapshotModelOpenReferenceFullBodyPoseV4,
  type ModelOpenReferenceFullBodyPoseV4,
} from './model-open-reference-full-body-pose-control-v4';
import {
  modelOpenReferenceJointChannelLimitV5,
  modelOpenReferenceJointChannelValueV5,
  modelOpenReferenceJointPoseUpdateSelectedV5,
  modelOpenReferenceJointSelectionV5,
  type ModelOpenReferenceJointPoseControlPropsV5,
} from './model-open-reference-joint-pose-control-v5';

export const MODEL_OPEN_REFERENCE_JOINT_POSE_CONTROL_V8 =
  'model-open-reference-joint-pose-control/v8' as const;

const LOCAL_CONTROL_FORM_OWNER = 'model-open-reference-local-control-owner' as const;

function selectedSide(groupId: MakeHumanFullBodyJointOverlayGroupIdV4): 'left' | 'right' {
  return groupId.startsWith('right-') ? 'right' : 'left';
}

function visibleInstruction(props: ModelOpenReferenceJointPoseControlPropsV5): string {
  if (props.overlayError || props.overlay?.status === 'unavailable') {
    return 'Joint editing is unavailable.';
  }
  if (props.overlay?.status === 'ready') {
    return 'Drag a joint to pose. Drag empty space to orbit. Wheel to zoom.';
  }
  return 'Preparing mannequin controls.';
}

export function ModelOpenReferenceJointPoseControlV8(
  props: ModelOpenReferenceJointPoseControlPropsV5,
) {
  const {
    draftPose,
    appliedPose,
    status,
    overlay,
    selection,
    onSelectionChange,
    onDraftChange,
    onApply,
  } = props;
  const selectedGroup = MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4.find(
    ({ id }) => id === selection.groupId,
  );
  if (!selectedGroup) throw new Error(`Unknown joint editor group ${selection.groupId}.`);

  const limit = modelOpenReferenceJointChannelLimitV5(selection);
  const value = modelOpenReferenceJointChannelValueV5(draftPose, selection);
  const building = status === 'building';
  const pending = !modelOpenReferenceFullBodyPoseGeometryEqualV4(draftPose, appliedPose);
  const neutral = modelOpenReferenceFullBodyPoseGeometryEqualV4(
    draftPose,
    MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
  );
  const linkSource = selectedSide(selection.groupId);
  const [undoStack, setUndoStack] = useState<readonly ModelOpenReferenceFullBodyPoseV4[]>([]);
  const lastAppliedRef = useRef<ModelOpenReferenceFullBodyPoseV4 | null>(appliedPose);
  const suppressNextHistoryRef = useRef(false);

  useEffect(() => {
    if (appliedPose === null) {
      lastAppliedRef.current = null;
      suppressNextHistoryRef.current = false;
      setUndoStack([]);
      return;
    }
    const previous = lastAppliedRef.current;
    if (previous === null) {
      lastAppliedRef.current = snapshotModelOpenReferenceFullBodyPoseV4(appliedPose);
      return;
    }
    if (modelOpenReferenceFullBodyPoseGeometryEqualV4(previous, appliedPose)) return;
    lastAppliedRef.current = snapshotModelOpenReferenceFullBodyPoseV4(appliedPose);
    if (suppressNextHistoryRef.current) {
      suppressNextHistoryRef.current = false;
      return;
    }
    setUndoStack((current) => [
      ...current.slice(-49),
      snapshotModelOpenReferenceFullBodyPoseV4(previous),
    ]);
  }, [appliedPose]);

  const undo = () => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack((current) => current.slice(0, -1));
    suppressNextHistoryRef.current = true;
    onDraftChange(previous);
    onApply(previous);
  };

  const reset = () => {
    const next = MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4;
    onDraftChange(next);
    onApply(next);
  };

  return (
    <fieldset
      className='flex flex-col gap-2 border-y border-hairline py-2'
      data-testid='model-open-reference-joint-pose-control-v8'
    >
      <legend className='sr-only'>Direct mannequin pose editor</legend>

      <div
        className='flex flex-wrap items-center justify-between gap-2'
        role='toolbar'
        aria-label='Mannequin pose tools'
      >
        <div className='ml-auto flex flex-wrap items-center gap-1'>
          <Chip
            selected={draftPose.armMode === 'linked'}
            pressed={draftPose.armMode === 'linked'}
            className='min-h-11 px-2'
            disabled={building}
            onClick={() =>
              onDraftChange(
                draftPose.armMode === 'linked'
                  ? modelOpenReferenceFullBodyPoseUnlinkArmsV4(draftPose)
                  : modelOpenReferenceFullBodyPoseLinkArmsFromV4(draftPose, linkSource),
              )
            }
          >
            symmetry
          </Chip>
          <Button
            type='button'
            variant='underline'
            size='xs'
            className='min-h-11 px-2'
            disabled={undoStack.length === 0 || building}
            onClick={undo}
          >
            undo
          </Button>
          <Button
            type='button'
            variant='underline'
            size='xs'
            className='min-h-11 px-2'
            disabled={neutral || building}
            onClick={reset}
          >
            reset
          </Button>
        </div>
      </div>

      <Text
        component='p'
        size='micro'
        variant={props.overlayError || overlay?.status === 'unavailable' ? 'errorLabel' : 'label'}
      >
        {visibleInstruction(props)}
      </Text>

      <Text
        component='p'
        size='micro'
        className='sr-only'
        role='status'
        aria-live='polite'
        aria-atomic='true'
        data-testid='model-open-reference-joint-overlay-status-v8'
      >
        {building
          ? 'Updating the mannequin pose.'
          : pending
            ? 'The visible pose is changing.'
            : visibleInstruction(props)}
      </Text>

      <div className='sr-only' data-testid='model-open-reference-joint-pose-accessible-fallback-v8'>
        <label>
          Pose joint
          <select
            name='model-open-reference-joint-v8-fallback'
            form={LOCAL_CONTROL_FORM_OWNER}
            value={selection.groupId}
            onChange={(event) =>
              onSelectionChange(
                modelOpenReferenceJointSelectionV5(
                  event.currentTarget.value as MakeHumanFullBodyJointOverlayGroupIdV4,
                ),
              )
            }
          >
            {MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4.map((group) => (
              <option key={group.id} value={group.id}>
                {group.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Joint axis
          <select
            name='model-open-reference-axis-v8-fallback'
            form={LOCAL_CONTROL_FORM_OWNER}
            value={selection.channel}
            onChange={(event) =>
              onSelectionChange(
                modelOpenReferenceJointSelectionV5(
                  selectedGroup.id,
                  event.currentTarget
                    .value as (typeof selectedGroup.channelDescriptors)[number]['channel'],
                ),
              )
            }
          >
            {selectedGroup.channelDescriptors.map((descriptor) => (
              <option key={descriptor.channel} value={descriptor.channel}>
                {descriptor.channel}, local {descriptor.axis.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          Joint angle
          <input
            type='number'
            form={LOCAL_CONTROL_FORM_OWNER}
            min={limit.min}
            max={limit.max}
            step={limit.step}
            value={value}
            onChange={(event) => {
              const next = modelOpenReferenceJointPoseUpdateSelectedV5(
                draftPose,
                selection,
                Number(event.currentTarget.value),
              );
              if (next) onDraftChange(next);
            }}
          />
        </label>
        {appliedPose === null ? (
          <button type='button' onClick={() => onApply(draftPose)}>
            Build mannequin
          </button>
        ) : null}
      </div>
    </fieldset>
  );
}
