import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { parseMakeHumanLimbCircumferenceDeltaBundleV1 } from './makehuman-limb-circumference-delta-bundle-v1';
import { createMakeHumanLimbCircumferenceUniformModesV1 } from './makehuman-limb-circumference-uniform-modes-v1';
import { createMakeHumanUniformWaistHipModesV1 } from './makehuman-uniform-waist-hip-modes-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import { CANONICAL_MEASUREMENT_PLAUSIBILITY_MM } from './measurement-adapter';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from './measurement-body-synthetic-corpus';
import { evaluateMeasurementOpenReferenceDisplayQualityV1 } from './measurement-open-reference-display-quality-gate-v1';
import type {
  OpenReferenceLimbCircumferenceKeyV1,
  OpenReferenceLimbCircumferenceModeV1,
  OpenReferenceSparseDeltaFieldV1,
} from './measurement-open-reference-limb-circumference-solver-v1';
import {
  compileOpenReferenceLimbFinalClosureContextV1,
  solveOpenReferenceLimbFinalClosureV1,
} from './measurement-open-reference-limb-final-closure-v1';
import { deriveOpenReferenceLimbSectionStationsV1 } from './measurement-open-reference-limb-section-station-v1';
import { createLocalizedThighResearchModeV1 } from './measurement-open-reference-localized-thigh-research-v1';
import { solveOpenReferenceUniformWaistHipV1 } from './measurement-open-reference-uniform-waist-hip-solver-v1';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
  type MakeHumanOpenReferenceBasisKindV1,
} from './measurement-open-reference-display-v1';
import { validateMeasurementSurfaceSelfIntersectionV1 } from './measurement-surface-self-intersection-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';

const KINDS = Object.freeze([
  'base',
  'neutral',
  'male',
  'female',
] as const satisfies readonly MakeHumanOpenReferenceBasisKindV1[]);
const FADE_DEPTHS_M = Object.freeze([0.03, 0.05, 0.08, 0.12] as const);
const medium = CANONICAL_MEASUREMENT_SIZE_RECORDS.find(({ id }) => id === 'canonical-size-medium');
if (!medium) throw new Error('Canonical medium record is missing.');

const limbBundle = parseMakeHumanLimbCircumferenceDeltaBundleV1(
  readFileSync(
    resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-limb-circumference-deltas-v1.bin'),
  ),
);
const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
  readFileSync(resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin')),
);

function addField(
  positionsM: Float32Array,
  field: OpenReferenceSparseDeltaFieldV1,
  coefficient = 1,
): Float32Array {
  const result = positionsM.slice();
  field.vertexIndices.forEach((vertex, index) => {
    const positionOffset = vertex * 3;
    const deltaOffset = index * 3;
    result[positionOffset] += field.deltasM[deltaOffset] * coefficient;
    result[positionOffset + 1] += field.deltasM[deltaOffset + 1] * coefficient;
    result[positionOffset + 2] += field.deltasM[deltaOffset + 2] * coefficient;
  });
  return result;
}

function perimeterMm(options: {
  readonly positionsM: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly originM: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
}): number {
  const measured = measureMeshPlaneSectionPerimetersV1({
    positionsM: options.positionsM,
    triangleIndices: options.indices,
    planeOriginM: options.originM,
    planeNormal: options.normal,
    selection: { kind: 'nearest-seed', seedM: options.originM },
  });
  if (!measured.ok || !measured.selectedLoop) throw new Error('Section measurement failed.');
  return measured.selectedLoop.perimeterM * 1000;
}

function thighPerimeterMm(
  positionsM: Float32Array,
  indices: Uint16Array | Uint32Array,
  mode: OpenReferenceLimbCircumferenceModeV1,
  stationPositionsM: Float32Array,
): number {
  const stations = deriveOpenReferenceLimbSectionStationsV1({
    positionsM: stationPositionsM,
    mode,
  });
  return (
    stations.reduce(
      (sum, station) =>
        sum +
        perimeterMm({
          positionsM,
          indices,
          originM: station.originM,
          normal: station.normal,
        }),
      0,
    ) / stations.length
  );
}

function intersectionKeys(
  positionsM: Float32Array,
  indices: Uint16Array | Uint32Array,
): ReadonlySet<string> {
  const report = validateMeasurementSurfaceSelfIntersectionV1(
    positionsM,
    Uint32Array.from(indices),
  );
  return new Set(
    report.intersections.map(
      ({ triangleA, triangleB, kind }) => `${triangleA}:${triangleB}:${kind}`,
    ),
  );
}

describe('localized thigh circumference research v1', () => {
  it.each(KINDS)(
    '%s maps the spatial-window response envelope',
    (kind) => {
      const basis = parseMakeHumanOpenReferenceBasisV1(
        readFileSync(
          resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
        ),
        kind,
      );
      const torso = createMakeHumanUniformWaistHipModesV1({
        basis,
        heightMm: medium.measurements.heightMm,
        bundle: torsoBundle,
      });
      const limb = createMakeHumanLimbCircumferenceUniformModesV1({
        basis,
        heightMm: medium.measurements.heightMm,
        bundle: limbBundle,
      });
      const torsoSolved = solveOpenReferenceUniformWaistHipV1({
        uniformPositionsM: torso.uniformPositionsM,
        triangleIndices: basis.indices,
        measurements: medium.measurements,
        modes: torso.modes,
      });
      const thigh = limb.modes.find(
        ({ measurementKey }) => measurementKey === 'thighCircumferenceMm',
      );
      const hip = torso.modes.find(({ measurementKey }) => measurementKey === 'hipCircumferenceMm');
      if (!thigh || !hip) throw new Error('Required modes are missing.');
      const baselineThighMm = thighPerimeterMm(
        torsoSolved.positionsM,
        basis.indices,
        thigh,
        torsoSolved.positionsM,
      );
      const baselineHipMm = perimeterMm({
        positionsM: torsoSolved.positionsM,
        indices: basis.indices,
        originM: hip.stationOriginM,
        normal: [0, 1, 0],
      });
      const rows = FADE_DEPTHS_M.flatMap((fadeDepthM) => {
        const localized = createLocalizedThighResearchModeV1({
          mode: thigh,
          positionsM: torsoSolved.positionsM,
          hipStationYM: hip.stationOriginM[1],
          fadeDepthM,
        });
        return (['decrease', 'increase'] as const).map((direction) => {
          const positionsM = addField(torsoSolved.positionsM, localized.mode[direction]);
          const thighMm = thighPerimeterMm(
            positionsM,
            basis.indices,
            localized.mode,
            torsoSolved.positionsM,
          );
          const hipMm = perimeterMm({
            positionsM,
            indices: basis.indices,
            originM: hip.stationOriginM,
            normal: [0, 1, 0],
          });
          const quality = evaluateMeasurementOpenReferenceDisplayQualityV1({
            uniformPositionsM: torso.uniformPositionsM,
            personalizedPositionsM: positionsM,
            triangleIndices: basis.indices,
          });
          return Object.freeze({
            fadeDepthM,
            direction,
            nonZeroDeltaVertexCount: localized.nonZeroDeltaVertexCount,
            responseMm: Number((thighMm - baselineThighMm).toFixed(3)),
            hipCrossTalkMm: Number(Math.abs(hipMm - baselineHipMm).toFixed(3)),
            qualitySafe: quality.safe,
            flippedTriangleCount: quality.metrics.flippedTriangleCount,
          });
        });
      });
      console.info(`LOCALIZED_THIGH_WINDOW_V1=${JSON.stringify({ kind, baselineThighMm, rows })}`);
      expect(rows.every(({ qualitySafe }) => qualitySafe)).toBe(true);
      expect(rows.some(({ responseMm }) => Math.abs(responseMm) >= 10)).toBe(true);
    },
    60_000,
  );

  it.each(KINDS)(
    '%s retains a meaningful thigh channel in five-way closure',
    (kind) => {
      const basis = parseMakeHumanOpenReferenceBasisV1(
        readFileSync(
          resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
        ),
        kind,
      );
      const torso = createMakeHumanUniformWaistHipModesV1({
        basis,
        heightMm: medium.measurements.heightMm,
        bundle: torsoBundle,
      });
      const limb = createMakeHumanLimbCircumferenceUniformModesV1({
        basis,
        heightMm: medium.measurements.heightMm,
        bundle: limbBundle,
      });
      const torsoSolved = solveOpenReferenceUniformWaistHipV1({
        uniformPositionsM: torso.uniformPositionsM,
        triangleIndices: basis.indices,
        measurements: medium.measurements,
        modes: torso.modes,
      });
      const hip = torso.modes.find(({ measurementKey }) => measurementKey === 'hipCircumferenceMm');
      const thigh = limb.modes.find(
        ({ measurementKey }) => measurementKey === 'thighCircumferenceMm',
      );
      if (!hip || !thigh) throw new Error('Required modes are missing.');
      const localized = createLocalizedThighResearchModeV1({
        mode: thigh,
        positionsM: torsoSolved.positionsM,
        hipStationYM: hip.stationOriginM[1],
        fadeDepthM: 0.12,
      });
      const modes = limb.modes.map((mode) =>
        mode.measurementKey === 'thighCircumferenceMm' ? localized.mode : mode,
      );
      const context = compileOpenReferenceLimbFinalClosureContextV1({
        waistHipPositionsM: torsoSolved.positionsM,
        triangleIndices: basis.indices,
        limbModes: modes,
        torsoModes: torso.modes,
      });
      const baselineIntersections = intersectionKeys(torsoSolved.positionsM, basis.indices);
      const rows = (
        [
          { direction: 'decrease', coefficient: 1 },
          { direction: 'increase', coefficient: 0.25 },
          { direction: 'increase', coefficient: 0.5 },
          { direction: 'increase', coefficient: 1 },
        ] as const
      ).map(({ direction, coefficient }) => {
        const targets = Object.fromEntries(
          modes.map((mode) => {
            const modeDirection =
              direction === 'decrease' && mode.measurementKey !== 'thighCircumferenceMm'
                ? ('increase' as const)
                : direction;
            const modeCoefficient =
              direction === 'decrease' && mode.measurementKey !== 'thighCircumferenceMm'
                ? 0.25
                : coefficient;
            const baselineMm = thighPerimeterMm(
              torsoSolved.positionsM,
              basis.indices,
              mode,
              torsoSolved.positionsM,
            );
            const endpointMm = thighPerimeterMm(
              addField(torsoSolved.positionsM, mode[modeDirection]),
              basis.indices,
              mode,
              torsoSolved.positionsM,
            );
            const targetMm = baselineMm + (endpointMm - baselineMm) * modeCoefficient;
            const [minimum, maximum] =
              CANONICAL_MEASUREMENT_PLAUSIBILITY_MM[
                mode.measurementKey as OpenReferenceLimbCircumferenceKeyV1
              ];
            if (targetMm < minimum || targetMm > maximum) {
              throw new Error(`${mode.measurementKey} target is implausible.`);
            }
            return [mode.measurementKey, targetMm];
          }),
        );
        const solved = solveOpenReferenceLimbFinalClosureV1({
          uniformPositionsM: torso.uniformPositionsM,
          waistHipPositionsM: torsoSolved.positionsM,
          triangleIndices: basis.indices,
          measurements: { ...medium.measurements, ...targets },
          limbModes: modes,
          torsoModes: torso.modes,
          compiledContext: context,
        });
        const quality = evaluateMeasurementOpenReferenceDisplayQualityV1({
          uniformPositionsM: torso.uniformPositionsM,
          personalizedPositionsM: solved.positionsM,
          triangleIndices: basis.indices,
        });
        const intersections =
          coefficient === 1 ? intersectionKeys(solved.positionsM, basis.indices) : null;
        return Object.freeze({
          direction,
          coefficient,
          represented: solved.representedMeasurements,
          dropped: solved.droppedMeasurements,
          thighCoefficient:
            solved.modeResults.find(
              ({ measurementKey }) => measurementKey === 'thighCircumferenceMm',
            )?.coefficient ?? 0,
          maximumTorsoCrossTalkMm: Math.max(
            0,
            ...solved.modeResults.map(({ maximumTorsoCrossTalkMm }) => maximumTorsoCrossTalkMm),
          ),
          qualitySafe: quality.safe,
          flippedTriangleCount: quality.metrics.flippedTriangleCount,
          newIntersectionCount:
            intersections == null
              ? null
              : [...intersections].filter((key) => !baselineIntersections.has(key)).length,
        });
      });
      console.info(`LOCALIZED_THIGH_FIVE_WAY_V1=${JSON.stringify({ kind, rows })}`);
      expect(rows.every(({ represented }) => represented.includes('thighCircumferenceMm'))).toBe(
        true,
      );
      expect(rows.every(({ maximumTorsoCrossTalkMm }) => maximumTorsoCrossTalkMm <= 0.1)).toBe(
        true,
      );
      expect(
        rows.every(
          ({ qualitySafe, flippedTriangleCount }) => qualitySafe && flippedTriangleCount === 0,
        ),
      ).toBe(true);
      expect(
        rows
          .filter(({ newIntersectionCount }) => newIntersectionCount != null)
          .every(({ newIntersectionCount }) => newIntersectionCount === 0),
      ).toBe(true);
    },
    120_000,
  );
});
