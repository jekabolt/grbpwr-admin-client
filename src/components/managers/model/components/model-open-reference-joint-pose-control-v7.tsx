import { type ChangeEvent, type KeyboardEvent } from 'react';

import {
  MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4,
  type MakeHumanFullBodyJointOverlayChannelV4,
  type MakeHumanFullBodyJointOverlayGroupIdV4,
} from 'lib/cloth/body/makehuman-full-body-joint-overlay-runtime-v4';
import { Button, Chip, Input, Pill, Select, Text } from 'ui';

import {
  MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
  modelOpenReferenceFullBodyPoseGeometryEqualV4,
  modelOpenReferenceFullBodyPoseLinkArmsFromV4,
  modelOpenReferenceFullBodyPoseUnlinkArmsV4,
} from './model-open-reference-full-body-pose-control-v4';
import {
  modelOpenReferenceJointChannelLimitV5,
  modelOpenReferenceJointChannelValueV5,
  modelOpenReferenceJointPoseStepV5,
  modelOpenReferenceJointPoseUpdateSelectedV5,
  modelOpenReferenceJointSelectionV5,
  type ModelOpenReferenceJointPoseControlPropsV5,
} from './model-open-reference-joint-pose-control-v5';

export const MODEL_OPEN_REFERENCE_JOINT_POSE_CONTROL_V7 =
  'model-open-reference-joint-pose-control/v7' as const;

const LOCAL_CONTROL_FORM_OWNER = 'model-open-reference-local-control-owner' as const;

const GROUP_LABELS: Readonly<Record<MakeHumanFullBodyJointOverlayGroupIdV4, string>> =
  Object.freeze({
    'torso-group': 'Torso',
    'left-shoulder-group': 'Left shoulder',
    'right-shoulder-group': 'Right shoulder',
    'left-elbow': 'Left elbow',
    'right-elbow': 'Right elbow',
    'left-wrist': 'Left wrist',
    'right-wrist': 'Right wrist',
  });

const CHANNEL_LABELS: Readonly<Record<MakeHumanFullBodyJointOverlayChannelV4, string>> =
  Object.freeze({
    torsoFlexionDeg: 'forward / back',
    torsoSideBendDeg: 'side bend',
    torsoTwistDeg: 'twist',
    shoulderRaiseDeg: 'raise',
    shoulderForwardDeg: 'forward / back',
    elbowBendDeg: 'bend',
    wristBendDeg: 'bend',
  });

function selectedGroup(groupId: MakeHumanFullBodyJointOverlayGroupIdV4) {
  const group = MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4.find(({ id }) => id === groupId);
  if (!group) throw new Error(`Unknown joint editor group ${groupId}.`);
  return group;
}

function sourceSide(groupId: MakeHumanFullBodyJointOverlayGroupIdV4): 'left' | 'right' {
  return groupId.startsWith('right-') ? 'right' : 'left';
}

function overlayStatusText(props: ModelOpenReferenceJointPoseControlPropsV5): string {
  if (props.overlayError || props.overlay?.status === 'unavailable') {
    return 'Viewport joint controls unavailable. Use the joint and angle controls below.';
  }
  if (props.appliedPose !== null && props.overlay === null) {
    return 'Loading viewport joint controls.';
  }
  if (props.overlay?.status === 'ready') {
    return 'Select a joint on the mannequin, then drag its local rotation ring.';
  }
  return 'Build the preview to enable direct joint selection on the mannequin.';
}

export function ModelOpenReferenceJointPoseControlV7(
  props: ModelOpenReferenceJointPoseControlPropsV5,
) {
  const {
    draftPose,
    appliedPose,
    status,
    overlay,
    mode,
    selection,
    onModeChange,
    onSelectionChange,
    onDraftChange,
    onApply,
  } = props;
  const group = selectedGroup(selection.groupId);
  const descriptor = group.channelDescriptors.find(({ channel }) => channel === selection.channel);
  if (!descriptor) throw new Error('Selected joint channel is outside the group allowlist.');

  const value = modelOpenReferenceJointChannelValueV5(draftPose, selection);
  const limit = modelOpenReferenceJointChannelLimitV5(selection);
  const canPoseInViewport = overlay?.status === 'ready';
  const building = status === 'building';
  const pending = !modelOpenReferenceFullBodyPoseGeometryEqualV4(draftPose, appliedPose);
  const neutral = modelOpenReferenceFullBodyPoseGeometryEqualV4(
    draftPose,
    MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
  );
  const linkSource = sourceSide(selection.groupId);

  const setValue = (nextValue: number) => {
    const next = modelOpenReferenceJointPoseUpdateSelectedV5(draftPose, selection, nextValue);
    if (next) onDraftChange(next);
  };

  const stepValue = (deltaDegrees: number) => {
    onDraftChange(modelOpenReferenceJointPoseStepV5({ pose: draftPose, selection, deltaDegrees }));
  };

  const handleValueKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape' || appliedPose === null) return;
    event.preventDefault();
    setValue(modelOpenReferenceJointChannelValueV5(appliedPose, selection));
  };

  return (
    <fieldset
      className='flex flex-col gap-stack border-y border-hairline py-2'
      data-testid='model-open-reference-joint-pose-control-v7'
    >
      <legend className='sr-only'>Viewport-first local joint pose editor</legend>

      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-1'>
          <Text component='p' size='micro' className='mr-1 font-bold uppercase'>
            pose tool
          </Text>
          <Chip
            selected={mode === 'camera'}
            pressed={mode === 'camera'}
            className='min-h-11 px-2'
            onClick={() => onModeChange('camera')}
          >
            camera
          </Chip>
          <Chip
            selected={mode === 'edit-pose'}
            pressed={mode === 'edit-pose'}
            className='min-h-11 px-2'
            disabled={!canPoseInViewport}
            onClick={() => onModeChange('edit-pose')}
          >
            pose
          </Chip>
        </div>

        <div className='flex flex-wrap items-center gap-1'>
          <Pill tone={draftPose.armMode === 'linked' ? 'ok' : 'attention'}>
            arms {draftPose.armMode}
          </Pill>
          <Button
            type='button'
            variant='underline'
            size='xs'
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
            {draftPose.armMode === 'linked' ? 'unlink arms' : `link from ${linkSource}`}
          </Button>
          <Button
            type='button'
            variant='underline'
            size='xs'
            className='min-h-11 px-2'
            disabled={(neutral && draftPose.armMode === 'linked') || building}
            onClick={() => onDraftChange(MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4)}
          >
            reset pose
          </Button>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className='min-h-11'
            loading={building}
            disabled={building || !pending}
            onClick={() => onApply(draftPose)}
          >
            apply pose
          </Button>
        </div>
      </div>

      <Text
        component='p'
        size='micro'
        variant={props.overlayError || overlay?.status === 'unavailable' ? 'errorLabel' : 'label'}
        role='status'
        aria-live='polite'
        aria-atomic='true'
        data-testid='model-open-reference-joint-overlay-status-v7'
      >
        {overlayStatusText(props)}
      </Text>

      <div className='grid gap-2 border-t border-hairline pt-2 lg:grid-cols-[minmax(12rem,0.72fr)_minmax(18rem,1.28fr)]'>
        <div>
          <Text component='p' size='nano' variant='label' className='mb-1 uppercase'>
            selected joint
          </Text>
          <Select
            name='model-open-reference-joint-v7-fallback'
            form={LOCAL_CONTROL_FORM_OWNER}
            value={selection.groupId}
            placeholder='Selected pose joint'
            items={MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4.map(({ id }) => ({
              value: id,
              label: GROUP_LABELS[id],
            }))}
            className='min-h-11'
            itemClassName='min-h-11'
            fullWidth
            renderValue={() => GROUP_LABELS[selection.groupId]}
            onValueChange={(groupId) =>
              onSelectionChange(
                modelOpenReferenceJointSelectionV5(
                  groupId as MakeHumanFullBodyJointOverlayGroupIdV4,
                ),
              )
            }
          />
          <Text component='p' size='nano' variant='label' className='mt-1'>
            Keyboard and touch fallback. In Pose mode, select the joint directly on the mannequin.
          </Text>
        </div>

        <div>
          <Text component='p' size='nano' variant='label' className='mb-1 uppercase'>
            {GROUP_LABELS[group.id]} local axis
          </Text>
          <div className='flex flex-wrap gap-1' role='group' aria-label='Selected joint axis'>
            {group.channelDescriptors.map((channelDescriptor) => (
              <Chip
                key={channelDescriptor.channel}
                selected={selection.channel === channelDescriptor.channel}
                pressed={selection.channel === channelDescriptor.channel}
                className='min-h-11 px-2'
                onClick={() =>
                  onSelectionChange(
                    modelOpenReferenceJointSelectionV5(group.id, channelDescriptor.channel),
                  )
                }
              >
                {CHANNEL_LABELS[channelDescriptor.channel]} · {channelDescriptor.axis.toUpperCase()}
              </Chip>
            ))}
          </div>

          <div className='mt-2 flex flex-wrap items-end gap-1 border-t border-hairline pt-2'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='min-h-11 min-w-11 px-2'
              aria-label={`Decrease ${CHANNEL_LABELS[selection.channel]} by 1 degree`}
              disabled={building || value <= limit.min}
              onClick={() => stepValue(-1)}
            >
              −
            </Button>
            <label className='min-w-28 grow sm:max-w-40'>
              <Text component='span' size='nano' variant='label' className='mb-1 block uppercase'>
                angle · {descriptor.axis.toUpperCase()}
              </Text>
              <Input
                type='number'
                form={LOCAL_CONTROL_FORM_OWNER}
                min={limit.min}
                max={limit.max}
                step={limit.step}
                value={value}
                aria-label={`${GROUP_LABELS[group.id]} ${CHANNEL_LABELS[selection.channel]} angle`}
                className='min-h-11 text-center tabular-nums'
                disabled={building}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setValue(Number(event.currentTarget.value))
                }
                onKeyDown={handleValueKeyDown}
              />
            </label>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='min-h-11 min-w-11 px-2'
              aria-label={`Increase ${CHANNEL_LABELS[selection.channel]} by 1 degree`}
              disabled={building || value >= limit.max}
              onClick={() => stepValue(1)}
            >
              +
            </Button>
            <Button
              type='button'
              variant='underline'
              size='xs'
              className='min-h-11 px-2'
              disabled={building || value === 0}
              onClick={() => setValue(0)}
            >
              reset joint
            </Button>
          </div>
        </div>
      </div>

      <div className='flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2'>
        <div className='flex flex-wrap items-center gap-1'>
          <Pill tone='ink'>local FK</Pill>
          <Pill tone={appliedPose === null ? 'mut' : pending ? 'attention' : 'ok'}>
            {appliedPose === null
              ? 'preview not built'
              : pending
                ? 'pose pending'
                : 'preview applied'}
          </Pill>
        </div>
        <Text component='p' size='micro' variant='label'>
          Direct joint rotation only. This is not IK, garment fit, or a saved model pose.
        </Text>
      </div>
    </fieldset>
  );
}
