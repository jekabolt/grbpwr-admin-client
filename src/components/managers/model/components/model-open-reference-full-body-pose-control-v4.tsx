import { useId, type ChangeEvent } from 'react';

import { MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3 } from 'lib/cloth/body/makehuman-clo-like-pose-display-v3';
import { Button, Input, Pill, Text } from 'ui';

export const MODEL_OPEN_REFERENCE_FULL_BODY_POSE_CONTROL_V4 =
  'model-open-reference-full-body-pose-control/v4' as const;

export const MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4 = Object.freeze({
  bodyFlexionDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoFlexionDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoFlexionDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoFlexionDeg.stepDeg,
  }),
  bodySideBendDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoSideBendDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoSideBendDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoSideBendDeg.stepDeg,
  }),
  bodyTwistDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoTwistDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoTwistDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.torsoTwistDeg.stepDeg,
  }),
  shoulderRaiseDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderRaiseDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderRaiseDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderRaiseDeg.stepDeg,
  }),
  shoulderForwardDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderForwardDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderForwardDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderForwardDeg.stepDeg,
  }),
  elbowBendDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.elbowBendDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.elbowBendDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.elbowBendDeg.stepDeg,
  }),
  wristBendDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.wristBendDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.wristBendDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.wristBendDeg.stepDeg,
  }),
} as const);

export type ModelOpenReferenceFullBodyPoseBodyFieldV4 =
  | 'bodyFlexionDegrees'
  | 'bodySideBendDegrees'
  | 'bodyTwistDegrees';
export type ModelOpenReferenceFullBodyPoseArmFieldV4 =
  | 'shoulderRaiseDegrees'
  | 'shoulderForwardDegrees'
  | 'elbowBendDegrees'
  | 'wristBendDegrees';
export type ModelOpenReferenceFullBodyPoseArmSideV4 = 'left' | 'right';

export interface ModelOpenReferenceFullBodyArmPoseV4 {
  readonly shoulderRaiseDegrees: number;
  readonly shoulderForwardDegrees: number;
  readonly elbowBendDegrees: number;
  readonly wristBendDegrees: number;
}

export interface ModelOpenReferenceFullBodyPoseV4 {
  readonly bodyFlexionDegrees: number;
  readonly bodySideBendDegrees: number;
  readonly bodyTwistDegrees: number;
  readonly armMode: 'linked' | 'independent';
  readonly leftArm: ModelOpenReferenceFullBodyArmPoseV4;
  readonly rightArm: ModelOpenReferenceFullBodyArmPoseV4;
}

const ZERO_ARM_V4: ModelOpenReferenceFullBodyArmPoseV4 = Object.freeze({
  shoulderRaiseDegrees: 0,
  shoulderForwardDegrees: 0,
  elbowBendDegrees: 0,
  wristBendDegrees: 0,
});

export const MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4: ModelOpenReferenceFullBodyPoseV4 =
  Object.freeze({
    bodyFlexionDegrees: 0,
    bodySideBendDegrees: 0,
    bodyTwistDegrees: 0,
    armMode: 'linked',
    leftArm: ZERO_ARM_V4,
    rightArm: ZERO_ARM_V4,
  });

export type ModelOpenReferenceFullBodyPoseControlStatusV4 =
  | 'idle'
  | 'pending'
  | 'building'
  | 'error';

interface PoseRangeDefinitionV4 {
  readonly field:
    | ModelOpenReferenceFullBodyPoseBodyFieldV4
    | ModelOpenReferenceFullBodyPoseArmFieldV4;
  readonly label: string;
  readonly axis: string;
}

const BODY_RANGES: readonly PoseRangeDefinitionV4[] = Object.freeze([
  Object.freeze({ field: 'bodyFlexionDegrees', label: 'forward / back', axis: 'spine local X' }),
  Object.freeze({ field: 'bodySideBendDegrees', label: 'side bend', axis: 'spine local Z' }),
  Object.freeze({ field: 'bodyTwistDegrees', label: 'twist', axis: 'spine local Y' }),
]);

const ARM_RANGES: readonly PoseRangeDefinitionV4[] = Object.freeze([
  Object.freeze({
    field: 'shoulderRaiseDegrees',
    label: 'raise arm',
    axis: 'upper-arm local axis',
  }),
  Object.freeze({
    field: 'shoulderForwardDegrees',
    label: 'arm forward / back',
    axis: 'upper-arm local X',
  }),
  Object.freeze({ field: 'elbowBendDegrees', label: 'bend elbow', axis: 'elbow hinge axis' }),
  Object.freeze({ field: 'wristBendDegrees', label: 'bend wrist', axis: 'wrist local X' }),
]);

const RANGE_CLASS =
  'h-11 min-h-11 cursor-pointer border-0 bg-transparent p-0 sm:h-5 sm:min-h-0 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor ' +
  '[&::-webkit-slider-runnable-track]:h-px [&::-webkit-slider-runnable-track]:bg-textColor ' +
  '[&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:size-[11px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-textColor [&::-webkit-slider-thumb]:bg-textColor ' +
  '[&::-moz-range-track]:h-px [&::-moz-range-track]:bg-textColor ' +
  '[&::-moz-range-thumb]:size-[11px] [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-textColor [&::-moz-range-thumb]:bg-textColor';

function freezeArm(arm: ModelOpenReferenceFullBodyArmPoseV4) {
  return Object.freeze({ ...arm });
}

export function snapshotModelOpenReferenceFullBodyPoseV4(
  pose: ModelOpenReferenceFullBodyPoseV4,
): ModelOpenReferenceFullBodyPoseV4 {
  return Object.freeze({
    ...pose,
    leftArm: freezeArm(pose.leftArm),
    rightArm: freezeArm(pose.rightArm),
  });
}

function validStep(value: number, limit: { min: number; max: number; step: number }) {
  return (
    Number.isFinite(value) &&
    value >= limit.min &&
    value <= limit.max &&
    Math.abs((value - limit.min) / limit.step - Math.round((value - limit.min) / limit.step)) < 1e-9
  );
}

export function modelOpenReferenceFullBodyPoseUpdateBodyV4(
  pose: ModelOpenReferenceFullBodyPoseV4,
  field: ModelOpenReferenceFullBodyPoseBodyFieldV4,
  value: number,
): ModelOpenReferenceFullBodyPoseV4 | null {
  if (!validStep(value, MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4[field])) return null;
  return snapshotModelOpenReferenceFullBodyPoseV4({ ...pose, [field]: value });
}

export function modelOpenReferenceFullBodyPoseUpdateArmV4(
  pose: ModelOpenReferenceFullBodyPoseV4,
  side: ModelOpenReferenceFullBodyPoseArmSideV4,
  field: ModelOpenReferenceFullBodyPoseArmFieldV4,
  value: number,
): ModelOpenReferenceFullBodyPoseV4 | null {
  if (!validStep(value, MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4[field])) return null;
  const selected = side === 'left' ? pose.leftArm : pose.rightArm;
  const nextSelected = freezeArm({ ...selected, [field]: value });
  if (pose.armMode === 'linked') {
    return snapshotModelOpenReferenceFullBodyPoseV4({
      ...pose,
      leftArm: nextSelected,
      rightArm: nextSelected,
    });
  }
  return snapshotModelOpenReferenceFullBodyPoseV4({
    ...pose,
    [side === 'left' ? 'leftArm' : 'rightArm']: nextSelected,
  });
}

export function modelOpenReferenceFullBodyPoseUnlinkArmsV4(
  pose: ModelOpenReferenceFullBodyPoseV4,
): ModelOpenReferenceFullBodyPoseV4 {
  return snapshotModelOpenReferenceFullBodyPoseV4({ ...pose, armMode: 'independent' });
}

export function modelOpenReferenceFullBodyPoseLinkArmsFromV4(
  pose: ModelOpenReferenceFullBodyPoseV4,
  side: ModelOpenReferenceFullBodyPoseArmSideV4,
): ModelOpenReferenceFullBodyPoseV4 {
  const source = freezeArm(side === 'left' ? pose.leftArm : pose.rightArm);
  return snapshotModelOpenReferenceFullBodyPoseV4({
    ...pose,
    armMode: 'linked',
    leftArm: source,
    rightArm: source,
  });
}

function armsEqual(
  left: ModelOpenReferenceFullBodyArmPoseV4,
  right: ModelOpenReferenceFullBodyArmPoseV4,
) {
  return (Object.keys(left) as ModelOpenReferenceFullBodyPoseArmFieldV4[]).every(
    (field) => left[field] === right[field],
  );
}

/** Geometry equality deliberately ignores the editor's linked/independent mode. */
export function modelOpenReferenceFullBodyPoseGeometryEqualV4(
  left: ModelOpenReferenceFullBodyPoseV4 | null,
  right: ModelOpenReferenceFullBodyPoseV4 | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.bodyFlexionDegrees === right.bodyFlexionDegrees &&
    left.bodySideBendDegrees === right.bodySideBendDegrees &&
    left.bodyTwistDegrees === right.bodyTwistDegrees &&
    armsEqual(left.leftArm, right.leftArm) &&
    armsEqual(left.rightArm, right.rightArm)
  );
}

function signedDirection(value: number, negative: string, positive: string): string {
  if (value === 0) return 'neutral, 0 degrees';
  return `${value < 0 ? negative : positive}, ${Math.abs(value)} degrees`;
}

function poseValueText(
  field: ModelOpenReferenceFullBodyPoseBodyFieldV4 | ModelOpenReferenceFullBodyPoseArmFieldV4,
  value: number,
  subject?: string,
) {
  if (field === 'bodyFlexionDegrees') return signedDirection(value, 'back', 'forward');
  if (field === 'bodySideBendDegrees' || field === 'bodyTwistDegrees')
    return signedDirection(value, 'left', 'right');
  if (field === 'shoulderRaiseDegrees')
    return value === 0 ? `${subject} neutral, 0 degrees` : `${subject} raised ${value} degrees`;
  if (field === 'shoulderForwardDegrees')
    return signedDirection(value, `${subject} back`, `${subject} forward`);
  if (field === 'elbowBendDegrees')
    return value === 0 ? `${subject} neutral, 0 degrees` : `${subject} bent ${value} degrees`;
  return signedDirection(value, `${subject} back`, `${subject} forward`);
}

function PoseRangeV4({
  definition,
  inputId,
  value,
  ariaLabel,
  subject,
  onChange,
}: {
  readonly definition: PoseRangeDefinitionV4;
  readonly inputId: string;
  readonly value: number;
  readonly ariaLabel: string;
  readonly subject?: string;
  readonly onChange: (value: number) => void;
}) {
  const limit = MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V4[definition.field];
  const valueText = poseValueText(definition.field, value, subject);
  return (
    <div className='border-t border-hairline py-1.5 first:border-t-0'>
      <div className='mb-1 flex flex-wrap items-baseline justify-between gap-x-stack gap-y-0.5'>
        <label htmlFor={inputId} className='text-micro uppercase tracking-label text-labelColor'>
          {definition.label}
        </label>
        <Text component='span' size='nano' variant='label' className='font-mono uppercase'>
          {definition.axis}
        </Text>
        <Text component='span' size='micro' className='w-full tabular-nums sm:w-auto'>
          {valueText}
        </Text>
      </div>
      <Input
        id={inputId}
        type='range'
        min={limit.min}
        max={limit.max}
        step={limit.step}
        value={value}
        aria-label={ariaLabel}
        aria-valuetext={valueText}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(Number(event.currentTarget.value))
        }
        className={RANGE_CLASS}
      />
    </div>
  );
}

function ArmRangesV4({
  side,
  arm,
  idPrefix,
  linked = false,
  onChange,
}: {
  readonly side: ModelOpenReferenceFullBodyPoseArmSideV4;
  readonly arm: ModelOpenReferenceFullBodyArmPoseV4;
  readonly idPrefix: string;
  readonly linked?: boolean;
  readonly onChange: (field: ModelOpenReferenceFullBodyPoseArmFieldV4, value: number) => void;
}) {
  const sideLabel = linked ? 'Linked' : side === 'left' ? 'Left' : 'Right';
  const ariaLabel = (field: ModelOpenReferenceFullBodyPoseArmFieldV4) => {
    if (field === 'shoulderRaiseDegrees') return `${sideLabel} arm raise`;
    if (field === 'shoulderForwardDegrees') return `${sideLabel} arm forward and back`;
    if (field === 'elbowBendDegrees') return `${sideLabel} elbow bend`;
    return `${sideLabel} wrist bend`;
  };
  return ARM_RANGES.map((definition) => (
    <PoseRangeV4
      key={definition.field}
      definition={definition}
      inputId={`${idPrefix}-${side}-${definition.field}`}
      value={arm[definition.field as ModelOpenReferenceFullBodyPoseArmFieldV4]}
      ariaLabel={ariaLabel(definition.field as ModelOpenReferenceFullBodyPoseArmFieldV4)}
      subject={`${linked ? 'both' : side} ${definition.field.startsWith('elbow') ? 'elbow' : definition.field.startsWith('wrist') ? 'wrist' : 'arm'}`}
      onChange={(value) =>
        onChange(definition.field as ModelOpenReferenceFullBodyPoseArmFieldV4, value)
      }
    />
  ));
}

export function ModelOpenReferenceFullBodyPoseControlV4({
  draftPose,
  appliedPose,
  status,
  onDraftChange,
  onApply,
}: {
  readonly draftPose: ModelOpenReferenceFullBodyPoseV4;
  readonly appliedPose: ModelOpenReferenceFullBodyPoseV4 | null;
  readonly status: ModelOpenReferenceFullBodyPoseControlStatusV4;
  readonly onDraftChange: (pose: ModelOpenReferenceFullBodyPoseV4) => void;
  readonly onApply: (pose: ModelOpenReferenceFullBodyPoseV4) => void;
}) {
  const idPrefix = useId();
  const differsFromApplied = !modelOpenReferenceFullBodyPoseGeometryEqualV4(draftPose, appliedPose);
  const neutralGeometry = modelOpenReferenceFullBodyPoseGeometryEqualV4(
    draftPose,
    MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
  );
  const changeBody = (field: ModelOpenReferenceFullBodyPoseBodyFieldV4, value: number) => {
    const next = modelOpenReferenceFullBodyPoseUpdateBodyV4(draftPose, field, value);
    if (next) onDraftChange(next);
  };
  const changeArm = (
    side: ModelOpenReferenceFullBodyPoseArmSideV4,
    field: ModelOpenReferenceFullBodyPoseArmFieldV4,
    value: number,
  ) => {
    const next = modelOpenReferenceFullBodyPoseUpdateArmV4(draftPose, side, field, value);
    if (next) onDraftChange(next);
  };

  return (
    <fieldset
      className='flex flex-col gap-2 border-y border-hairline py-2'
      data-testid='model-open-reference-full-body-pose-control-v4'
    >
      <legend className='sr-only'>Full-body display pose with independent arms</legend>
      <div className='flex flex-wrap items-center justify-between gap-stack'>
        <Text component='p' size='micro' variant='label'>
          full-body pose
        </Text>
        <div className='flex flex-wrap items-center gap-1'>
          <Pill tone='ink'>local axes</Pill>
          <Pill tone={draftPose.armMode === 'linked' ? 'ok' : 'attention'}>
            {draftPose.armMode === 'linked' ? 'arms linked' : 'arms independent'}
          </Pill>
        </div>
      </div>

      <section aria-labelledby={`${idPrefix}-body-heading`}>
        <Text
          id={`${idPrefix}-body-heading`}
          component='h4'
          size='micro'
          className='border-b border-textColor pb-1 font-bold uppercase'
        >
          body
        </Text>
        {BODY_RANGES.map((definition) => (
          <PoseRangeV4
            key={definition.field}
            definition={definition}
            inputId={`${idPrefix}-${definition.field}`}
            value={draftPose[definition.field as ModelOpenReferenceFullBodyPoseBodyFieldV4]}
            ariaLabel={
              definition.field === 'bodyFlexionDegrees'
                ? 'Body forward and back bend'
                : definition.field === 'bodySideBendDegrees'
                  ? 'Body side bend'
                  : 'Body twist'
            }
            onChange={(value) =>
              changeBody(definition.field as ModelOpenReferenceFullBodyPoseBodyFieldV4, value)
            }
          />
        ))}
      </section>

      <section aria-labelledby={`${idPrefix}-arms-heading`}>
        <div className='flex flex-wrap items-center justify-between gap-2 border-b border-textColor pb-1'>
          <Text
            id={`${idPrefix}-arms-heading`}
            component='h4'
            size='micro'
            className='font-bold uppercase'
          >
            arms · {draftPose.armMode === 'linked' ? 'linked left / right' : 'independent'}
          </Text>
          {draftPose.armMode === 'linked' ? (
            <Button
              type='button'
              variant='underline'
              size='xs'
              className='min-h-11 px-2 sm:min-h-0'
              disabled={status === 'building'}
              onClick={() => onDraftChange(modelOpenReferenceFullBodyPoseUnlinkArmsV4(draftPose))}
            >
              unlink arms
            </Button>
          ) : (
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                type='button'
                variant='underline'
                size='xs'
                className='min-h-11 px-2 sm:min-h-0'
                disabled={status === 'building'}
                onClick={() =>
                  onDraftChange(modelOpenReferenceFullBodyPoseLinkArmsFromV4(draftPose, 'left'))
                }
              >
                link from left
              </Button>
              <Button
                type='button'
                variant='underline'
                size='xs'
                className='min-h-11 px-2 sm:min-h-0'
                disabled={status === 'building'}
                onClick={() =>
                  onDraftChange(modelOpenReferenceFullBodyPoseLinkArmsFromV4(draftPose, 'right'))
                }
              >
                link from right
              </Button>
            </div>
          )}
        </div>
        {draftPose.armMode === 'linked' ? (
          <ArmRangesV4
            side='left'
            arm={draftPose.leftArm}
            idPrefix={idPrefix}
            linked
            onChange={(field, value) => changeArm('left', field, value)}
          />
        ) : (
          <div className='grid gap-x-4 md:grid-cols-2'>
            <section aria-labelledby={`${idPrefix}-left-arm-heading`}>
              <Text
                id={`${idPrefix}-left-arm-heading`}
                component='h5'
                size='micro'
                variant='label'
                className='border-b border-hairline py-1 uppercase'
              >
                left arm
              </Text>
              <ArmRangesV4
                side='left'
                arm={draftPose.leftArm}
                idPrefix={idPrefix}
                onChange={(field, value) => changeArm('left', field, value)}
              />
            </section>
            <section aria-labelledby={`${idPrefix}-right-arm-heading`}>
              <Text
                id={`${idPrefix}-right-arm-heading`}
                component='h5'
                size='micro'
                variant='label'
                className='border-b border-hairline py-1 uppercase'
              >
                right arm
              </Text>
              <ArmRangesV4
                side='right'
                arm={draftPose.rightArm}
                idPrefix={idPrefix}
                onChange={(field, value) => changeArm('right', field, value)}
              />
            </section>
          </div>
        )}
      </section>

      <div className='flex flex-wrap items-center justify-between gap-stack border-t border-hairline pt-2'>
        <div className='flex flex-wrap items-center gap-1'>
          <Pill tone='ink'>draft</Pill>
          <Pill tone={appliedPose === null ? 'mut' : 'ok'}>
            {appliedPose === null ? 'preview not built' : 'preview applied'}
          </Pill>
          {status === 'error' ? (
            <Pill tone='warn'>pose update failed</Pill>
          ) : differsFromApplied ? (
            <Pill tone='attention'>pose pending</Pill>
          ) : null}
        </div>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='underline'
            size='xs'
            className='min-h-11 px-2 sm:min-h-0'
            disabled={(neutralGeometry && draftPose.armMode === 'linked') || status === 'building'}
            onClick={() => onDraftChange(MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4)}
          >
            reset pose
          </Button>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className='min-h-11 sm:min-h-0'
            loading={status === 'building'}
            disabled={status === 'building' || !differsFromApplied}
            onClick={() => onApply(draftPose)}
          >
            apply pose
          </Button>
        </div>
      </div>

      <Text component='p' size='micro' variant={status === 'error' ? 'errorLabel' : 'label'}>
        {status === 'building'
          ? 'Updating pose; the current preview remains visible until ready.'
          : status === 'error'
            ? 'Pose update failed; the draft remains unapplied.'
            : appliedPose === null
              ? 'Draft pose is not applied. Build or apply the preview to continue.'
              : differsFromApplied
                ? 'Draft pose differs from the visible preview.'
                : 'Visible preview matches the draft pose.'}
      </Text>
      <Text component='p' size='micro' variant='label'>
        Local-axis pose is a visual reference only. Independent mode edits each arm separately.
        Linking explicitly copies one selected side. Pose is not saved with the model.
      </Text>
    </fieldset>
  );
}
