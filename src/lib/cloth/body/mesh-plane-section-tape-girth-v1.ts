import {
  measureMeshPlaneSectionPerimetersV1,
  type MeshPlaneSectionLoopV1,
  type MeshPlaneSectionVec3V1,
} from './mesh-plane-section-perimeter-v1';

export const MESH_PLANE_SECTION_TAPE_GIRTH_V1 = 'mesh-plane-section-tape-girth/v1' as const;

type Vec2 = readonly [number, number];

function cross2(origin: Vec2, a: Vec2, b: Vec2): number {
  return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
}

/** Orthonormal in-plane axes for a plane normal; horizontal planes use x and -z. */
function planeAxes(
  normal: MeshPlaneSectionVec3V1,
): readonly [MeshPlaneSectionVec3V1, MeshPlaneSectionVec3V1] {
  const length = Math.hypot(normal[0], normal[1], normal[2]);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    throw new RangeError('Tape girth plane normal must have non-zero finite length.');
  }
  const n: MeshPlaneSectionVec3V1 = [normal[0] / length, normal[1] / length, normal[2] / length];
  const seed: MeshPlaneSectionVec3V1 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  const dot = seed[0] * n[0] + seed[1] * n[1] + seed[2] * n[2];
  const uRaw: MeshPlaneSectionVec3V1 = [
    seed[0] - dot * n[0],
    seed[1] - dot * n[1],
    seed[2] - dot * n[2],
  ];
  const uLength = Math.hypot(uRaw[0], uRaw[1], uRaw[2]);
  const u: MeshPlaneSectionVec3V1 = [uRaw[0] / uLength, uRaw[1] / uLength, uRaw[2] / uLength];
  const v: MeshPlaneSectionVec3V1 = [
    n[1] * u[2] - n[2] * u[1],
    n[2] * u[0] - n[0] * u[2],
    n[0] * u[1] - n[1] * u[0],
  ];
  return [u, v];
}

/**
 * Tape girth of one plane-section loop: the perimeter of the loop's convex hull in its plane.
 * A tape held taut around the body bridges every concavity the raw loop follows into (cleavage,
 * gluteal cleft, spine groove), so the hull is what a tape reads at that section. It is still a
 * geometric plane-section quantity, not an anatomical tape protocol or a fit claim.
 */
export function meshPlaneSectionLoopTapePerimeterMV1(
  loop: Pick<MeshPlaneSectionLoopV1, 'pointsM'>,
  planeNormal: MeshPlaneSectionVec3V1 = [0, 1, 0],
): number {
  const [u, v] = planeAxes(planeNormal);
  const points: Vec2[] = loop.pointsM.map((point) => {
    if (point.length !== 3 || !point.every(Number.isFinite)) {
      throw new TypeError('Tape girth loop points must be finite.');
    }
    return [
      point[0] * u[0] + point[1] * u[1] + point[2] * u[2],
      point[0] * v[0] + point[1] * v[1] + point[2] * v[2],
    ];
  });
  if (points.length < 3) throw new RangeError('Tape girth needs a loop of at least three points.');
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  // Andrew's monotone chain; collinear points are dropped, so the hull is strictly convex.
  const lower: Vec2[] = [];
  for (const point of points) {
    while (
      lower.length >= 2 &&
      cross2(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Vec2[] = [];
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    while (
      upper.length >= 2 &&
      cross2(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  if (hull.length < 3) throw new RangeError('Tape girth loop is degenerate.');
  let perimeterM = 0;
  for (let index = 0; index < hull.length; index += 1) {
    const a = hull[index];
    const b = hull[(index + 1) % hull.length];
    perimeterM += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  if (!Number.isFinite(perimeterM) || perimeterM <= 0) {
    throw new RangeError('Tape girth loop is degenerate.');
  }
  return perimeterM;
}

/**
 * Tape girth (mm) of the horizontal torso section nearest `originM`, with the same plane, seed
 * selection and weld tolerance the torso girth solvers use. Undefined when no section is found.
 */
export function measureMeshHorizontalSectionTapeGirthMmV1(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly originM: MeshPlaneSectionVec3V1;
}): number | undefined {
  try {
    const section = measureMeshPlaneSectionPerimetersV1({
      positionsM: options.positionsM,
      triangleIndices: options.triangleIndices,
      planeOriginM: options.originM,
      planeNormal: [0, 1, 0],
      selection: { kind: 'nearest-seed', seedM: options.originM },
      policy: { weldToleranceM: 0.00002 },
    });
    if (!section.ok || !section.selectedLoop) return undefined;
    const tapeMm = meshPlaneSectionLoopTapePerimeterMV1(section.selectedLoop) * 1000;
    return Number.isFinite(tapeMm) && tapeMm > 0 ? tapeMm : undefined;
  } catch {
    return undefined;
  }
}

export type MeshTapeGirthClosureKeyV1 =
  | 'chestCircumferenceMm'
  | 'waistCircumferenceMm'
  | 'hipCircumferenceMm';

export interface MeshTapeGirthClosureV1 {
  readonly key: MeshTapeGirthClosureKeyV1;
  readonly targetMm: number;
  /** Undefined when the final section could not be measured; never treated as a match. */
  readonly tapeMm: number | undefined;
  readonly withinTolerance: boolean;
}

/**
 * Largest residual a torso girth may keep and still be reported as the typed value. It is the
 * existing female chest residual (1 mm); the hip solve closes to 0.1 mm and each later stage holds
 * its protected stations within 0.5 mm, so a correct build stays inside it.
 */
export const MESH_TAPE_GIRTH_CLOSURE_TOLERANCE_MM = 1;

/**
 * Re-measures the tape girth at each typed torso station on a finished mesh. Stations or targets
 * that are missing are skipped; an unmeasurable section is reported outside tolerance.
 */
export function measureMeshTapeGirthClosureV1(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly stations: Readonly<Partial<Record<MeshTapeGirthClosureKeyV1, MeshPlaneSectionVec3V1>>>;
  readonly targetsMm: Readonly<Partial<Record<MeshTapeGirthClosureKeyV1, number>>>;
  readonly toleranceMm?: number;
}): readonly MeshTapeGirthClosureV1[] {
  const toleranceMm = options.toleranceMm ?? MESH_TAPE_GIRTH_CLOSURE_TOLERANCE_MM;
  const keys: readonly MeshTapeGirthClosureKeyV1[] = [
    'chestCircumferenceMm',
    'waistCircumferenceMm',
    'hipCircumferenceMm',
  ];
  const result: MeshTapeGirthClosureV1[] = [];
  for (const key of keys) {
    const originM = options.stations[key];
    const targetMm = options.targetsMm[key];
    if (!originM || targetMm == null || !Number.isFinite(targetMm)) continue;
    const tapeMm = measureMeshHorizontalSectionTapeGirthMmV1({
      positionsM: options.positionsM,
      triangleIndices: options.triangleIndices,
      originM,
    });
    result.push(
      Object.freeze({
        key,
        targetMm,
        tapeMm,
        withinTolerance: tapeMm != null && Math.abs(tapeMm - targetMm) <= toleranceMm,
      }),
    );
  }
  return Object.freeze(result);
}
