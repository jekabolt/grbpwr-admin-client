import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { resolveModelOpenReferencePreviewInputV1 } from 'components/managers/model/components/model-open-reference-preview-input-v1';

import { createMakeHumanAnteriorChestShoulderModesResearchV1 } from './makehuman-anterior-chest-shoulder-modes-research-v1';
import { createMakeHumanLocalizedChestShoulderModesResearchV2 } from './makehuman-localized-chest-shoulder-modes-research-v2';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import {
  CHEST_POINT_UNDERARM_CLEARANCE_M,
  HM08_CHEST_POINT_VERTICES_V1,
  resolveMeasurementOpenReferenceChestPointYV1,
} from './measurement-open-reference-chest-point-station-v1';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';
import { createMeshSurfaceTopologyV1 } from './mesh-surface-topology-v1';

const readAsset = (path: string) => readFileSync(resolve(process.cwd(), path));
const bundle = parseMakeHumanTorsoShapeDeltaBundleV1(
  readAsset('src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin'),
);
const basisOf = (kind: 'female' | 'male' | 'neutral') =>
  parseMakeHumanOpenReferenceBasisV1(
    readAsset(MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
    kind,
  );

/** ANSUR II subject 14066 (male), core form set (study experiment A). */
const ANSUR_14066_MALE = Object.freeze({
  BODY_MEASUREMENT_NAME_HEIGHT: 1873,
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 425,
  BODY_MEASUREMENT_NAME_CHEST: 1132,
  BODY_MEASUREMENT_NAME_WAIST: 978,
  BODY_MEASUREMENT_NAME_HIP: 1070,
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 582,
  BODY_MEASUREMENT_NAME_INSEAM: 872,
});
/** ANSUR II subject 25040 (female), core form set (study experiment A). */
const ANSUR_25040_FEMALE = Object.freeze({
  BODY_MEASUREMENT_NAME_HEIGHT: 1685,
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 377,
  BODY_MEASUREMENT_NAME_CHEST: 906,
  BODY_MEASUREMENT_NAME_WAIST: 824,
  BODY_MEASUREMENT_NAME_HIP: 1015,
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 582,
  BODY_MEASUREMENT_NAME_INSEAM: 835,
});

function measurementsOf(
  gender: 'GENDER_ENUM_FEMALE' | 'GENDER_ENUM_MALE' | undefined,
  fields: Readonly<Record<string, number>>,
) {
  const resolution = resolveModelOpenReferencePreviewInputV1({ gender, measurements: fields });
  if (!resolution.ok) throw new Error('ANSUR fixture did not resolve');
  return resolution.measurements;
}

function chestStation(modes: readonly { measurementKey: string; chestStationOriginM?: unknown }[]) {
  const mode = modes.find(({ measurementKey }) => measurementKey === 'chestCircumferenceMm');
  return mode?.chestStationOriginM as readonly [number, number, number];
}

describe('chest-point station v1', () => {
  it('reads the chest point as the mirrored HM08 apex pair, kept under the underarm', () => {
    const basis = basisOf('male');
    const positionsM = createMakeHumanLocalizedChestShoulderModesResearchV2({
      basis,
      heightMm: ANSUR_14066_MALE.BODY_MEASUREMENT_NAME_HEIGHT,
      bundle,
    }).uniformPositionsM;
    const topology = createMeshSurfaceTopologyV1({ positionsM, triangleIndices: basis.indices });
    expect(topology.ok).toBe(true);
    if (!topology.ok) return;
    const { left, right } = HM08_CHEST_POINT_VERTICES_V1;
    expect(topology.topology.mirrorVertexMap[left]).toBe(right);
    const chestY = resolveMeasurementOpenReferenceChestPointYV1(positionsM);
    const apexY = (positionsM[left * 3 + 1] + positionsM[right * 3 + 1]) / 2;
    expect(chestY).toBeLessThanOrEqual(apexY);
    expect(() => resolveMeasurementOpenReferenceChestPointYV1(new Float32Array(30))).toThrow(
      RangeError,
    );
    expect(CHEST_POINT_UNDERARM_CLEARANCE_M).toBe(0.03);
  });

  it.each([
    ['male', 'GENDER_ENUM_MALE'],
    ['neutral', undefined],
  ] as const)(
    'solves the %s chest on the chest-point plane the guide draws',
    (kind, gender) => {
      const basis = basisOf(kind);
      const measurements = measurementsOf(gender, ANSUR_14066_MALE);
      const source = createMakeHumanLocalizedChestShoulderModesResearchV2({
        basis,
        heightMm: measurements.heightMm,
        bundle,
      });
      const anterior = createMakeHumanAnteriorChestShoulderModesResearchV1({
        basis,
        measurements,
        bundle,
      });
      const station = chestStation(anterior.modes);
      const armpitStation = chestStation(source.modes);
      const chestPointY = resolveMeasurementOpenReferenceChestPointYV1(source.uniformPositionsM);
      expect(station[1]).toBe(chestPointY);
      // The old armpit-line plane sat well above the chest point on these bases.
      expect(armpitStation[1] - station[1]).toBeGreaterThan(0.03);
      expect([station[0], station[2]]).toEqual([armpitStation[0], armpitStation[2]]);
      expect(anterior.diagnostics).toContain('chest-station:chest-point-template');
      // Under bust keeps its offset under the (moved) chest plane.
      expect(anterior.underBustStationOriginM[1]).toBeLessThan(station[1]);
      // One torso ring at the chest point: the arms are separate loops there.
      const section = measureMeshPlaneSectionPerimetersV1({
        positionsM: source.uniformPositionsM,
        triangleIndices: basis.indices,
        planeOriginM: [0, chestPointY, station[2]],
        planeNormal: [0, 1, 0],
        selection: { kind: 'nearest-seed', seedM: [0, chestPointY, station[2]] },
        policy: { weldToleranceM: 0.00002 },
      });
      expect(section.ok && section.loops.length).toBe(3);
    },
    60_000,
  );

  it('keeps the female armpit-line chest station byte-identical', () => {
    const basis = basisOf('female');
    const measurements = measurementsOf('GENDER_ENUM_FEMALE', ANSUR_25040_FEMALE);
    const source = createMakeHumanLocalizedChestShoulderModesResearchV2({
      basis,
      heightMm: measurements.heightMm,
      bundle,
    });
    const anterior = createMakeHumanAnteriorChestShoulderModesResearchV1({
      basis,
      measurements,
      bundle,
    });
    expect(chestStation(anterior.modes)).toEqual(chestStation(source.modes));
    expect(anterior.diagnostics).not.toContain('chest-station:chest-point-template');
  }, 60_000);
});
