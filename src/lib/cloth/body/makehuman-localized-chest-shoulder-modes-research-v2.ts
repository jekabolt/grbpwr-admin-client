import type { MakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import {
  createMakeHumanUniformChestShoulderModesResearchV1,
  type MakeHumanUniformChestShoulderModesResearchResultV1,
  type UniformChestShoulderResearchModeV1,
  type UniformChestShoulderResearchSparseFieldV1,
} from './makehuman-uniform-chest-shoulder-modes-research-v1';
import type { MakeHumanOpenReferenceBasisV1 } from './measurement-open-reference-display-v1';

export const MAKEHUMAN_LOCALIZED_CHEST_SHOULDER_MODES_RESEARCH_V2 =
  'makehuman-localized-chest-shoulder-modes-research/v2' as const;

export interface MakeHumanLocalizedChestShoulderModesResearchResultV2
  extends Omit<MakeHumanUniformChestShoulderModesResearchResultV1, 'version'> {
  readonly version: typeof MAKEHUMAN_LOCALIZED_CHEST_SHOULDER_MODES_RESEARCH_V2;
}

function smoothstep01(value: number): number {
  const bounded = Math.min(1, Math.max(0, value));
  return bounded * bounded * (3 - 2 * bounded);
}

function sparseField(
  positionsM: Float32Array,
  deltaAt: (x: number, y: number, z: number, vertex: number) => readonly [number, number, number],
): UniformChestShoulderResearchSparseFieldV1 {
  const vertices: number[] = [];
  const deltas: number[] = [];
  for (let vertex = 0; vertex < positionsM.length / 3; vertex += 1) {
    const offset = vertex * 3;
    const delta = deltaAt(
      positionsM[offset],
      positionsM[offset + 1],
      positionsM[offset + 2],
      vertex,
    );
    if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0) continue;
    vertices.push(vertex);
    deltas.push(...delta);
  }
  if (vertices.length < 3) throw new Error('Localized research field support is incomplete.');
  return Object.freeze({
    vertexIndices: Uint16Array.from(vertices),
    deltasM: Float32Array.from(deltas),
  });
}

function localizedChestMode(
  source: UniformChestShoulderResearchModeV1,
  positionsM: Float32Array,
  shoulderStationY: number,
): UniformChestShoulderResearchModeV1 {
  if (!source.chestStationOriginM) throw new Error('Chest station is missing.');
  const [, stationY, stationZ] = source.chestStationOriginM;
  const upperVerticalRadiusM = Math.max(0.055, shoulderStationY - stationY);
  const lowerVerticalRadiusM = 0.12;
  const build = (radialScale: number) =>
    sparseField(positionsM, (x, y, z) => {
      const verticalRadiusM = y < stationY ? lowerVerticalRadiusM : upperVerticalRadiusM;
      const weight = smoothstep01(1 - Math.abs(y - stationY) / verticalRadiusM);
      if (weight <= 0) return [0, 0, 0];
      return [x * radialScale * weight, 0, (z - stationZ) * radialScale * weight];
    });
  return Object.freeze({
    ...source,
    sourceChannel: 'chestCircumferenceCandidate',
    decrease: build(-0.28),
    increase: build(0.38),
    coefficientCaps: Object.freeze({ decrease: 1, increase: 1 }),
  });
}

function localizedShoulderMode(
  source: UniformChestShoulderResearchModeV1,
  positionsM: Float32Array,
  chestStationY: number,
): UniformChestShoulderResearchModeV1 {
  if (!source.shoulderVertices) throw new Error('Shoulder vertices are missing.');
  const anchors = [source.shoulderVertices.negative, source.shoulderVertices.positive].map(
    (vertex) => {
      const offset = vertex * 3;
      return Object.freeze({
        vertex,
        x: positionsM[offset],
        y: positionsM[offset + 1],
        z: positionsM[offset + 2],
      });
    },
  );
  const supportRadiusM = 0.28;
  const displacementM = 0.085;
  const zeroBelowY = chestStationY + 0.025;
  const build = (direction: -1 | 1) =>
    sparseField(positionsM, (x, y, z) => {
      const side = x < 0 ? anchors[0] : anchors[1];
      const distance = Math.hypot(x - side.x, y - side.y, z - side.z);
      const heightWeight = Math.max(0, Math.min(1, (y - zeroBelowY) / (side.y - zeroBelowY)));
      const centerWeight = smoothstep01(Math.abs(x) / 0.12);
      const weight = smoothstep01(1 - distance / supportRadiusM) * heightWeight * centerWeight;
      if (weight <= 0) return [0, 0, 0];
      const outwardSign = side.x < 0 ? -1 : 1;
      return [outwardSign * direction * displacementM * weight, 0, 0];
    });
  return Object.freeze({
    ...source,
    sourceChannel: 'shoulderDistanceCandidate',
    decrease: build(-1),
    increase: build(1),
    coefficientCaps: Object.freeze({ decrease: 1, increase: 1 }),
  });
}

/**
 * Research-only analytic directions. The chest field is confined to a narrow transverse band and
 * the shoulder field uses compact, symmetric support around the admitted shoulder proxy vertices.
 * This intentionally tests whether spatial separation can satisfy the historical leave-one-out
 * cross-talk policy; it does not establish anatomical tape semantics or production authority.
 */
export function createMakeHumanLocalizedChestShoulderModesResearchV2(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly heightMm: number;
  readonly bundle: MakeHumanTorsoShapeDeltaBundleV1;
}): MakeHumanLocalizedChestShoulderModesResearchResultV2 {
  const source = createMakeHumanUniformChestShoulderModesResearchV1(options);
  const chestMode = source.modes.find(
    ({ measurementKey }) => measurementKey === 'chestCircumferenceMm',
  );
  const shoulderMode = source.modes.find(
    ({ measurementKey }) => measurementKey === 'shoulderBreadthMm',
  );
  const chestStationY = chestMode?.chestStationOriginM?.[1];
  if (chestStationY === undefined) throw new Error('Chest station is missing.');
  if (!shoulderMode?.shoulderVertices) throw new Error('Shoulder vertices are missing.');
  const shoulderStationY = Math.min(
    source.uniformPositionsM[shoulderMode.shoulderVertices.negative * 3 + 1],
    source.uniformPositionsM[shoulderMode.shoulderVertices.positive * 3 + 1],
  );
  return Object.freeze({
    ...source,
    version: MAKEHUMAN_LOCALIZED_CHEST_SHOULDER_MODES_RESEARCH_V2,
    modes: Object.freeze(
      source.modes.map((mode) =>
        mode.measurementKey === 'chestCircumferenceMm'
          ? localizedChestMode(mode, source.uniformPositionsM, shoulderStationY)
          : localizedShoulderMode(mode, source.uniformPositionsM, chestStationY),
      ),
    ),
  });
}
