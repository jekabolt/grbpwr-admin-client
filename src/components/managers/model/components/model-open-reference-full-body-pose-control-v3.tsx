import { useId, type ChangeEvent } from 'react';

import { MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3 } from 'lib/cloth/body/makehuman-clo-like-pose-display-v3';
import { Button, Input, Pill, Text } from 'ui';

export const MODEL_OPEN_REFERENCE_FULL_BODY_POSE_CONTROL_V3 =
  'model-open-reference-full-body-pose-control/v3' as const;

export const MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V3 = Object.freeze({
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
  linkedArmRaiseDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderRaiseDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderRaiseDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderRaiseDeg.stepDeg,
  }),
  linkedArmForwardDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderForwardDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderForwardDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.shoulderForwardDeg.stepDeg,
  }),
  linkedElbowBendDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.elbowBendDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.elbowBendDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.elbowBendDeg.stepDeg,
  }),
  linkedWristBendDegrees: Object.freeze({
    min: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.wristBendDeg.minimumDeg,
    max: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.wristBendDeg.maximumDeg,
    step: MAKEHUMAN_CLO_LIKE_POSE_CHANNELS_V3.wristBendDeg.stepDeg,
  }),
} as const);

export type ModelOpenReferenceFullBodyPoseFieldV3 =
  keyof typeof MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V3;

export interface ModelOpenReferenceFullBodyPoseV3 {
  readonly bodyFlexionDegrees: number;
  readonly bodySideBendDegrees: number;
  readonly bodyTwistDegrees: number;
  readonly linkedArmRaiseDegrees: number;
  readonly linkedArmForwardDegrees: number;
  readonly linkedElbowBendDegrees: number;
  readonly linkedWristBendDegrees: number;
}

export const MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V3: ModelOpenReferenceFullBodyPoseV3 =
  Object.freeze({
    bodyFlexionDegrees: 0,
    bodySideBendDegrees: 0,
    bodyTwistDegrees: 0,
    linkedArmRaiseDegrees: 0,
    linkedArmForwardDegrees: 0,
    linkedElbowBendDegrees: 0,
    linkedWristBendDegrees: 0,
  });

export type ModelOpenReferenceFullBodyPoseControlStatusV3 =
  | 'idle'
  | 'pending'
  | 'building'
  | 'error';

export interface ModelOpenReferenceFullBodyPoseControlV3Props {
  readonly draftPose: ModelOpenReferenceFullBodyPoseV3;
  readonly appliedPose: ModelOpenReferenceFullBodyPoseV3 | null;
  readonly status: ModelOpenReferenceFullBodyPoseControlStatusV3;
  readonly onDraftChange: (pose: ModelOpenReferenceFullBodyPoseV3) => void;
  readonly onApply: (pose: ModelOpenReferenceFullBodyPoseV3) => void;
}

interface PoseRangeDefinitionV3 {
  readonly field: ModelOpenReferenceFullBodyPoseFieldV3;
  readonly label: string;
  readonly axis: string;
  readonly ariaLabel: string;
}

const BODY_RANGES: readonly PoseRangeDefinitionV3[] = Object.freeze([
  Object.freeze({
    field: 'bodyFlexionDegrees',
    label: 'forward / back',
    axis: 'spine local X',
    ariaLabel: 'Body forward and back bend',
  }),
  Object.freeze({
    field: 'bodySideBendDegrees',
    label: 'side bend',
    axis: 'spine local Z',
    ariaLabel: 'Body side bend',
  }),
  Object.freeze({
    field: 'bodyTwistDegrees',
    label: 'twist',
    axis: 'spine local Y',
    ariaLabel: 'Body twist',
  }),
]);

const ARM_RANGES: readonly PoseRangeDefinitionV3[] = Object.freeze([
  Object.freeze({
    field: 'linkedArmRaiseDegrees',
    label: 'raise arms',
    axis: 'upper-arm local axis',
    ariaLabel: 'Linked arm raise',
  }),
  Object.freeze({
    field: 'linkedArmForwardDegrees',
    label: 'arms forward / back',
    axis: 'upper-arm local X',
    ariaLabel: 'Linked arms forward and back',
  }),
  Object.freeze({
    field: 'linkedElbowBendDegrees',
    label: 'bend elbows',
    axis: 'elbow hinge axis',
    ariaLabel: 'Linked elbow bend',
  }),
  Object.freeze({
    field: 'linkedWristBendDegrees',
    label: 'bend wrists',
    axis: 'wrist local X',
    ariaLabel: 'Linked wrist bend',
  }),
]);

const RANGE_CLASS =
  'h-5 min-h-0 cursor-pointer border-0 bg-transparent p-0 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor ' +
  '[&::-webkit-slider-runnable-track]:h-px [&::-webkit-slider-runnable-track]:bg-textColor ' +
  '[&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:size-[11px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-textColor [&::-webkit-slider-thumb]:bg-textColor ' +
  '[&::-moz-range-track]:h-px [&::-moz-range-track]:bg-textColor ' +
  '[&::-moz-range-thumb]:size-[11px] [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-textColor [&::-moz-range-thumb]:bg-textColor';

function signedDirection(value: number, negative: string, positive: string): string {
  if (value === 0) return 'neutral, 0 degrees';
  return `${value < 0 ? negative : positive}, ${Math.abs(value)} degrees`;
}

export function modelOpenReferenceFullBodyPoseValueTextV3(
  field: ModelOpenReferenceFullBodyPoseFieldV3,
  value: number,
): string {
  switch (field) {
    case 'bodyFlexionDegrees':
      return signedDirection(value, 'back', 'forward');
    case 'bodySideBendDegrees':
      return signedDirection(value, 'left', 'right');
    case 'bodyTwistDegrees':
      return signedDirection(value, 'left', 'right');
    case 'linkedArmRaiseDegrees':
      return value === 0 ? 'both arms neutral, 0 degrees' : `both arms raised ${value} degrees`;
    case 'linkedArmForwardDegrees':
      return signedDirection(value, 'both arms back', 'both arms forward');
    case 'linkedElbowBendDegrees':
      return value === 0 ? 'both elbows neutral, 0 degrees' : `both elbows bent ${value} degrees`;
    case 'linkedWristBendDegrees':
      return signedDirection(value, 'both wrists back', 'both wrists forward');
  }
}

export function modelOpenReferenceFullBodyPoseEqualV3(
  left: ModelOpenReferenceFullBodyPoseV3 | null,
  right: ModelOpenReferenceFullBodyPoseV3 | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    Object.keys(
      MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V3,
    ) as ModelOpenReferenceFullBodyPoseFieldV3[]
  ).every((field) => left[field] === right[field]);
}

export function modelOpenReferenceFullBodyPoseUpdateV3(
  pose: ModelOpenReferenceFullBodyPoseV3,
  field: ModelOpenReferenceFullBodyPoseFieldV3,
  value: number,
): ModelOpenReferenceFullBodyPoseV3 | null {
  const limit = MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V3[field];
  if (
    !Number.isFinite(value) ||
    value < limit.min ||
    value > limit.max ||
    (value - limit.min) % limit.step !== 0
  ) {
    return null;
  }
  return Object.freeze({ ...pose, [field]: value });
}

function PoseRangeV3({
  definition,
  inputId,
  value,
  onChange,
}: {
  readonly definition: PoseRangeDefinitionV3;
  readonly inputId: string;
  readonly value: number;
  readonly onChange: (field: ModelOpenReferenceFullBodyPoseFieldV3, value: number) => void;
}) {
  const limit = MODEL_OPEN_REFERENCE_FULL_BODY_POSE_LIMITS_V3[definition.field];
  const valueText = modelOpenReferenceFullBodyPoseValueTextV3(definition.field, value);

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
        aria-label={definition.ariaLabel}
        aria-valuetext={valueText}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(definition.field, Number(event.currentTarget.value))
        }
        className={RANGE_CLASS}
      />
    </div>
  );
}

export function ModelOpenReferenceFullBodyPoseControlV3({
  draftPose,
  appliedPose,
  status,
  onDraftChange,
  onApply,
}: ModelOpenReferenceFullBodyPoseControlV3Props) {
  const idPrefix = useId();
  const differsFromApplied = !modelOpenReferenceFullBodyPoseEqualV3(draftPose, appliedPose);
  const isNeutral = modelOpenReferenceFullBodyPoseEqualV3(
    draftPose,
    MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V3,
  );

  const changeField = (field: ModelOpenReferenceFullBodyPoseFieldV3, value: number) => {
    const next = modelOpenReferenceFullBodyPoseUpdateV3(draftPose, field, value);
    if (next !== null) onDraftChange(next);
  };

  return (
    <fieldset
      className='flex flex-col gap-2 border-y border-hairline py-2'
      data-testid='model-open-reference-full-body-pose-control-v3'
    >
      <legend className='sr-only'>Full-body display pose</legend>

      <div className='flex flex-wrap items-center justify-between gap-stack'>
        <Text component='p' size='micro' variant='label'>
          full-body pose
        </Text>
        <div className='flex flex-wrap items-center gap-1'>
          <Pill tone='ink'>local axes</Pill>
          <Pill tone='ok'>symmetry on</Pill>
        </div>
      </div>

      <div className='grid gap-x-4 lg:grid-cols-2'>
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
            <PoseRangeV3
              key={definition.field}
              definition={definition}
              inputId={`${idPrefix}-${definition.field}`}
              value={draftPose[definition.field]}
              onChange={changeField}
            />
          ))}
        </section>

        <section aria-labelledby={`${idPrefix}-arms-heading`}>
          <Text
            id={`${idPrefix}-arms-heading`}
            component='h4'
            size='micro'
            className='border-b border-textColor pb-1 font-bold uppercase'
          >
            arms · linked left / right
          </Text>
          {ARM_RANGES.map((definition) => (
            <PoseRangeV3
              key={definition.field}
              definition={definition}
              inputId={`${idPrefix}-${definition.field}`}
              value={draftPose[definition.field]}
              onChange={changeField}
            />
          ))}
        </section>
      </div>

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
            disabled={isNeutral || status === 'building'}
            onClick={() => onDraftChange(MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V3)}
          >
            reset pose
          </Button>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            loading={status === 'building'}
            disabled={status === 'building' || !differsFromApplied}
            onClick={() => onApply(draftPose)}
          >
            apply pose
          </Button>
        </div>
      </div>

      <Text
        component='p'
        size='micro'
        variant={status === 'error' ? 'errorLabel' : 'label'}
        data-testid='model-open-reference-full-body-pose-status-v3'
      >
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
        Local-axis pose is a visual reference only. Symmetry links both arms, elbows and wrists.
        Pose is not saved with the model.
      </Text>
    </fieldset>
  );
}
