import {
  compileStagedEmbeddedSeamScheduleV1,
  type EmbeddedSeamSupportV1,
} from '../../compiler/seam-constraints';
import { createXpbdBendResetPacketV1 } from './xpbd-initialization-core-reset';
import {
  packXpbdSeamSolveActivationParamsV1,
  packXpbdSeamSolveColorParamsV1,
  XPBD_SEAM_SOLVE_WORKGROUP_SIZE_V1,
} from './xpbd-seam-solve-kernel-v1';
import { packXpbdSeamSupportRowsV1 } from './xpbd-seam-support-packet-v1';

interface EmbeddedSeamStageIntentV1 {
  readonly operationOrder: number;
  readonly action: 'activate' | 'contract' | 'contract-active';
  readonly requestedReductionM: number;
  readonly maximumReductionM: number;
  readonly currentPositionsMInvMass: Float32Array;
  readonly priorActiveConstraintCount: number;
  readonly priorTargetLengthsM: Float32Array;
  readonly seamComplianceMPerN: number;
  readonly dtS: number;
}

interface EmbeddedSeamStageV1 {
  readonly operationOrder: number;
  readonly priorActiveConstraintCount: number;
  readonly activeConstraintCount: number;
}

const frameSources = new WeakMap<
  object,
  { supportRows: ArrayBuffer; activationRanks: Uint32Array }
>();

export function snapshotEmbeddedSeamFrameSourceV1(
  plan: ReturnType<typeof prepareStagedEmbeddedSeamActivationV1>,
) {
  const source = frameSources.get(plan);
  if (!source) throw new TypeError('A prepared embedded seam plan is required.');
  return {
    supportRows: source.supportRows.slice(0),
    activationRanks: source.activationRanks.slice(),
  };
}

function snapshotFrame(values: Float32Array, expectedLength: number): Float32Array {
  if (
    Object.getPrototypeOf(values) !== Float32Array.prototype ||
    values.length !== expectedLength ||
    Object.getPrototypeOf(values.buffer) !== ArrayBuffer.prototype
  )
    throw new RangeError('An owned Float32 stage buffer of the exact length is required.');
  return new Float32Array(values);
}

function measureSupport(positions: Float32Array, supports: readonly EmbeddedSeamSupportV1[]) {
  const anchor = supports[0].particleIndex * 4;
  const gap = [0, 0, 0];
  let effectiveInverseMass = 0;
  for (const { particleIndex, signedWeight } of supports) {
    const base = particleIndex * 4;
    for (let axis = 0; axis < 3; axis++)
      gap[axis] += signedWeight * (positions[base + axis] - positions[anchor + axis]);
    effectiveInverseMass += positions[base + 3] * signedWeight * signedWeight;
  }
  const distanceM = Math.hypot(...gap);
  if (!Number.isFinite(distanceM) || distanceM >= 1e30)
    throw new RangeError('The affine seam gap exceeds the embedded kernel domain.');
  return { distanceM, effectiveInverseMass };
}

/** Prepares rank and support buffers for the existing embedded XPBD seam kernel. */
export function prepareStagedEmbeddedSeamActivationV1(
  pairs: Parameters<typeof compileStagedEmbeddedSeamScheduleV1>[0],
  particleCount: number,
  supportByteBudget: number,
) {
  const schedule = compileStagedEmbeddedSeamScheduleV1(pairs, particleCount);
  const totalConstraintCount = schedule.grouped.length;
  const supportRows = packXpbdSeamSupportRowsV1(
    schedule.grouped.map((row) => row.supports),
    particleCount,
    supportByteBudget,
  );
  const activationRanks = Uint32Array.from(
    schedule.grouped,
    ({ activationRank }) => activationRank,
  );
  const stages: EmbeddedSeamStageV1[] = [];
  let start = 0;
  for (let end = 1; end <= totalConstraintCount; end++) {
    const operationOrder = schedule.grouped[schedule.activationOrder[end - 1]].operationOrder;
    if (
      end < totalConstraintCount &&
      schedule.grouped[schedule.activationOrder[end]].operationOrder === operationOrder
    )
      continue;
    stages.push(
      Object.freeze({
        operationOrder,
        priorActiveConstraintCount: start,
        activeConstraintCount: end,
      }),
    );
    start = end;
  }

  const plan = Object.freeze({
    particleCount,
    stages: Object.freeze(stages),
    supportRows: supportRows.slice(0),
    activationOrder: schedule.activationOrder.slice(),
    activationRanks: activationRanks.slice(),
    colorRanges: schedule.colorRanges.slice(),
    measureActiveGaps(
      currentPositionsMInvMass: Float32Array,
      targetLengthsM: Float32Array,
      activeConstraintCount: number,
    ) {
      const lastStage = stages.findIndex(
        (stage) => stage.activeConstraintCount === activeConstraintCount,
      );
      if (lastStage === -1)
        throw new RangeError('The active constraints do not match a seam stage boundary.');
      const positions = snapshotFrame(currentPositionsMInvMass, particleCount * 4);
      const targets = snapshotFrame(targetLengthsM, totalConstraintCount);
      return stages.slice(0, lastStage + 1).map((stage) => {
        let sumSquaredGapM2 = 0;
        let maximumGapM = 0;
        let maximumTargetLengthM = 0;
        let maximumTargetErrorM = 0;
        for (
          let rank = stage.priorActiveConstraintCount;
          rank < stage.activeConstraintCount;
          rank++
        ) {
          const offset = schedule.activationOrder[rank];
          const target = targets[offset];
          if (!Number.isFinite(target) || target < 0 || target >= 1e30)
            throw new RangeError('Invalid active embedded seam target.');
          const { distanceM } = measureSupport(positions, schedule.grouped[offset].supports);
          sumSquaredGapM2 += distanceM * distanceM;
          maximumGapM = Math.max(maximumGapM, distanceM);
          maximumTargetLengthM = Math.max(maximumTargetLengthM, target);
          maximumTargetErrorM = Math.max(maximumTargetErrorM, Math.abs(distanceM - target));
        }
        const constraintCount = stage.activeConstraintCount - stage.priorActiveConstraintCount;
        return {
          operationOrder: stage.operationOrder,
          constraintCount,
          rmsGapM: Math.sqrt(sumSquaredGapM2 / constraintCount),
          maximumGapM,
          maximumTargetLengthM,
          maximumTargetErrorM,
        };
      });
    },
    project(input: EmbeddedSeamStageIntentV1) {
      const stage = stages.find(({ operationOrder }) => operationOrder === input.operationOrder);
      const isActivation = input.action === 'activate';
      const revisitActive = input.action === 'contract-active';
      if (!stage || (!isActivation && !revisitActive && input.action !== 'contract'))
        throw new RangeError('Expected an ordered embedded seam operation and stage action.');
      if (revisitActive && stage.activeConstraintCount !== totalConstraintCount)
        throw new RangeError(
          'The whole set of seams must be active before an assembly contraction.',
        );
      const activeBefore = isActivation
        ? stage.priorActiveConstraintCount
        : stage.activeConstraintCount;
      if (input.priorActiveConstraintCount !== activeBefore)
        throw new RangeError('Earlier active support rows do not match the stage boundary.');
      const { requestedReductionM, maximumReductionM } = input;
      if (
        !Number.isFinite(maximumReductionM) ||
        !Number.isFinite(requestedReductionM) ||
        requestedReductionM < 0 ||
        maximumReductionM < requestedReductionM ||
        Object.is(requestedReductionM, -0) ||
        Object.is(maximumReductionM, -0)
      )
        throw new RangeError('Expected finite nonnegative seam contraction limits.');

      const positions = snapshotFrame(input.currentPositionsMInvMass, particleCount * 4);
      const targetLengthsM = snapshotFrame(input.priorTargetLengthsM, totalConstraintCount);
      for (const [i, value] of positions.entries()) {
        if (!Number.isFinite(value) || Math.abs(value) >= 1e30 || (i % 4 === 3 && value < 0))
          throw new RangeError('Invalid embedded seam frame coordinates or inverse mass.');
      }
      for (const [offset, prior] of targetLengthsM.entries()) {
        if (
          !Number.isFinite(prior) ||
          prior < 0 ||
          prior >= 1e30 ||
          Object.is(prior, -0) ||
          (activationRanks[offset] >= activeBefore && prior !== 0)
        )
          throw new RangeError('Only the previous active prefix may carry nonnegative targets.');
      }
      const stepS = Math.fround(input.dtS);
      const stepSquaredS2 = Math.fround(stepS * stepS);
      const compliance = Math.fround(input.seamComplianceMPerN);
      const alpha = Math.fround(compliance / stepSquaredS2);
      if (
        !(stepS > 0 && stepS < 1e30) ||
        !(stepSquaredS2 >= 2 ** -126 && Number.isFinite(stepSquaredS2)) ||
        !(compliance >= 0 && compliance < 1e30) ||
        !(alpha >= 0 && alpha < 1e30)
      )
        throw new RangeError(
          'The embedded seam compliance or time step exceeds the shader domain.',
        );

      const firstTargetRank = revisitActive ? 0 : stage.priorActiveConstraintCount;
      const currentGapM = new Float64Array(stage.activeConstraintCount - firstTargetRank);
      const rounded = new Float32Array(1);
      const roundedBits = new Uint32Array(rounded.buffer);
      let maximumAppliedReductionM = 0;
      for (let rank = 0; rank < stage.activeConstraintCount; rank++) {
        const offset = schedule.activationOrder[rank];
        const { distanceM, effectiveInverseMass } = measureSupport(
          positions,
          schedule.grouped[offset].supports,
        );
        const roundedMass = Math.fround(effectiveInverseMass);
        const denominator = Math.fround(roundedMass + alpha);
        if (
          effectiveInverseMass > 0 &&
          !(
            roundedMass >= 2 ** -126 &&
            roundedMass < 1e30 &&
            denominator > 1e-12 &&
            denominator < 1e30
          )
        )
          throw new RangeError(
            'The embedded seam inverse mass and compliance exceed the shader domain.',
          );
        if (rank < firstTargetRank) continue;
        currentGapM[rank - firstTargetRank] = distanceM;
        rounded[0] = Math.max(0, distanceM - requestedReductionM);
        // Round the target upward when a nearer f32 would exceed the requested contraction.
        if (distanceM - rounded[0] > requestedReductionM) roundedBits[0]++;
        const prior = targetLengthsM[offset];
        // A seam that stayed under tension keeps its previous target. This pass budgets new
        // contraction from the accepted frame without relaxing any of the active stitches.
        if (revisitActive && rounded[0] >= prior) continue;
        const next = isActivation ? rounded[0] : Math.min(prior, rounded[0]);
        const applied = Math.max(0, distanceM - next);
        if (
          next >= 1e30 ||
          applied > maximumReductionM ||
          (applied > 0 && (effectiveInverseMass === 0 || effectiveInverseMass >= 1e30))
        )
          throw new RangeError('The embedded seam cannot contract within this frame budget.');
        maximumAppliedReductionM = Math.max(maximumAppliedReductionM, applied);
        targetLengthsM[offset] = next;
      }

      const activationParams = packXpbdSeamSolveActivationParamsV1({
        totalConstraintCount,
        activeConstraintCount: stage.activeConstraintCount,
        complianceMPerN: input.seamComplianceMPerN,
        dtS: input.dtS,
      });
      const colors = [];
      for (let i = 0; i < schedule.colorRanges.length; i += 2) {
        const offset = schedule.colorRanges[i];
        const count = schedule.colorRanges[i + 1];
        let activeRows = 0;
        for (let row = offset; row < offset + count; row++) {
          if (activationRanks[row] < stage.activeConstraintCount) activeRows++;
        }
        if (activeRows === 0) continue;
        colors.push({
          offset,
          count,
          activeRows,
          workgroups: Math.ceil(count / XPBD_SEAM_SOLVE_WORKGROUP_SIZE_V1),
          params: packXpbdSeamSolveColorParamsV1(offset, count),
        });
      }
      return {
        stage,
        targetLengthsM,
        zeroLambdasKgM: new Float32Array(totalConstraintCount),
        activationParams,
        currentGapM,
        maximumAppliedReductionM,
        frameDispatch: {
          reset: {
            workgroups: Math.ceil(totalConstraintCount / XPBD_SEAM_SOLVE_WORKGROUP_SIZE_V1),
            params: createXpbdBendResetPacketV1(totalConstraintCount),
          },
          colors,
        },
      };
    },
  });
  frameSources.set(plan, { supportRows, activationRanks });
  return plan;
}
