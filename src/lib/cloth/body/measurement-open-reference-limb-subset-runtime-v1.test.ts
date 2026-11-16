import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it, vi } from 'vitest';

import { parseMakeHumanLimbCircumferenceDeltaBundleV1 } from './makehuman-limb-circumference-delta-bundle-v1';
import { createMakeHumanLimbCircumferenceUniformModesV1 } from './makehuman-limb-circumference-uniform-modes-v1';
import { createMakeHumanUniformWaistHipModesV1 } from './makehuman-uniform-waist-hip-modes-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import { createMeasurementBodyFrameV2 } from './measurement-body-frame-v2';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from './measurement-body-synthetic-corpus';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
  type MakeHumanOpenReferenceBasisKindV1,
} from './measurement-open-reference-display-v1';
import { deriveOpenReferenceLimbSectionStationsV1 } from './measurement-open-reference-limb-section-station-v1';
import { createLocalizedThighResearchModeV1 } from './measurement-open-reference-localized-thigh-research-v1';
import type {
  OpenReferenceLimbCircumferenceModeV1,
  OpenReferenceSparseDeltaFieldV1,
} from './measurement-open-reference-limb-circumference-solver-v1';
import {
  createMeasurementOpenReferenceLimbSubsetRuntimeV1,
  MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_ENVELOPE_V1,
  MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_KEYS_V1,
  type MeasurementOpenReferenceLimbSubsetKeyV1,
} from './measurement-open-reference-limb-subset-runtime-v1';
import { createMeasurementOpenReferenceUniformWaistHipRuntimeV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';
import { validateMeasurementSurfaceSelfIntersectionV1 } from './measurement-surface-self-intersection-v1';

const KINDS = Object.freeze([
  'base',
  'neutral',
  'male',
  'female',
] as const satisfies readonly MakeHumanOpenReferenceBasisKindV1[]);
const limbBundle = parseMakeHumanLimbCircumferenceDeltaBundleV1(
  readFileSync(
    resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-limb-circumference-deltas-v1.bin'),
  ),
);
const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
  readFileSync(resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin')),
);

async function fixture(kind: MakeHumanOpenReferenceBasisKindV1, pose: 'A' | 'T' = 'A') {
  const measurements = CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements;
  const basis = parseMakeHumanOpenReferenceBasisV1(
    readFileSync(
      resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
    ),
    kind,
  );
  const frame = createMeasurementBodyFrameV2({
    measurements,
    sourceRevision: `limb-subset-runtime-test:${kind}:${pose}`,
    pose,
  });
  const openReference = createMeasurementOpenReferenceUniformHeightDisplayV1({ basis, frame });
  const waistHipRuntime = await createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
    basis,
    measurements,
    openReference,
    loadBundle: async () => torsoBundle,
  });
  const limb = createMakeHumanLimbCircumferenceUniformModesV1({
    basis,
    heightMm: measurements.heightMm,
    bundle: limbBundle,
  });
  const torso = createMakeHumanUniformWaistHipModesV1({
    basis,
    heightMm: measurements.heightMm,
    bundle: torsoBundle,
  });
  return { basis, measurements, waistHipRuntime, limb, torso };
}

function addField(
  source: Float32Array,
  field: OpenReferenceSparseDeltaFieldV1,
  coefficient: number,
): Float32Array {
  const result = source.slice();
  field.vertexIndices.forEach((vertex, index) => {
    const positionOffset = vertex * 3;
    const deltaOffset = index * 3;
    result[positionOffset] += field.deltasM[deltaOffset] * coefficient;
    result[positionOffset + 1] += field.deltasM[deltaOffset + 1] * coefficient;
    result[positionOffset + 2] += field.deltasM[deltaOffset + 2] * coefficient;
  });
  return result;
}

function perimeterMm(
  positionsM: Float32Array,
  indices: Uint16Array,
  mode: OpenReferenceLimbCircumferenceModeV1,
  stationBasisM: Float32Array,
): number {
  const stations = deriveOpenReferenceLimbSectionStationsV1({
    positionsM: stationBasisM,
    mode,
  });
  const values = stations.map((station) => {
    const measured = measureMeshPlaneSectionPerimetersV1({
      positionsM,
      triangleIndices: indices,
      planeOriginM: station.originM,
      planeNormal: station.normal,
      selection: { kind: 'nearest-seed', seedM: station.originM },
    });
    if (!measured.ok || !measured.selectedLoop) throw new Error('Limb test section failed.');
    return measured.selectedLoop.perimeterM * 1000;
  });
  return (values[0] + values[1]) / 2;
}

function targetAt(
  current: Awaited<ReturnType<typeof fixture>>,
  key: MeasurementOpenReferenceLimbSubsetKeyV1,
  direction: 'decrease' | 'increase',
  coefficient: number,
): number {
  const rawMode = current.limb.modes.find(({ measurementKey }) => measurementKey === key);
  if (!rawMode) throw new Error(`Missing ${key}.`);
  const positions = current.waistHipRuntime.displayMesh.positions;
  const hipMode = current.torso.modes.find(
    ({ measurementKey }) => measurementKey === 'hipCircumferenceMm',
  );
  if (!hipMode) throw new Error('Missing hip mode.');
  const mode =
    key === 'thighCircumferenceMm'
      ? createLocalizedThighResearchModeV1({
          mode: rawMode,
          positionsM: positions,
          hipStationYM: hipMode.stationOriginM[1],
          fadeDepthM: 0.12,
        }).mode
      : rawMode;
  const baseline = perimeterMm(positions, current.basis.indices, mode, positions);
  const endpoint = perimeterMm(
    addField(positions, direction === 'decrease' ? mode.decrease : mode.increase, 1),
    current.basis.indices,
    mode,
    positions,
  );
  return baseline + (endpoint - baseline) * coefficient;
}

function measurementsAt(
  current: Awaited<ReturnType<typeof fixture>>,
  coefficient = 0.5,
): CanonicalBodyMeasurementsMm {
  return Object.freeze({
    ...current.measurements,
    bicepCircumferenceMm: targetAt(current, 'bicepCircumferenceMm', 'increase', coefficient),
    wristCircumferenceMm: targetAt(current, 'wristCircumferenceMm', 'increase', coefficient),
    thighCircumferenceMm: targetAt(current, 'thighCircumferenceMm', 'increase', coefficient),
    calfCircumferenceMm: targetAt(current, 'calfCircumferenceMm', 'increase', coefficient),
    ankleCircumferenceMm: targetAt(current, 'ankleCircumferenceMm', 'increase', coefficient),
  });
}

const loaders = {
  loadLimbBundle: async () => limbBundle,
  loadTorsoBundle: async () => torsoBundle,
} as const;

describe('measurement open-reference A-pose limb subset runtime v1', () => {
  it.each(KINDS)(
    '%s represents all five localized limb proxies on the repaired basis',
    async (kind) => {
      const current = await fixture(kind);
      const startedAt = performance.now();
      const result = await createMeasurementOpenReferenceLimbSubsetRuntimeV1({
        basis: current.basis,
        measurements: measurementsAt(current),
        waistHipRuntime: current.waistHipRuntime,
        ...loaders,
      });
      const elapsedMs = performance.now() - startedAt;

      console.info(
        `LIMB_SUBSET_RUNTIME_V1=${JSON.stringify({
          basis: kind,
          maximumResidualMm: Number(
            Math.max(0, ...result.modeResults.map(({ residualMm }) => residualMm)).toFixed(4),
          ),
          maximumCrossTalkMm: Number(
            Math.max(
              0,
              ...result.modeResults.flatMap(
                ({ maximumLimbCrossTalkMm, maximumTorsoCrossTalkMm }) => [
                  maximumLimbCrossTalkMm,
                  maximumTorsoCrossTalkMm,
                ],
              ),
            ).toFixed(4),
          ),
          elapsedMs: Number(elapsedMs.toFixed(1)),
        })}`,
      );

      expect(result.status).toBe('represented');
      expect(result.requestedGeometricProxies).toEqual(
        MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_KEYS_V1,
      );
      expect(result.representedGeometricProxies).toEqual(
        MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_KEYS_V1,
      );
      expect(result.limitedGeometricProxies).toEqual([]);
      expect(result.geometricProxyCount).toEqual({
        requested: 5,
        represented: 5,
        limited: 0,
        maximum: 5,
      });
      expect(result.modeResults.every(({ residualMm }) => residualMm <= 0.1)).toBe(true);
      expect(
        result.modeResults.every(
          ({ maximumLimbCrossTalkMm, maximumTorsoCrossTalkMm }) =>
            maximumLimbCrossTalkMm <= 0.1 && maximumTorsoCrossTalkMm <= 0.1,
        ),
      ).toBe(true);
      expect(result.qualityGate?.safe).toBe(true);
      expect(result.compiledContentRevision).toMatch(/^limb-final-closure-snapshot\/v1:/);
      expect(result.waistHipDisplayMesh).not.toBe(current.waistHipRuntime.displayMesh);
      expect(result.waistHipDisplayMesh.positions).not.toBe(
        current.waistHipRuntime.displayMesh.positions,
      );
      expect(result.displayMesh.positions).not.toBe(result.waistHipDisplayMesh.positions);
      expect(result.claims).toMatchObject({
        exactRequiredMeasurementCoverageChanged: false,
        canonicalMeasurementSemanticMatchClaimed: false,
        anatomicalTapePathEquivalent: false,
        populationRepresentativenessClaimed: false,
        realBodyValidationClaimed: false,
        garmentFitClaimed: false,
        fitClaimEligible: false,
        runtimeCollisionEligible: false,
        collisionCandidateEligible: false,
        jointAnchorDeltasAdmitted: false,
      });
    },
    30_000,
  );

  it('returns 0/5 without loading bundles when no optional limb proxy is requested', async () => {
    const current = await fixture('neutral');
    const loadLimbBundle = vi.fn(async () => limbBundle);
    const loadTorsoBundle = vi.fn(async () => torsoBundle);
    const result = await createMeasurementOpenReferenceLimbSubsetRuntimeV1({
      basis: current.basis,
      measurements: current.measurements,
      waistHipRuntime: current.waistHipRuntime,
      loadLimbBundle,
      loadTorsoBundle,
    });

    expect(loadLimbBundle).not.toHaveBeenCalled();
    expect(loadTorsoBundle).not.toHaveBeenCalled();
    expect(result.status).toBe('unrepresented');
    expect(result.geometricProxyCount).toEqual({
      requested: 0,
      represented: 0,
      limited: 0,
      maximum: 5,
    });
    expect(result.requestedGeometricProxies).toEqual([]);
    expect(result.representedGeometricProxies).toEqual([]);
    expect(result.limitedGeometricProxies).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.displayMesh.positions).toEqual(result.waistHipDisplayMesh.positions);
  });

  it('reports exact 1/5 and 2/5 requested/represented counts', async () => {
    const current = await fixture('neutral');
    const allTargets = measurementsAt(current);
    for (const count of [1, 2]) {
      const measurements: {
        -readonly [Key in keyof CanonicalBodyMeasurementsMm]: CanonicalBodyMeasurementsMm[Key];
      } = {
        ...current.measurements,
      };
      for (const key of MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_KEYS_V1.slice(0, count)) {
        measurements[key] = allTargets[key];
      }
      const result = await createMeasurementOpenReferenceLimbSubsetRuntimeV1({
        basis: current.basis,
        measurements: Object.freeze(measurements),
        waistHipRuntime: current.waistHipRuntime,
        ...loaders,
      });
      expect(result.status).toBe('represented');
      expect(result.geometricProxyCount).toEqual({
        requested: count,
        represented: count,
        limited: 0,
        maximum: 5,
      });
      expect(result.requestedGeometricProxies).toEqual(
        MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_KEYS_V1.slice(0, count),
      );
      expect(result.representedGeometricProxies).toEqual(
        MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_KEYS_V1.slice(0, count),
      );
    }
  });

  it.each(KINDS)(
    '%s keeps out-of-envelope thigh requests visible but typed as limited',
    async (kind) => {
      const current = await fixture(kind);
      const rows = [];
      const baselineIntersections = new Set(
        validateMeasurementSurfaceSelfIntersectionV1(
          current.waistHipRuntime.displayMesh.positions,
          Uint32Array.from(current.basis.indices),
        ).intersections.map(
          ({ triangleA, triangleB, kind: intersectionKind }) =>
            `${triangleA}:${triangleB}:${intersectionKind}`,
        ),
      );
      for (const requestedThighMm of [300, 1_000]) {
        const result = await createMeasurementOpenReferenceLimbSubsetRuntimeV1({
          basis: current.basis,
          measurements: Object.freeze({
            ...current.measurements,
            thighCircumferenceMm: requestedThighMm,
          }),
          waistHipRuntime: current.waistHipRuntime,
          ...loaders,
        });
        const thighMode = result.modeResults.find(
          ({ measurementKey }) => measurementKey === 'thighCircumferenceMm',
        );
        if (!thighMode) throw new Error('Limited thigh mode result is missing.');
        const intersections = validateMeasurementSurfaceSelfIntersectionV1(
          result.displayMesh.positions,
          Uint32Array.from(result.displayMesh.indices),
        );
        const newIntersectionCount = intersections.intersections.filter(
          ({ triangleA, triangleB, kind: intersectionKind }) =>
            !baselineIntersections.has(`${triangleA}:${triangleB}:${intersectionKind}`),
        ).length;
        rows.push({
          requestedThighMm,
          appliedEndpointMm: thighMode.targetMm,
          achievedMm: thighMode.achievedMm,
          residualMm: thighMode.residualMm,
          maximumTorsoCrossTalkMm: thighMode.maximumTorsoCrossTalkMm,
          flippedTriangleCount: result.qualityGate?.metrics.flippedTriangleCount,
          newIntersectionCount,
        });

        expect(result.status).toBe('partial');
        expect(result.requestedGeometricProxies).toEqual(['thighCircumferenceMm']);
        expect(result.representedGeometricProxies).toEqual([]);
        expect(result.limitedGeometricProxies).toEqual(['thighCircumferenceMm']);
        expect(result.geometricProxyCount).toEqual({
          requested: 1,
          represented: 0,
          limited: 1,
          maximum: 5,
        });
        expect(result.diagnostics).toContainEqual(
          expect.objectContaining({
            code: 'target-limited',
            measurementKey: 'thighCircumferenceMm',
          }),
        );
        expect(Math.abs(thighMode.targetMm - requestedThighMm)).toBeGreaterThan(100);
        expect(thighMode.residualMm).toBeLessThanOrEqual(0.1);
        expect(thighMode.maximumTorsoCrossTalkMm).toBeLessThanOrEqual(0.1);
        expect(result.qualityGate?.safe).toBe(true);
        expect(result.qualityGate?.metrics.flippedTriangleCount).toBe(0);
        expect(newIntersectionCount).toBe(0);
        expect(result.displayMesh.positions).not.toEqual(result.waistHipDisplayMesh.positions);
      }
      console.info(`LIMB_SUBSET_LIMITED_THIGH_V1=${JSON.stringify({ basis: kind, rows })}`);
    },
    120_000,
  );

  it('fails closed before bundle load for non-A pose and mismatched topology', async () => {
    const nonA = await fixture('female', 'T');
    const valid = await fixture('female');
    const mismatchedIndices = valid.waistHipRuntime.displayMesh.indices.slice();
    mismatchedIndices[0] = mismatchedIndices[0] === 0 ? 1 : 0;
    const cases = [
      {
        current: nonA,
        waistHipRuntime: nonA.waistHipRuntime,
        code: 'pose-not-admitted',
      },
      {
        current: valid,
        waistHipRuntime: Object.freeze({
          ...valid.waistHipRuntime,
          displayMesh: Object.freeze({
            ...valid.waistHipRuntime.displayMesh,
            indices: mismatchedIndices,
          }),
        }),
        code: 'base-mismatch',
      },
    ];

    for (const testCase of cases) {
      const loadLimbBundle = vi.fn(async () => limbBundle);
      const loadTorsoBundle = vi.fn(async () => torsoBundle);
      const result = await createMeasurementOpenReferenceLimbSubsetRuntimeV1({
        basis: testCase.current.basis,
        measurements: Object.freeze({
          ...testCase.current.measurements,
          wristCircumferenceMm: 180,
        }),
        waistHipRuntime: testCase.waistHipRuntime,
        loadLimbBundle,
        loadTorsoBundle,
      });
      expect(loadLimbBundle).not.toHaveBeenCalled();
      expect(loadTorsoBundle).not.toHaveBeenCalled();
      expect(result.status).toBe('error');
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: testCase.code }));
      expect(result.displayMesh.positions).toEqual(result.waistHipDisplayMesh.positions);
    }
  });

  it('rolls a hostile channel back while retaining the other four channels', async () => {
    const current = await fixture('base');
    const measurements = measurementsAt(current);
    const result = await createMeasurementOpenReferenceLimbSubsetRuntimeV1({
      basis: current.basis,
      measurements: Object.freeze({
        ...measurements,
        ankleCircumferenceMm: targetAt(current, 'ankleCircumferenceMm', 'decrease', 0.95),
      }),
      waistHipRuntime: current.waistHipRuntime,
      ...loaders,
    });

    expect(result.status).toBe('partial');
    expect(result.representedGeometricProxies).toEqual([
      'bicepCircumferenceMm',
      'wristCircumferenceMm',
      'thighCircumferenceMm',
      'calfCircumferenceMm',
    ]);
    expect(result.droppedGeometricProxies).toContainEqual({
      measurementKey: 'ankleCircumferenceMm',
      reasons: ['coefficient-envelope-exceeded'],
    });
    expect(result.modeResults.every(({ coefficient }) => coefficient <= 1)).toBe(true);
  }, 30_000);

  it('rolls the whole requested set back when final combined geometry is unsafe', async () => {
    const current = await fixture('male');
    const unsafePositions = current.waistHipRuntime.displayMesh.positions.slice();
    unsafePositions[0] += 10;
    const unsafeWaistHipRuntime = Object.freeze({
      ...current.waistHipRuntime,
      displayMesh: Object.freeze({
        ...current.waistHipRuntime.displayMesh,
        positions: unsafePositions,
      }),
    });
    const result = await createMeasurementOpenReferenceLimbSubsetRuntimeV1({
      basis: current.basis,
      measurements: Object.freeze({
        ...current.measurements,
        wristCircumferenceMm: targetAt(current, 'wristCircumferenceMm', 'increase', 0.5),
      }),
      waistHipRuntime: unsafeWaistHipRuntime,
      ...loaders,
    });

    expect(result.status).toBe('unrepresented');
    expect(result.representedGeometricProxies).toEqual([]);
    expect(result.droppedGeometricProxies).toContainEqual({
      measurementKey: 'wristCircumferenceMm',
      reasons: ['combined-quality-unsafe'],
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'whole-set-quality-rollback' }),
    );
    expect(result.qualityGate?.safe).toBe(false);
    expect(result.displayMesh.positions).toEqual(result.waistHipDisplayMesh.positions);
  }, 30_000);

  it('snapshots inputs before await and isolates later output ownership', async () => {
    const current = await fixture('neutral');
    const measurements = measurementsAt(current);
    let release: ((bundle: typeof limbBundle) => void) | undefined;
    const deferred = new Promise<typeof limbBundle>((resolvePromise) => {
      release = resolvePromise;
    });
    const originalInputPosition = current.waistHipRuntime.displayMesh.positions[0];
    const pending = createMeasurementOpenReferenceLimbSubsetRuntimeV1({
      basis: current.basis,
      measurements,
      waistHipRuntime: current.waistHipRuntime,
      loadLimbBundle: () => deferred,
      loadTorsoBundle: async () => torsoBundle,
    });
    current.waistHipRuntime.displayMesh.positions[0] = originalInputPosition + 20;
    current.basis.positionsSourceUnits[0] += 20;
    release?.(limbBundle);
    const first = await pending;

    const fresh = await fixture('neutral');
    const second = await createMeasurementOpenReferenceLimbSubsetRuntimeV1({
      basis: fresh.basis,
      measurements: measurementsAt(fresh),
      waistHipRuntime: fresh.waistHipRuntime,
      ...loaders,
    });
    expect(first.status).toBe('represented');
    expect(first.displayMesh.positions).toEqual(second.displayMesh.positions);
    expect(first.waistHipDisplayMesh.positions[0]).toBe(originalInputPosition);
    expect(first.displayMesh.positions).not.toBe(second.displayMesh.positions);

    const firstOutputPosition = first.displayMesh.positions[0];
    first.displayMesh.positions[0] += 30;
    expect(second.displayMesh.positions[0]).toBe(firstOutputPosition);
  }, 30_000);

  it('fails closed to the owner-isolated waist/hip display when bundle loading fails', async () => {
    const current = await fixture('base');
    const result = await createMeasurementOpenReferenceLimbSubsetRuntimeV1({
      basis: current.basis,
      measurements: Object.freeze({ ...current.measurements, wristCircumferenceMm: 180 }),
      waistHipRuntime: current.waistHipRuntime,
      loadLimbBundle: async () => {
        throw new Error('test limb bundle unavailable');
      },
      loadTorsoBundle: async () => torsoBundle,
    });

    expect(result.status).toBe('error');
    expect(result.displayMesh.positions).toEqual(result.waistHipDisplayMesh.positions);
    expect(result.displayMesh.positions).not.toBe(result.waistHipDisplayMesh.positions);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'runtime-unavailable',
        message: 'test limb bundle unavailable',
      }),
    );
  });

  it('rethrows an aborted final-closure solve instead of publishing an error runtime', async () => {
    const current = await fixture('female');
    const aborted = new DOMException('Aborted', 'AbortError');
    const solveFinalClosure = vi.fn(async () => {
      throw aborted;
    });

    await expect(
      createMeasurementOpenReferenceLimbSubsetRuntimeV1({
        basis: current.basis,
        measurements: Object.freeze({ ...current.measurements, wristCircumferenceMm: 180 }),
        waistHipRuntime: current.waistHipRuntime,
        ...loaders,
        solveFinalClosure,
      }),
    ).rejects.toBe(aborted);
    expect(solveFinalClosure).toHaveBeenCalledOnce();
  });

  it('pins the exact receipt-71 envelope inside the runtime module', () => {
    expect(MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_ENVELOPE_V1).toEqual({
      bicepCircumferenceMm: { decrease: 0.75, increase: 1 },
      wristCircumferenceMm: { decrease: 1, increase: 1 },
      thighCircumferenceMm: { decrease: 1, increase: 1 },
      calfCircumferenceMm: { decrease: 1, increase: 1 },
      ankleCircumferenceMm: { decrease: 0.9, increase: 1 },
    });
  });
});
