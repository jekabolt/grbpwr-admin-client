import { describe, expect, it } from 'vitest';
import { withObservedPlacementGarmentSourceV1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-observed-placement-garment-v1.test-fixture';
import {
  buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1,
  projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1,
  disposePatternImportDxfProductSavedAnnularObservedPlacementGarmentV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-annular-observed-placement-garment-v1';
import {
  DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
  validateMeasurementSurfaceSelfIntersectionV1,
} from 'lib/cloth/body/measurement-surface-self-intersection-v1';
import { evaluateBetaSkirtCanonicalMediumConfinedContactPairV2 } from './beta-skirt-canonical-medium-confined-ao-seam-contact-witness-v2';
import { createBetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseV1 } from './beta-skirt-personalized-female-nonconfined-self-carrier-response-v1';
import {
  auditBetaSkirtObserved32StaticCarrierStateV1,
  type BetaSkirtObserved32StaticCarrierStateAuditInputV1,
} from './beta-skirt-observed32-static-carrier-state-audit-v1';

const bytes = (array: Float32Array | Uint32Array) =>
  new Uint8Array(array.buffer, array.byteOffset, array.byteLength).slice();
function inputs(
  initial: Float32Array,
  pins: Uint32Array,
  seams: Uint32Array,
): BetaSkirtObserved32StaticCarrierStateAuditInputV1 {
  return {
    initialPositionsXYZW: initial.slice(),
    rawCurrentPositionsXYZW: initial.slice(),
    rawPreviousPositionsXYZW: initial.slice(),
    candidateCurrentPositionsXYZW: initial.slice(),
    candidatePreviousPositionsXYZW: initial.slice(),
    pinnedVertexIds: pins.slice(),
    seamVertexPairs: seams.slice(),
    epsilonM: 1e-6,
  };
}
// Explicit generic fixed-profile arithmetic fixture, not geometry or runtime authority.
function generic() {
  const initial = new Float32Array(580 * 4);
  for (let i = 0; i < 580; i++) initial[i * 4 + 3] = i < 82 ? 0 : 1;
  return inputs(
    initial,
    Uint32Array.from({ length: 82 }, (_, i) => i),
    Uint32Array.from({ length: 68 }, (_, i) => i + 82),
  );
}

describe('observed32 static carrier state audit', () => {
  it('accepts exact state copies from the genuine DXF/AO/D0/V3/normalized-V5 garment chain', async () => {
    // Only the existing persisted transport/host triangle are fixtures; all garment producers run.
    await withObservedPlacementGarmentSourceV1(async ({ request }) => {
      const built =
        await buildPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(request);
      if (!built.ok) throw new Error(built.detail);
      try {
        const projected =
          await projectPatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(built.owner);
        if (!projected?.normalizedMaterial)
          throw new Error('Expected genuine normalized V5 projection.');
        const data = projected.normalizedMaterial;
        const source = inputs(
          data.initialPhysicalPositionsInvMassKg,
          data.pinnedWaistVertexIndices,
          data.seamPairs,
        );
        const before = Object.values(source)
          .filter((v): v is Float32Array | Uint32Array => ArrayBuffer.isView(v))
          .map(bytes);
        const report = auditBetaSkirtObserved32StaticCarrierStateV1(source);
        expect(report.passed).toBe(true);
        expect(report.profile).toEqual({
          vertexCount: 580,
          pinnedVertexCount: 82,
          freeVertexCount: 498,
          seamPairCount: 34,
        });
        expect(report.metrics.correctedVertexCountUnion).toBe(0);
        expect(report.claims.runtimeAuthority).toBe(false);
        expect(
          Object.values(source)
            .filter((v): v is Float32Array | Uint32Array => ArrayBuffer.isView(v))
            .map(bytes),
        ).toEqual(before);
      } finally {
        disposePatternImportDxfProductSavedAnnularObservedPlacementGarmentV1(built.owner);
      }
    });
  }, 120_000);

  it('audits a real D419 correction from computed contact witnesses, without forging an owner or acceptance report', async () => {
    const source = generic();
    // Synthetic near-endpoint contact geometry exercises the real oracle/witness/D419 utilities.
    // It is not a real body, authored garment trajectory, or positive runtime qualification.
    const points: readonly [number, number, number, number][] = [
      [82, 0, 0, 0],
      [83, -0.5e-6, 0.5e-6, 0],
      [150, 1, 0, 0],
      [151, 0, 1, 0],
      [152, -1, -1, 0],
      [153, 1, -0.25, 0],
    ];
    for (const [vertex, x, y, z] of points) {
      source.rawCurrentPositionsXYZW.set([x, y, z], vertex * 4);
      source.rawPreviousPositionsXYZW.set([x, y, z], vertex * 4);
    }
    source.rawPreviousPositionsXYZW[82 * 4] = Math.fround(-0.001);
    source.rawPreviousPositionsXYZW[83 * 4] = Math.fround(0.002);
    const positions = new Float32Array(580 * 3);
    for (let i = 0; i < 580; i++)
      for (let axis = 0; axis < 3; axis++)
        positions[i * 3 + axis] = source.rawCurrentPositionsXYZW[i * 4 + axis]!;
    const triangles = new Uint32Array([82, 150, 151, 83, 152, 153]);
    const oracle = validateMeasurementSurfaceSelfIntersectionV1(positions, triangles, {
      ...DEFAULT_MEASUREMENT_SURFACE_SELF_INTERSECTION_POLICY_V1,
      absoluteEpsilonM: source.epsilonM,
    });
    expect(oracle.intersections).toHaveLength(1);
    expect(oracle.intersections[0]!.kind).toBe('touching');
    const witness = await evaluateBetaSkirtCanonicalMediumConfinedContactPairV2({
      positions,
      triangles,
      seamPairs: source.seamVertexPairs,
      pair: oracle.intersections[0]!,
      epsilonM: oracle.epsilonM,
      vertexCount: 580,
      requireCanonicalSeamCount: true,
    });
    expect(witness.disposition).toBe('residual-touching-non-confined-feature');
    expect(
      witness.features.some(
        (feature) => feature.nonConfinedRelation === 'non-seam-contact-feature',
      ),
    ).toBe(false);
    const response = await createBetaSkirtPersonalizedFemaleNonconfinedSelfCarrierResponseV1({
      currentPositionsInvMass: source.rawCurrentPositionsXYZW,
      previousPositionsInvMass: source.rawPreviousPositionsXYZW,
      activeSeamPairs: source.seamVertexPairs,
      fixedHandleVertexIndices: source.pinnedVertexIds,
      epsilonM: source.epsilonM,
      residualWitnesses: [witness],
    });
    const report = auditBetaSkirtObserved32StaticCarrierStateV1({
      ...source,
      candidateCurrentPositionsXYZW: response.candidatePositionsInvMass,
      candidatePreviousPositionsXYZW: response.candidatePreviousPositionsInvMass,
    });
    expect(report.passed).toBe(true);
    expect(report.metrics.correctedCurrentVertexCount).toBe(
      response.report.response.correctedVertexCount,
    );
    expect(report.metrics.maxCurrentCorrectionM).toBe(response.report.response.maximumCorrectionM);
    expect(report.metrics.maxCurrentPreviousDeltaDriftM).toBe(
      response.report.response.maximumVelocityDeltaDriftM,
    );
    expect(report.metrics.maxCurrentPreviousDeltaDriftM).toBeGreaterThan(0);
    expect(report.metrics.correctedVertexCountUnion).toBeGreaterThan(0);
    expect(report.claims.velocityStatePreservationEstablished).toBe(false);
    expect(report.claims.continuationQualified).toBe(false);
  });

  it.each([
    'rawCurrentPositionsXYZW',
    'rawPreviousPositionsXYZW',
    'candidateCurrentPositionsXYZW',
    'candidatePreviousPositionsXYZW',
  ] as const)('rejects changed W bytes in %s, including signed zero', (field) => {
    const source = generic();
    source[field][3] = -0;
    const report = auditBetaSkirtObserved32StaticCarrierStateV1(source);
    expect(report.passed).toBe(false);
    expect(report.checks.allInverseMassBytesExact).toBe(false);
    expect(report.metrics.zeroInverseMassVertexCount).toBe(82);
  });
  it.each([
    'rawCurrentPositionsXYZW',
    'rawPreviousPositionsXYZW',
    'candidateCurrentPositionsXYZW',
    'candidatePreviousPositionsXYZW',
  ] as const)('rejects pinned XYZ drift in %s even below epsilon', (field) => {
    const source = generic();
    source[field][0] = Math.fround(1e-9);
    const report = auditBetaSkirtObserved32StaticCarrierStateV1(source);
    expect(report.passed).toBe(false);
    expect(report.checks.bothPinnedStatePositionBytesExact).toBe(false);
  });
  it('requires the exact zero-W membership, not just 82 arbitrary pin IDs', () => {
    const source = generic();
    source.pinnedVertexIds[81] = 579;
    const report = auditBetaSkirtObserved32StaticCarrierStateV1(source);
    expect(report.checks.fixedMassAndPinProfile).toBe(false);
    expect(report.metrics.pinZeroMembershipMismatchCount).toBe(2);
  });
  it('does not expand a zero raw seam gap by epsilon', () => {
    const source = generic();
    source.candidateCurrentPositionsXYZW[82 * 4] = Math.fround(1e-9);
    const report = auditBetaSkirtObserved32StaticCarrierStateV1(source);
    expect(report.checks.bothStateCorrectionsWithinEpsilon).toBe(true);
    expect(report.checks.currentSeamGapDidNotRegress).toBe(false);
  });
  it('bounds actual f32 previous-state correction separately and measures delta drift without granting velocity authority', () => {
    const source = generic();
    source.candidatePreviousPositionsXYZW[200 * 4] = Math.fround(source.epsilonM * 1.01);
    const report = auditBetaSkirtObserved32StaticCarrierStateV1(source);
    expect(report.checks.bothStateCorrectionsWithinEpsilon).toBe(false);
    expect(report.metrics.correctedCurrentVertexCount).toBe(0);
    expect(report.metrics.correctedPreviousVertexCount).toBe(1);
    expect(report.metrics.correctedVertexCountUnion).toBe(1);
    expect(report.metrics.maxCurrentPreviousDeltaDriftM).toBe(
      source.candidatePreviousPositionsXYZW[800],
    );
  });
  it('accepts the exact correction boundary and blocks the next representable f32 value', () => {
    const source = generic();
    const epsilonM = Math.fround(1e-6);
    source.candidateCurrentPositionsXYZW[800] = epsilonM;
    expect(auditBetaSkirtObserved32StaticCarrierStateV1({ ...source, epsilonM }).passed).toBe(true);
    new Uint32Array(source.candidateCurrentPositionsXYZW.buffer)[800]!++;
    expect(
      auditBetaSkirtObserved32StaticCarrierStateV1({ ...source, epsilonM }).checks
        .bothStateCorrectionsWithinEpsilon,
    ).toBe(false);
  });
  it('rejects malformed counts, duplicate IDs, non-finite state and overlapping raw state views', () => {
    const source = generic();
    expect(() =>
      auditBetaSkirtObserved32StaticCarrierStateV1({
        ...source,
        pinnedVertexIds: new Uint32Array(81),
      }),
    ).toThrow();
    const duplicatePins = source.pinnedVertexIds.slice();
    duplicatePins[1] = duplicatePins[0]!;
    expect(() =>
      auditBetaSkirtObserved32StaticCarrierStateV1({ ...source, pinnedVertexIds: duplicatePins }),
    ).toThrow();
    const duplicateSeams = source.seamVertexPairs.slice();
    duplicateSeams[1] = duplicateSeams[0]!;
    expect(() =>
      auditBetaSkirtObserved32StaticCarrierStateV1({ ...source, seamVertexPairs: duplicateSeams }),
    ).toThrow();
    expect(() =>
      auditBetaSkirtObserved32StaticCarrierStateV1({
        ...source,
        rawPreviousPositionsXYZW: source.rawCurrentPositionsXYZW,
      }),
    ).toThrow(/distinct memory/);
    source.candidatePreviousPositionsXYZW[800] = NaN;
    expect(() => auditBetaSkirtObserved32StaticCarrierStateV1(source)).toThrow(/finite/);
  });
  it('accepts disjoint offset views while rejecting concurrent shared-buffer inputs', () => {
    const source = generic();
    const storage = new Float32Array(580 * 8 + 8);
    const current = storage.subarray(4, 580 * 4 + 4);
    const previous = storage.subarray(580 * 4 + 4, 580 * 8 + 4);
    current.set(source.rawCurrentPositionsXYZW);
    previous.set(source.rawPreviousPositionsXYZW);
    expect(
      auditBetaSkirtObserved32StaticCarrierStateV1({
        ...source,
        rawCurrentPositionsXYZW: current,
        rawPreviousPositionsXYZW: previous,
      }).passed,
    ).toBe(true);
    const shared = new Float32Array(new SharedArrayBuffer(580 * 4 * 4));
    shared.set(source.rawCurrentPositionsXYZW);
    expect(() =>
      auditBetaSkirtObserved32StaticCarrierStateV1({ ...source, rawCurrentPositionsXYZW: shared }),
    ).toThrow();
  });

  it('uses native typed-array snapshots without invoking hostile getters/iterators and exposes no input aliases', () => {
    const source = generic();
    let calls = 0;
    for (const key of ['length', 'byteOffset', 'byteLength', 'buffer', 'constructor'])
      Object.defineProperty(source.rawCurrentPositionsXYZW, key, {
        get() {
          calls++;
          throw new Error('host getter');
        },
      });
    Object.defineProperty(source.rawCurrentPositionsXYZW, Symbol.iterator, {
      value() {
        calls++;
        throw new Error('host iterator');
      },
    });
    const report = auditBetaSkirtObserved32StaticCarrierStateV1(source);
    expect(report.passed).toBe(true);
    expect(calls).toBe(0);
    source.candidateCurrentPositionsXYZW.fill(99);
    expect(report.metrics.maxCorrectionM).toBe(0);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.metrics)).toBe(true);
    expect(Object.isFrozen(report.exactState.rawCurrentVsInitial)).toBe(true);
    const accessor = { ...generic() };
    Object.defineProperty(accessor, 'epsilonM', {
      get() {
        calls++;
        return 1e-6;
      },
    });
    expect(() => auditBetaSkirtObserved32StaticCarrierStateV1(accessor)).toThrow(/data fields/);
    expect(calls).toBe(0);
  });
});
