import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import {
  MAKEHUMAN_CORE_RIG_BUNDLE_METADATA_V1,
  MAKEHUMAN_CORE_RIG_POSE_PRESETS_V1,
  parseMakeHumanCoreRigBundleV1,
  poseMakeHumanCoreRigPositionsWithRestHeadsResearchV1,
  type MakeHumanCoreRigBasisKindV1,
} from './makehuman-core-rig-pose-research-v1';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
  type MakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import { validateMeasurementSurfaceSelfIntersectionV1 } from './measurement-surface-self-intersection-v1';
import {
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_MODE_IDS_V1,
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1,
  parseMakeHuman2PoseCompatibleLengthPackV1,
} from './makehuman2-pose-compatible-length-pack-v1';
import {
  applyMakeHuman2PoseCompatibleLengthModesResearchV1,
  createMakeHuman2ArmLengthProxyRuntimeResearchV1,
  poseMakeHuman2PoseCompatibleLengthResultResearchV1,
  type MakeHuman2PoseCompatibleLengthJointResultV1,
} from './makehuman2-pose-compatible-length-runtime-v1';

const KINDS = Object.freeze([
  'base',
  'neutral',
  'male',
  'female',
] as const satisfies readonly MakeHumanCoreRigBasisKindV1[]);

const rigBundle = parseMakeHumanCoreRigBundleV1(
  readFileSync(resolve(process.cwd(), MAKEHUMAN_CORE_RIG_BUNDLE_METADATA_V1.assetPath)),
);
const pack = parseMakeHuman2PoseCompatibleLengthPackV1(
  readFileSync(
    resolve(process.cwd(), MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.assetPath),
  ),
);

function basis(kind: MakeHumanCoreRigBasisKindV1): MakeHumanOpenReferenceBasisV1 {
  return parseMakeHumanOpenReferenceBasisV1(
    readFileSync(
      resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
    ),
    kind,
  );
}

function point(
  joints: readonly MakeHuman2PoseCompatibleLengthJointResultV1[],
  key: string,
): readonly [number, number, number] {
  const result = joints.find((candidate) => candidate.key === key);
  if (!result) throw new Error(`Missing ${key}.`);
  return result.positionSourceUnits;
}

function distance(left: readonly number[], right: readonly number[]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function armCenterlineSourceUnits(
  joints: readonly MakeHuman2PoseCompatibleLengthJointResultV1[],
): number {
  return (
    ['L', 'R'].reduce((sum, side) => {
      const shoulder = point(joints, `upperarm01.${side}____head`);
      const elbow = point(joints, `lowerarm01.${side}____head`);
      const wrist = point(joints, `wrist.${side}____head`);
      return sum + distance(shoulder, elbow) + distance(elbow, wrist);
    }, 0) / 2
  );
}

function maximumPositionDelta(left: Float32Array, right: Float32Array): number {
  let maximum = 0;
  for (let offset = 0; offset < left.length; offset += 3) {
    maximum = Math.max(
      maximum,
      Math.hypot(
        left[offset] - right[offset],
        left[offset + 1] - right[offset + 1],
        left[offset + 2] - right[offset + 2],
      ),
    );
  }
  return maximum;
}

function positionsM(positionsSourceUnits: Float32Array): Float32Array {
  return Float32Array.from(positionsSourceUnits, (value) => value * 0.1);
}

describe('MakeHuman2 pose-compatible length runtime v1', () => {
  it.each(KINDS)(
    '%s composes every exact length direction with the repaired basis without flips',
    (kind) => {
      const selectedBasis = basis(kind);
      for (const modeId of MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_MODE_IDS_V1) {
        const result = applyMakeHuman2PoseCompatibleLengthModesResearchV1({
          basis: selectedBasis,
          rigBundle,
          pack,
          modeCoefficients: { [modeId]: 0.5 },
        });
        expect(result.positionsSourceUnits).toHaveLength(selectedBasis.positionsSourceUnits.length);
        expect(result.joints).toHaveLength(28);
        expect(result.maximumRecomputedJointDeltaSourceUnits).toBeGreaterThan(0);
        expect(result.maximumVisibleOnlyStalePivotDriftSourceUnits).toBeGreaterThan(0);
        expect(result.qualityGate.metrics.flippedTriangleCount).toBe(0);
        expect(result.qualityGate.safe).toBe(true);
        expect(result.representation).toMatchObject({
          sourceLengthModes: { status: 'exact' },
          armLengthMm: { status: 'limited' },
          inseamMm: { status: 'unrepresented' },
        });
      }
    },
    60_000,
  );

  it('reproduces the eight helper-omission stale-pivot drift regressions', () => {
    const selectedBasis = basis('base');
    const expectedDriftMm = [
      48.507525, 69.720729, 45.165141, 65.943461, 75.011266, 106.885453, 59, 81.154174,
    ];
    MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_MODE_IDS_V1.forEach((modeId, index) => {
      const result = applyMakeHuman2PoseCompatibleLengthModesResearchV1({
        basis: selectedBasis,
        rigBundle,
        pack,
        modeCoefficients: { [modeId]: 1 },
      });
      expect(result.maximumVisibleOnlyStalePivotDriftSourceUnits * 100).toBeCloseTo(
        expectedDriftMm[index],
        4,
      );
    });
  });

  it.each(KINDS)(
    '%s reaches a changed bounded arm centerline while preserving limited semantics',
    (kind) => {
      const selectedBasis = basis(kind);
      const baseline = applyMakeHuman2PoseCompatibleLengthModesResearchV1({
        basis: selectedBasis,
        rigBundle,
        pack,
      });
      const heightMm = 1_720;
      const metricScaleMPerSourceUnit =
        heightMm / 1000 / (selectedBasis.sourceMaximumY - selectedBasis.sourceMinimumY);
      const baselineMm =
        armCenterlineSourceUnits(baseline.joints) * metricScaleMPerSourceUnit * 1000;
      const result = createMakeHuman2ArmLengthProxyRuntimeResearchV1({
        basis: selectedBasis,
        rigBundle,
        pack,
        armLengthMm: baselineMm + 5,
        heightMm,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.achievedCenterlineProxyMm).toBeCloseTo(baselineMm + 5, 2);
      expect(
        maximumPositionDelta(
          result.runtime.positionsSourceUnits,
          selectedBasis.positionsSourceUnits,
        ),
      ).toBeGreaterThan(0);
      expect(result.runtime.maximumRecomputedJointDeltaSourceUnits).toBeGreaterThan(0);
      expect(result.representation.armLengthMm.status).toBe('limited');
      expect(result.representation.inseamMm.status).toBe('unrepresented');
      expect(result.runtime.claims.canonicalMeasurementSemanticMatchClaimed).toBe(false);
    },
    60_000,
  );

  it.each(KINDS)(
    '%s poses only after installing recomputed length-scaled joint heads',
    (kind) => {
      const selectedBasis = basis(kind);
      const runtime = applyMakeHuman2PoseCompatibleLengthModesResearchV1({
        basis: selectedBasis,
        rigBundle,
        pack,
        modeCoefficients: {
          'upperArmLength:increase': 0.5,
          'lowerArmLength:increase': 0.5,
        },
      });
      const preset = MAKEHUMAN_CORE_RIG_POSE_PRESETS_V1.find(
        ({ id }) => id === 'relaxed-symmetric',
      )!;
      const coherent = poseMakeHuman2PoseCompatibleLengthResultResearchV1({
        runtime,
        rigBundle,
        preset,
      });
      const rigBasis = rigBundle.bases.find((candidate) => candidate.kind === kind)!;
      const stale = poseMakeHumanCoreRigPositionsWithRestHeadsResearchV1({
        bundle: rigBundle,
        positions: runtime.positionsSourceUnits,
        restHeads: rigBasis.headsSourceUnits,
        preset,
      });
      expect(coherent.maximumJointPivotResidualSourceUnits).toBeLessThan(1e-6);
      expect(coherent.positionsSourceUnits.every(Number.isFinite)).toBe(true);
      expect(
        maximumPositionDelta(coherent.positionsSourceUnits, runtime.positionsSourceUnits),
      ).toBeGreaterThan(0.01);
      expect(maximumPositionDelta(coherent.positionsSourceUnits, stale.positions)).toBeGreaterThan(
        0.001,
      );
    },
    60_000,
  );

  it.each(KINDS)(
    '%s creates no new whole-body self-intersection pairs at the bounded arm sample',
    (kind) => {
      const selectedBasis = basis(kind);
      const result = applyMakeHuman2PoseCompatibleLengthModesResearchV1({
        basis: selectedBasis,
        rigBundle,
        pack,
        modeCoefficients: {
          'upperArmLength:increase': 0.25,
          'lowerArmLength:increase': 0.25,
        },
      });
      const baseline = validateMeasurementSurfaceSelfIntersectionV1(
        positionsM(selectedBasis.positionsSourceUnits),
        Uint32Array.from(selectedBasis.indices),
      );
      const deformed = validateMeasurementSurfaceSelfIntersectionV1(
        positionsM(result.positionsSourceUnits),
        Uint32Array.from(selectedBasis.indices),
      );
      expect(deformed.intersectionCount).toBe(baseline.intersectionCount);
    },
    120_000,
  );
});
