import type {
  OpenReferenceLimbCircumferenceModeV1,
  OpenReferenceSparseDeltaFieldV1,
} from './measurement-open-reference-limb-circumference-solver-v1';
import type { MeshPlaneSectionVec3V1 } from './mesh-plane-section-perimeter-v1';

export const MEASUREMENT_OPEN_REFERENCE_LIMB_SECTION_STATION_V1 =
  'measurement-open-reference-limb-section-station/v1' as const;

export interface OpenReferenceLimbSectionStationV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_LIMB_SECTION_STATION_V1;
  readonly side: 'negative' | 'positive';
  readonly originM: MeshPlaneSectionVec3V1;
  readonly normal: MeshPlaneSectionVec3V1;
  readonly supportCount: number;
  readonly claims: {
    readonly projectOwnedGeometricRule: true;
    readonly anatomicalLandmarkEquivalent: false;
    readonly tapePathEquivalent: false;
    readonly measurementProtocolEquivalent: false;
  };
}

const CLAIMS = Object.freeze({
  projectOwnedGeometricRule: true as const,
  anatomicalLandmarkEquivalent: false as const,
  tapePathEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
});

type Covariance = readonly [number, number, number, number, number, number];
type MutableCovariance = [number, number, number, number, number, number];

function finitePositions(positionsM: Float32Array): void {
  if (!(positionsM instanceof Float32Array) || positionsM.length === 0 || positionsM.length % 3) {
    throw new TypeError('positionsM must be a non-empty XYZ Float32Array.');
  }
  if (![...positionsM].every(Number.isFinite)) {
    throw new TypeError('positionsM contains a non-finite coordinate.');
  }
}

function fieldVertices(
  field: OpenReferenceSparseDeltaFieldV1,
  vertexCount: number,
  label: string,
): readonly number[] {
  if (!(field.vertexIndices instanceof Uint16Array) || !(field.deltasM instanceof Float32Array)) {
    throw new TypeError(`${label} must use Uint16Array indices and Float32Array deltas.`);
  }
  if (field.vertexIndices.length === 0 || field.deltasM.length !== field.vertexIndices.length * 3) {
    throw new TypeError(`${label} sparse field lengths are invalid.`);
  }
  const vertices: number[] = [];
  let previous = -1;
  field.vertexIndices.forEach((vertex, index) => {
    if (vertex >= vertexCount) throw new RangeError(`${label} vertex index is out of range.`);
    if (vertex <= previous) throw new TypeError(`${label} vertex indices must be strictly sorted.`);
    const offset = index * 3;
    if (
      !Number.isFinite(field.deltasM[offset]) ||
      !Number.isFinite(field.deltasM[offset + 1]) ||
      !Number.isFinite(field.deltasM[offset + 2])
    ) {
      throw new TypeError(`${label} contains a non-finite delta.`);
    }
    vertices.push(vertex);
    previous = vertex;
  });
  return vertices;
}

function normalize(vector: readonly number[]): MeshPlaneSectionVec3V1 {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!Number.isFinite(length) || length < 1e-9) {
    throw new Error('Limb section station axis is degenerate.');
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function projectCovariance(
  covariance: Covariance,
  vector: MeshPlaneSectionVec3V1,
): MeshPlaneSectionVec3V1 {
  const [xx, xy, xz, yy, yz, zz] = covariance;
  return [
    xx * vector[0] + xy * vector[1] + xz * vector[2],
    xy * vector[0] + yy * vector[1] + yz * vector[2],
    xz * vector[0] + yz * vector[1] + zz * vector[2],
  ];
}

function dominantAxis(covariance: Covariance): MeshPlaneSectionVec3V1 {
  // The admitted display adapter is A-pose-only. Its limbs retain a non-zero +Y/-Y component,
  // so the body-up seed selects the longitudinal covariance mode instead of a wider radial mode
  // when sparse support is a short circumferential band.
  let axis: MeshPlaneSectionVec3V1 = [0, 1, 0];
  for (let iteration = 0; iteration < 24; iteration += 1) {
    axis = normalize(projectCovariance(covariance, axis));
  }
  return axis;
}

/**
 * Project-owned station rule. Sparse direction support is split at display X=0; each side uses
 * its support centroid and dominant covariance direction. This is a geometric probe station, not
 * a copied ruler loop, anatomical landmark, or tape-measure protocol.
 */
export function deriveOpenReferenceLimbSectionStationsV1(options: {
  readonly positionsM: Float32Array;
  readonly mode: OpenReferenceLimbCircumferenceModeV1;
}): readonly [OpenReferenceLimbSectionStationV1, OpenReferenceLimbSectionStationV1] {
  finitePositions(options.positionsM);
  const vertexCount = options.positionsM.length / 3;
  const vertices = [
    ...new Set([
      ...fieldVertices(options.mode.decrease, vertexCount, 'decrease'),
      ...fieldVertices(options.mode.increase, vertexCount, 'increase'),
    ]),
  ].sort((left, right) => left - right);

  const station = (side: 'negative' | 'positive'): OpenReferenceLimbSectionStationV1 => {
    const sideVertices = vertices.filter((vertex) => {
      const x = options.positionsM[vertex * 3];
      return side === 'positive' ? x > 0 : x < 0;
    });
    if (sideVertices.length < 3) throw new Error(`${side} limb support is incomplete.`);

    const origin = [0, 0, 0];
    sideVertices.forEach((vertex) => {
      const offset = vertex * 3;
      origin[0] += options.positionsM[offset];
      origin[1] += options.positionsM[offset + 1];
      origin[2] += options.positionsM[offset + 2];
    });
    origin.forEach((value, axis) => {
      origin[axis] = value / sideVertices.length;
    });

    const covariance: MutableCovariance = [0, 0, 0, 0, 0, 0];
    sideVertices.forEach((vertex) => {
      const offset = vertex * 3;
      const x = options.positionsM[offset] - origin[0];
      const y = options.positionsM[offset + 1] - origin[1];
      const z = options.positionsM[offset + 2] - origin[2];
      covariance[0] += x * x;
      covariance[1] += x * y;
      covariance[2] += x * z;
      covariance[3] += y * y;
      covariance[4] += y * z;
      covariance[5] += z * z;
    });

    return Object.freeze({
      version: MEASUREMENT_OPEN_REFERENCE_LIMB_SECTION_STATION_V1,
      side,
      originM: Object.freeze(origin) as unknown as MeshPlaneSectionVec3V1,
      normal: dominantAxis(covariance),
      supportCount: sideVertices.length,
      claims: CLAIMS,
    });
  };

  return Object.freeze([station('negative'), station('positive')]);
}
