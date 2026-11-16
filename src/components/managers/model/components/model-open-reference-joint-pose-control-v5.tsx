import { type ChangeEvent, type KeyboardEvent } from 'react';

import {
  MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4,
  type MakeHumanFullBodyJointOverlayChannelV4,
  type MakeHumanFullBodyJointOverlayGroupIdV4,
  type MakeHumanFullBodyJointOverlayRuntimeResultV4,
} from 'lib/cloth/body/makehuman-full-body-joint-overlay-runtime-v4';
import { Button, CalloutBox, Input, Pill, Text } from 'ui';

import {
  MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4,
  ModelOpenReferenceFullBodyPoseControlV4,
  modelOpenReferenceFullBodyPoseUpdateArmV4,
  modelOpenReferenceFullBodyPoseUpdateBodyV4,
  type ModelOpenReferenceFullBodyPoseArmFieldV4,
  type ModelOpenReferenceFullBodyPoseBodyFieldV4,
  type ModelOpenReferenceFullBodyPoseControlStatusV4,
  type ModelOpenReferenceFullBodyPoseV4,
} from './model-open-reference-full-body-pose-control-v4';

export const MODEL_OPEN_REFERENCE_JOINT_POSE_CONTROL_V5 =
  'model-open-reference-joint-pose-control/v5' as const;

const MODEL_OPEN_REFERENCE_LOCAL_CONTROL_FORM_OWNER =
  'model-open-reference-local-control-owner' as const;

export type ModelOpenReferenceJointEditorModeV5 = 'camera' | 'edit-pose';

export interface ModelOpenReferenceJointSelectionV5 {
  readonly groupId: MakeHumanFullBodyJointOverlayGroupIdV4;
  readonly channel: MakeHumanFullBodyJointOverlayChannelV4;
}

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

const GROUP_ACCESSIBLE_LABELS: Readonly<Record<MakeHumanFullBodyJointOverlayGroupIdV4, string>> =
  Object.freeze({
    'torso-group': 'Torso group',
    'left-shoulder-group': 'Left shoulder and upper arm',
    'right-shoulder-group': 'Right shoulder and upper arm',
    'left-elbow': 'Left elbow',
    'right-elbow': 'Right elbow',
    'left-wrist': 'Left wrist',
    'right-wrist': 'Right wrist',
  });

function channelAccessibleLabel(
  groupId: MakeHumanFullBodyJointOverlayGroupIdV4,
  channel: MakeHumanFullBodyJointOverlayChannelV4,
  axis: string,
) {
  return `${GROUP_ACCESSIBLE_LABELS[groupId]} ${CHANNEL_LABELS[channel]}, local ${axis.toUpperCase()}`;
}

function groupDefinition(groupId: MakeHumanFullBodyJointOverlayGroupIdV4) {
  const group = MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4.find(({ id }) => id === groupId);
  if (!group) throw new Error(`Unknown joint editor group ${groupId}.`);
  return group;
}

export function modelOpenReferenceJointSelectionV5(
  groupId: MakeHumanFullBodyJointOverlayGroupIdV4,
  channel?: MakeHumanFullBodyJointOverlayChannelV4,
): ModelOpenReferenceJointSelectionV5 {
  const group = groupDefinition(groupId);
  const selected =
    channel && group.channelDescriptors.some((descriptor) => descriptor.channel === channel)
      ? channel
      : group.channelDescriptors[0].channel;
  return Object.freeze({ groupId, channel: selected });
}

export function modelOpenReferenceJointChannelValueV5(
  pose: ModelOpenReferenceFullBodyPoseV4,
  selection: ModelOpenReferenceJointSelectionV5,
): number {
  if (selection.channel === 'torsoFlexionDeg') return pose.bodyFlexionDegrees;
  if (selection.channel === 'torsoSideBendDeg') return pose.bodySideBendDegrees;
  if (selection.channel === 'torsoTwistDeg') return pose.bodyTwistDegrees;
  const arm = selection.groupId.startsWith('right-') ? pose.rightArm : pose.leftArm;
  if (selection.channel === 'shoulderRaiseDeg') return arm.shoulderRaiseDegrees;
  if (selection.channel === 'shoulderForwardDeg') return arm.shoulderForwardDegrees;
  if (selection.channel === 'elbowBendDeg') return arm.elbowBendDegrees;
  return arm.wristBendDegrees;
}

export function modelOpenReferenceJointPoseUpdateSelectedV5(
  pose: ModelOpenReferenceFullBodyPoseV4,
  selection: ModelOpenReferenceJointSelectionV5,
  value: number,
): ModelOpenReferenceFullBodyPoseV4 | null {
  if (selection.channel === 'torsoFlexionDeg') {
    return modelOpenReferenceFullBodyPoseUpdateBodyV4(pose, 'bodyFlexionDegrees', value);
  }
  if (selection.channel === 'torsoSideBendDeg') {
    return modelOpenReferenceFullBodyPoseUpdateBodyV4(pose, 'bodySideBendDegrees', value);
  }
  if (selection.channel === 'torsoTwistDeg') {
    return modelOpenReferenceFullBodyPoseUpdateBodyV4(pose, 'bodyTwistDegrees', value);
  }
  const side = selection.groupId.startsWith('right-') ? 'right' : 'left';
  const field: ModelOpenReferenceFullBodyPoseArmFieldV4 =
    selection.channel === 'shoulderRaiseDeg'
      ? 'shoulderRaiseDegrees'
      : selection.channel === 'shoulderForwardDeg'
        ? 'shoulderForwardDegrees'
        : selection.channel === 'elbowBendDeg'
          ? 'elbowBendDegrees'
          : 'wristBendDegrees';
  return modelOpenReferenceFullBodyPoseUpdateArmV4(pose, side, field, value);
}

export function modelOpenReferenceJointChannelLimitV5(
  selection: ModelOpenReferenceJointSelectionV5,
) {
  const field:
    | ModelOpenReferenceFullBodyPoseBodyFieldV4
    | ModelOpenReferenceFullBodyPoseArmFieldV4 =
    selection.channel === 'torsoFlexionDeg'
      ? 'bodyFlexionDegrees'
      : selection.channel === 'torsoSideBendDeg'
        ? 'bodySideBendDegrees'
        : selection.channel === 'torsoTwistDeg'
          ? 'bodyTwistDegrees'
          : selection.channel === 'shoulderRaiseDeg'
            ? 'shoulderRaiseDegrees'
            : selection.channel === 'shoulderForwardDeg'
              ? 'shoulderForwardDegrees'
              : selection.channel === 'elbowBendDeg'
                ? 'elbowBendDegrees'
                : 'wristBendDegrees';
  return MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4[field];
}

export function modelOpenReferenceJointPoseStepV5(options: {
  readonly pose: ModelOpenReferenceFullBodyPoseV4;
  readonly selection: ModelOpenReferenceJointSelectionV5;
  readonly deltaDegrees: number;
}): ModelOpenReferenceFullBodyPoseV4 {
  const current = modelOpenReferenceJointChannelValueV5(options.pose, options.selection);
  const limit = modelOpenReferenceJointChannelLimitV5(options.selection);
  const nextValue = Math.min(limit.max, Math.max(limit.min, current + options.deltaDegrees));
  return (
    modelOpenReferenceJointPoseUpdateSelectedV5(options.pose, options.selection, nextValue) ??
    options.pose
  );
}

function overlayMessage(
  result: MakeHumanFullBodyJointOverlayRuntimeResultV4 | null,
  overlayError: string | null,
  loading: boolean,
  rotationRingEnabled: boolean,
): string {
  if (overlayError) return 'Joint controls unavailable; sliders remain available.';
  if (loading) return 'Body ready. Loading joint controls.';
  if (result === null) return 'Build the preview to enable scene joint markers.';
  if (result.status === 'unavailable') {
    return 'Joint controls unavailable; sliders remain available.';
  }
  return rotationRingEnabled
    ? 'Joint markers and the selected local rotation ring are ready. Ring changes stay in the draft until APPLY POSE.'
    : 'Joint markers are ready. Rotation rings are not enabled in this increment.';
}

export interface ModelOpenReferenceJointPoseControlPropsV5 {
  readonly draftPose: ModelOpenReferenceFullBodyPoseV4;
  readonly appliedPose: ModelOpenReferenceFullBodyPoseV4 | null;
  readonly status: ModelOpenReferenceFullBodyPoseControlStatusV4;
  readonly overlay: MakeHumanFullBodyJointOverlayRuntimeResultV4 | null;
  readonly overlayError: string | null;
  readonly mode: ModelOpenReferenceJointEditorModeV5;
  readonly selection: ModelOpenReferenceJointSelectionV5;
  readonly onModeChange: (mode: ModelOpenReferenceJointEditorModeV5) => void;
  readonly onSelectionChange: (selection: ModelOpenReferenceJointSelectionV5) => void;
  readonly onDraftChange: (pose: ModelOpenReferenceFullBodyPoseV4) => void;
  readonly onApply: (pose: ModelOpenReferenceFullBodyPoseV4) => void;
  readonly rotationRingEnabled?: boolean;
}

export function ModelOpenReferenceJointPoseControlV5({
  draftPose,
  appliedPose,
  status,
  overlay,
  overlayError,
  mode,
  selection,
  onModeChange,
  onSelectionChange,
  onDraftChange,
  onApply,
  rotationRingEnabled = false,
}: ModelOpenReferenceJointPoseControlPropsV5) {
  const selectedGroup = groupDefinition(selection.groupId);
  const selectedDescriptor = selectedGroup.channelDescriptors.find(
    ({ channel }) => channel === selection.channel,
  );
  if (!selectedDescriptor)
    throw new Error('Selected joint channel is outside the group allowlist.');
  const currentValue = modelOpenReferenceJointChannelValueV5(draftPose, selection);
  const canUseSceneMarkers = overlay?.status === 'ready';
  const overlayLoading = appliedPose !== null && overlay === null && overlayError === null;

  const handleChannelKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (appliedPose === null) return;
      event.preventDefault();
      const restored = modelOpenReferenceJointPoseUpdateSelectedV5(
        draftPose,
        selection,
        modelOpenReferenceJointChannelValueV5(appliedPose, selection),
      );
      if (restored) onDraftChange(restored);
      return;
    }
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0;
    if (direction === 0) return;
    event.preventDefault();
    const delta = direction * (event.shiftKey ? 5 : 1);
    onDraftChange(
      modelOpenReferenceJointPoseStepV5({ pose: draftPose, selection, deltaDegrees: delta }),
    );
  };

  return (
    <div className='flex flex-col gap-stack'>
      <ModelOpenReferenceFullBodyPoseControlV4
        draftPose={draftPose}
        appliedPose={appliedPose}
        status={status}
        onDraftChange={onDraftChange}
        onApply={onApply}
      />

      <fieldset
        className='border-y border-hairline py-2'
        data-testid='model-open-reference-joint-pose-control-v5'
      >
        <legend className='sr-only'>Local joint editor</legend>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <div>
            <Text component='h4' size='micro' className='font-bold uppercase'>
              joint editor
            </Text>
            <Text component='p' size='micro' variant='label'>
              Select an allowlisted group and semantic axis. This is local FK, not IK.
            </Text>
          </div>
          <div
            role='group'
            className='flex flex-wrap items-center gap-1'
            aria-label='viewport interaction mode'
          >
            <Button
              type='button'
              variant='simpleReverseWithBorder'
              size='xs'
              className='min-h-11 px-2'
              aria-pressed={mode === 'camera'}
              onClick={() => onModeChange('camera')}
            >
              camera mode
            </Button>
            <Button
              type='button'
              variant='simpleReverseWithBorder'
              size='xs'
              className='min-h-11 px-2'
              aria-pressed={mode === 'edit-pose'}
              disabled={!canUseSceneMarkers}
              onClick={() => onModeChange('edit-pose')}
            >
              edit pose mode
            </Button>
          </div>
        </div>

        <CalloutBox
          tone={overlayError || overlay?.status === 'unavailable' ? 'warning' : 'note'}
          className='mt-2'
        >
          <Text
            component='p'
            size='micro'
            role='status'
            aria-live='polite'
            aria-atomic='true'
            data-testid='model-open-reference-joint-overlay-status-v5'
          >
            {overlayMessage(overlay, overlayError, overlayLoading, rotationRingEnabled)}
          </Text>
        </CalloutBox>

        <div className='mt-2 grid gap-2 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(16rem,1fr)]'>
          <div>
            <Text component='p' size='nano' variant='label' className='mb-1 uppercase'>
              joint group
            </Text>
            <fieldset className='grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1'>
              <legend className='sr-only'>Pose joint</legend>
              {MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4.map((group) => (
                <label
                  key={group.id}
                  className='flex min-h-11 cursor-pointer items-center gap-2 border border-hairline px-2 text-micro uppercase has-[:checked]:border-textColor has-[:checked]:bg-textColor has-[:checked]:text-bgColor'
                >
                  <Input
                    id={`model-open-reference-joint-v5-${group.id}`}
                    type='radio'
                    name='model-open-reference-joint-v5'
                    form={MODEL_OPEN_REFERENCE_LOCAL_CONTROL_FORM_OWNER}
                    value={group.id}
                    checked={selection.groupId === group.id}
                    onChange={() => onSelectionChange(modelOpenReferenceJointSelectionV5(group.id))}
                    className='size-4 min-h-0 w-4 shrink-0 appearance-auto border-0 p-0 accent-current'
                  />
                  {GROUP_ACCESSIBLE_LABELS[group.id]}
                </label>
              ))}
            </fieldset>
          </div>

          <div>
            <Text component='p' size='nano' variant='label' className='mb-1 uppercase'>
              semantic axis
            </Text>
            <fieldset className='flex flex-wrap gap-1'>
              <legend className='sr-only'>Selected joint channel</legend>
              {selectedGroup.channelDescriptors.map((descriptor) => (
                <label
                  key={descriptor.channel}
                  className='flex min-h-11 cursor-pointer items-center gap-2 border border-hairline px-2 text-micro uppercase has-[:checked]:border-textColor has-[:checked]:bg-textColor has-[:checked]:text-bgColor'
                >
                  <Input
                    id={`model-open-reference-channel-v5-${descriptor.channel}`}
                    type='radio'
                    name='model-open-reference-channel-v5'
                    form={MODEL_OPEN_REFERENCE_LOCAL_CONTROL_FORM_OWNER}
                    value={descriptor.channel}
                    checked={selection.channel === descriptor.channel}
                    aria-label={channelAccessibleLabel(
                      selectedGroup.id,
                      descriptor.channel,
                      descriptor.axis,
                    )}
                    onChange={() =>
                      onSelectionChange(
                        modelOpenReferenceJointSelectionV5(selectedGroup.id, descriptor.channel),
                      )
                    }
                    className='size-4 min-h-0 w-4 shrink-0 appearance-auto border-0 p-0 accent-current'
                  />
                  {CHANNEL_LABELS[descriptor.channel]} · {descriptor.axis.toUpperCase()}
                </label>
              ))}
            </fieldset>
            <div className='mt-2 flex flex-wrap items-center gap-2 border-t border-hairline pt-2'>
              <Pill tone='ink'>{selectedGroup.label}</Pill>
              <Pill tone='attention'>local {selectedDescriptor.axis.toUpperCase()}</Pill>
              <Text component='p' size='micro' className='tabular-nums'>
                {currentValue}° · Arrow 1° · Shift + Arrow 5°
              </Text>
              <Input
                type='range'
                min={modelOpenReferenceJointChannelLimitV5(selection).min}
                max={modelOpenReferenceJointChannelLimitV5(selection).max}
                step={1}
                value={currentValue}
                aria-label={`Selected joint rotation: ${channelAccessibleLabel(
                  selectedGroup.id,
                  selection.channel,
                  selectedDescriptor.axis,
                )}`}
                aria-valuetext={`${currentValue} degrees`}
                className='h-11 min-w-48 grow accent-textColor'
                disabled={status === 'building'}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const next = modelOpenReferenceJointPoseUpdateSelectedV5(
                    draftPose,
                    selection,
                    Number(event.currentTarget.value),
                  );
                  if (next) onDraftChange(next);
                }}
                onKeyDown={handleChannelKeyDown}
              />
              <Button
                type='button'
                variant='underline'
                size='xs'
                className='min-h-11 px-2'
                disabled={currentValue === 0 || status === 'building'}
                onClick={() => {
                  const next = modelOpenReferenceJointPoseUpdateSelectedV5(draftPose, selection, 0);
                  if (next) onDraftChange(next);
                }}
              >
                reset selected
              </Button>
            </div>
            {draftPose.armMode === 'linked' && selectedGroup.side !== 'center' ? (
              <Text component='p' size='micro' variant='label' className='mt-1'>
                Arms linked: editing either side updates both.
              </Text>
            ) : null}
          </div>
        </div>
      </fieldset>
    </div>
  );
}
