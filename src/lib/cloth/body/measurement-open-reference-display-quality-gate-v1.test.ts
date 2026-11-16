import { describe, expect, it } from 'vitest';

import {
  evaluateMeasurementOpenReferenceDisplayQualityV1,
  evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1,
  evaluateMeasurementOpenReferenceSelfIntersectionDeltaV1,
} from './measurement-open-reference-display-quality-gate-v1';
import { DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1 } from './measurement-surface-self-intersection-v1';

const UNIFORM = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const TRIANGLE = Uint16Array.from([0, 1, 2]);

function twoTriangles(first: readonly number[], second: readonly number[]) {
  return {
    positions: Float32Array.from([...first, ...second]),
    indices: Uint32Array.from([0, 1, 2, 3, 4, 5]),
  };
}

describe('measurement open-reference display quality gate v1', () => {
  it('keeps the local-only evaluator deterministic and explicitly unevaluated', () => {
    const first = evaluateMeasurementOpenReferenceDisplayQualityV1({
      uniformPositionsM: UNIFORM,
      personalizedPositionsM: UNIFORM.slice(),
      triangleIndices: TRIANGLE,
    });
    const second = evaluateMeasurementOpenReferenceDisplayQualityV1({
      uniformPositionsM: UNIFORM,
      personalizedPositionsM: UNIFORM.slice(),
      triangleIndices: TRIANGLE,
    });

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      safe: true,
      reasons: [],
      claims: { localGeometryQualityOnly: true, selfIntersectionEvaluated: false },
    });
  });

  it('marks a safe whole-body candidate evaluated without fit or collision claims', () => {
    const result = evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1({
      uniformPositionsM: UNIFORM,
      personalizedPositionsM: UNIFORM.slice(),
      triangleIndices: TRIANGLE,
    });

    expect(result).toMatchObject({ safe: true, reasons: [] });
    expect(result.claims).toEqual({
      localGeometryQualityOnly: false,
      selfIntersectionEvaluated: true,
      anatomicalAccuracyClaimed: false,
      fitClaimEligible: false,
      runtimeCollisionEligible: false,
    });
  });

  it('rejects a new whole-body pair when every local triangle metric is unchanged', () => {
    const admitted = twoTriangles([-2, -2, 0, 2, -2, 0, 0, 2, 0], [3, -1, -1, 3, 1, -1, 3, 0, 1]);
    const candidate = twoTriangles([-2, -2, 0, 2, -2, 0, 0, 2, 0], [0, -1, -1, 0, 1, -1, 0, 0, 1]);
    expect(
      evaluateMeasurementOpenReferenceDisplayQualityV1({
        uniformPositionsM: admitted.positions,
        personalizedPositionsM: candidate.positions,
        triangleIndices: admitted.indices,
      }).safe,
    ).toBe(true);
    const result = evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1({
      uniformPositionsM: admitted.positions,
      personalizedPositionsM: candidate.positions,
      triangleIndices: admitted.indices,
    });

    expect(result).toMatchObject({ safe: false, reasons: ['new-self-intersection'] });
    expect(result.claims.selfIntersectionEvaluated).toBe(true);
  });

  it.each([
    ['touching', twoTriangles([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 0, 0, 1, 0, 0, 0, -1, 0])],
    ['coplanar-overlap', twoTriangles([0, 0, 0, 2, 0, 0, 0, 2, 0], [0, 0, 0, 2, 0, 0, 0, 2, 0])],
  ] as const)('admits an inherited basis %s pair', (_, mesh) => {
    const delta = evaluateMeasurementOpenReferenceSelfIntersectionDeltaV1({
      admittedBasisPositionsM: mesh.positions,
      candidatePositionsM: mesh.positions.slice(),
      triangleIndices: mesh.indices,
    });

    expect(delta).toMatchObject({
      safe: true,
      admittedBasisIntersectionCount: 1,
      candidateIntersectionCount: 1,
      admittedInheritedPairCount: 1,
      newPairCount: 0,
      escalatedToProperCrossingCount: 0,
    });
  });

  it('still rejects a shared-edge pair that folds into coplanar overlap', () => {
    const indices = Uint32Array.from([0, 1, 2, 1, 0, 3]);
    const admitted = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, -1, 0]);
    const folded = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0.5, 0]);

    expect(
      evaluateMeasurementOpenReferenceSelfIntersectionDeltaV1({
        admittedBasisPositionsM: admitted,
        candidatePositionsM: folded,
        triangleIndices: indices,
      }),
    ).toMatchObject({ safe: false, newPairCount: 1 });
  });

  it('still rejects a shared-vertex pair that crosses away from its admitted vertex', () => {
    const indices = Uint32Array.from([0, 1, 2, 0, 3, 4]);
    const admitted = Float32Array.from([0, 0, 0, 2, 0, 0, 0, 2, 0, 1, -1, -1, 1, -1, 1]);
    const crossed = Float32Array.from([0, 0, 0, 2, 0, 0, 0, 2, 0, 1, 1, -1, 1, 1, 1]);

    expect(
      evaluateMeasurementOpenReferenceSelfIntersectionDeltaV1({
        admittedBasisPositionsM: admitted,
        candidatePositionsM: crossed,
        triangleIndices: indices,
      }),
    ).toMatchObject({ safe: false, newPairCount: 1 });
  });

  it('binds the revision cache to normalized basis geometry as well as topology', () => {
    const separated = twoTriangles([0, 0, 0, 2, 0, 0, 0, 2, 0], [0, 0, 1, 2, 0, 1, 0, 2, 1]);
    const overlapping = twoTriangles([0, 0, 0, 2, 0, 0, 0, 2, 0], [0, 0, 0, 2, 0, 0, 0, 2, 0]);
    const first = evaluateMeasurementOpenReferenceSelfIntersectionDeltaV1({
      admittedBasisPositionsM: separated.positions,
      candidatePositionsM: separated.positions.slice(),
      triangleIndices: separated.indices,
      admittedBasisRevision: 'same-revision',
    });
    const second = evaluateMeasurementOpenReferenceSelfIntersectionDeltaV1({
      admittedBasisPositionsM: overlapping.positions,
      candidatePositionsM: overlapping.positions.slice(),
      triangleIndices: overlapping.indices,
      admittedBasisRevision: 'same-revision',
    });

    expect(first.admittedBasisIntersectionCount).toBe(0);
    expect(second).toMatchObject({
      safe: true,
      admittedBasisIntersectionCount: 1,
      admittedInheritedPairCount: 1,
    });
  });

  it('fails closed at the explicit whole-body work budget', () => {
    const mesh = twoTriangles([0, 0, 0, 2, 0, 0, 0, 2, 0], [0, 0, 1, 2, 0, 1, 0, 2, 1]);
    const result = evaluateMeasurementOpenReferenceDisplayQualityWithSelfIntersectionV1({
      uniformPositionsM: mesh.positions,
      personalizedPositionsM: mesh.positions.slice(),
      triangleIndices: mesh.indices,
      selfIntersectionPolicy: {
        ...DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
        maxTriangles: 1,
      },
    });

    expect(result).toMatchObject({
      safe: false,
      reasons: ['self-intersection-evaluation-failed'],
      claims: { selfIntersectionEvaluated: false },
    });
  });
});
