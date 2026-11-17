import type { common_BodyMeasurementName } from 'api/proto-http/admin';
import type { MeasurementBodyFrameV2 } from 'lib/cloth/body/measurement-body-frame-v2';
import { resolveMeasurementOpenReferenceHighHipStationV1 } from 'lib/cloth/body/measurement-open-reference-high-hip-proxy-v1';
import type { MeasurementOpenReferenceKneeRigStationV1 } from 'lib/cloth/body/measurement-open-reference-knee-proxy-v1';
import type { MeasurementOpenReferenceNeckProtectedSectionV1 } from 'lib/cloth/body/measurement-open-reference-neck-proxy-v1';
import type {
  OpenReferenceLimbCircumferenceKeyV1,
  OpenReferenceLimbCircumferenceModeV1,
} from 'lib/cloth/body/measurement-open-reference-limb-circumference-solver-v1';
import { deriveOpenReferenceLimbSectionStationsV1 } from 'lib/cloth/body/measurement-open-reference-limb-section-station-v1';
import {
  SURFACE_ANCHOR_TABLE_V1,
  type SurfaceAnchorIdV1,
} from 'lib/cloth/body/measurement-surface-anchors-v1';
import type { MeasurementSurfaceMeshV1 } from 'lib/cloth/body/measurement-watertight-surface-v1';
import { snapMeshMirrorPairsV1 } from 'lib/cloth/body/mesh-mirror-pair-snap-v1';
import {
  measureMeshPlaneSectionPerimetersV1,
  type MeshPlaneSectionLoopV1,
} from 'lib/cloth/body/mesh-plane-section-perimeter-v1';
import { computeMeshSurfaceGeodesicV1 } from 'lib/cloth/body/mesh-surface-geodesic-v1';
import {
  meshSurfaceVertexPointV1,
  mirrorMeshSurfacePathV1,
  mirrorMeshSurfacePointV1,
  type MeshSurfacePathV1,
  type MeshSurfacePointV1,
} from 'lib/cloth/body/mesh-surface-path-v1';
import {
  createMeshSurfaceTopologyV1,
  meshSurfaceVertexTrianglesV1,
  type MeshSurfaceTopologyV1,
} from 'lib/cloth/body/mesh-surface-topology-v1';

export const MEASUREMENT_SURFACE_ACTIVE_MEASUREMENT_GUIDE_V1 =
  'measurement-surface-active-measurement-guide/v1' as const;

export type MeasurementSurfaceMeasurementGuideStatusV1 =
  | 'visible'
  | 'limited'
  | 'unavailable-pose'
  | 'unavailable-section'
  | 'unsupported';

/**
 * A straight or depth line that runs through the body by definition. `x-ray` draws the hidden part
 * through the body (dashed, lighter, end dots); `caliper` draws the whole line over the body.
 */
export type MeasurementSurfaceMeasurementGuideAirV1 = 'x-ray' | 'caliper';

/**
 * Where the camera looks while the field is focused; absent means the owner's camera.
 * `back-three-quarter`: from behind on the left, 45 degrees between the back and the left side.
 */
export type MeasurementSurfaceMeasurementGuideViewV1 =
  | 'front'
  | 'back'
  | 'side'
  | 'back-three-quarter';

export type MeasurementSurfaceMeasurementGuidePathV1 =
  | Readonly<{
      readonly id: string;
      readonly closed: boolean;
      readonly source: 'mesh-vertices';
      readonly vertexIndices: readonly number[];
      readonly air?: MeasurementSurfaceMeasurementGuideAirV1;
    }>
  | Readonly<{
      readonly id: string;
      readonly closed: boolean;
      readonly source: 'fixed-points';
      readonly pointsM: readonly (readonly [number, number, number])[];
      readonly air?: MeasurementSurfaceMeasurementGuideAirV1;
    }>
  | Readonly<{
      readonly id: string;
      readonly closed: boolean;
      /**
       * Straight lines that follow a posed body: each coordinate of a point is the live coordinate
       * of `axisVertices[axis]` plus `offsetM`.
       */
      readonly source: 'mesh-offset-points';
      readonly points: readonly MeasurementSurfaceMeasurementGuideOffsetPointV1[];
      readonly air?: MeasurementSurfaceMeasurementGuideAirV1;
    }>;

export interface MeasurementSurfaceMeasurementGuideOffsetPointV1 {
  readonly axisVertices: readonly [number, number, number];
  readonly offsetM: readonly [number, number, number];
}

export interface MeasurementSurfaceActiveMeasurementGuideV1 {
  readonly version: typeof MEASUREMENT_SURFACE_ACTIVE_MEASUREMENT_GUIDE_V1;
  readonly measurementName: common_BodyMeasurementName;
  readonly label: string;
  readonly status: MeasurementSurfaceMeasurementGuideStatusV1;
  readonly paths: readonly MeasurementSurfaceMeasurementGuidePathV1[];
  /** Per-field camera view (back or side) for lines that only read from there. */
  readonly view?: MeasurementSurfaceMeasurementGuideViewV1;
  readonly claims: Readonly<{
    readonly visualGuideOnly: true;
    readonly measurementProtocolEquivalent: false;
    readonly fitClaimEligible: false;
  }>;
}

const CLAIMS = Object.freeze({
  visualGuideOnly: true as const,
  measurementProtocolEquivalent: false as const,
  fitClaimEligible: false as const,
});

const LABELS = Object.freeze({
  BODY_MEASUREMENT_NAME_HEIGHT: 'height',
  BODY_MEASUREMENT_NAME_CHEST: 'chest',
  BODY_MEASUREMENT_NAME_UNDER_BUST: 'under bust',
  BODY_MEASUREMENT_NAME_WAIST: 'waist',
  BODY_MEASUREMENT_NAME_HIGH_HIP: 'high hip',
  BODY_MEASUREMENT_NAME_HIP: 'hip',
  BODY_MEASUREMENT_NAME_NECK_BASE: 'neck base',
  BODY_MEASUREMENT_NAME_NECK: 'neck',
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 'across shoulder',
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 'sleeve length',
  BODY_MEASUREMENT_NAME_BICEP: 'bicep',
  BODY_MEASUREMENT_NAME_WRIST: 'wrist',
  BODY_MEASUREMENT_NAME_INSEAM: 'inseam',
  BODY_MEASUREMENT_NAME_THIGH: 'thigh',
  BODY_MEASUREMENT_NAME_KNEE: 'knee',
  BODY_MEASUREMENT_NAME_CALF: 'calf',
  BODY_MEASUREMENT_NAME_ANKLE: 'ankle',
  BODY_MEASUREMENT_NAME_HPS_TO_WAIST_FRONT: 'hps to waist (front)',
  BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST: 'cb neck to waist',
  BODY_MEASUREMENT_NAME_ACROSS_FRONT: 'across front',
  BODY_MEASUREMENT_NAME_ACROSS_BACK: 'across back',
  BODY_MEASUREMENT_NAME_HPS_HEIGHT: 'hps height',
  BODY_MEASUREMENT_NAME_CF_NECK_TO_WAIST: 'cf neck to waist',
  BODY_MEASUREMENT_NAME_WAIST_HEIGHT: 'waist height',
  BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP: 'waist to high hip',
  BODY_MEASUREMENT_NAME_WAIST_TO_HIP: 'waist to hip',
  BODY_MEASUREMENT_NAME_CHEST_DEPTH: 'chest depth',
  BODY_MEASUREMENT_NAME_WAIST_DEPTH: 'waist depth',
  BODY_MEASUREMENT_NAME_HIP_DEPTH: 'hip depth',
  BODY_MEASUREMENT_NAME_SHOULDER_LENGTH: 'shoulder length',
  BODY_MEASUREMENT_NAME_SHOULDER_DROP: 'shoulder drop',
  BODY_MEASUREMENT_NAME_ARMSCYE_DEPTH: 'armscye depth',
  BODY_MEASUREMENT_NAME_ARMSCYE_CIRCUMFERENCE: 'armscye circumference',
  BODY_MEASUREMENT_NAME_BUST_APEX_TO_APEX: 'bust apex to apex',
  BODY_MEASUREMENT_NAME_HPS_TO_BUST_APEX: 'hps to bust apex',
} satisfies Partial<Record<common_BodyMeasurementName, string>>);

const LIMB_MEASUREMENT_KEYS = Object.freeze({
  BODY_MEASUREMENT_NAME_BICEP: 'bicepCircumferenceMm',
  BODY_MEASUREMENT_NAME_WRIST: 'wristCircumferenceMm',
  BODY_MEASUREMENT_NAME_THIGH: 'thighCircumferenceMm',
  BODY_MEASUREMENT_NAME_CALF: 'calfCircumferenceMm',
  BODY_MEASUREMENT_NAME_ANKLE: 'ankleCircumferenceMm',
} satisfies Partial<Record<common_BodyMeasurementName, OpenReferenceLimbCircumferenceKeyV1>>);

type Vec3 = readonly [number, number, number];

function result(
  measurementName: common_BodyMeasurementName,
  status: MeasurementSurfaceMeasurementGuideStatusV1,
  paths: readonly MeasurementSurfaceMeasurementGuidePathV1[] = [],
): MeasurementSurfaceActiveMeasurementGuideV1 {
  return Object.freeze({
    version: MEASUREMENT_SURFACE_ACTIVE_MEASUREMENT_GUIDE_V1,
    measurementName,
    label: LABELS[measurementName as keyof typeof LABELS] ?? 'measurement',
    status,
    paths: Object.freeze([...paths]),
    claims: CLAIMS,
  });
}

/**
 * Fields whose line reads only from the back, the side (owner-approved mockup, variant C) or the
 * back-left three-quarter view (side-seam tapes: from the side an arm hangs over the seam, from the
 * front a forward arm does; from behind on the left neither does).
 */
const FIELD_VIEWS = Object.freeze({
  BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST: 'back',
  BODY_MEASUREMENT_NAME_ACROSS_BACK: 'back',
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 'back',
  BODY_MEASUREMENT_NAME_CHEST_DEPTH: 'side',
  BODY_MEASUREMENT_NAME_WAIST_DEPTH: 'side',
  BODY_MEASUREMENT_NAME_HIP_DEPTH: 'side',
  BODY_MEASUREMENT_NAME_ARMSCYE_DEPTH: 'back',
  BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP: 'back-three-quarter',
  BODY_MEASUREMENT_NAME_WAIST_TO_HIP: 'back-three-quarter',
} satisfies Partial<Record<common_BodyMeasurementName, MeasurementSurfaceMeasurementGuideViewV1>>);

export function measurementSurfaceMeasurementGuideViewV1(
  measurementName: common_BodyMeasurementName,
): MeasurementSurfaceMeasurementGuideViewV1 | undefined {
  return FIELD_VIEWS[measurementName as keyof typeof FIELD_VIEWS];
}

function withView(
  guide: MeasurementSurfaceActiveMeasurementGuideV1,
): MeasurementSurfaceActiveMeasurementGuideV1 {
  const view = measurementSurfaceMeasurementGuideViewV1(guide.measurementName);
  if (!view || (guide.status !== 'visible' && guide.status !== 'limited')) return guide;
  return Object.freeze({ ...guide, view });
}

function airPath<T extends MeasurementSurfaceMeasurementGuidePathV1 | null>(
  path: T,
  air: MeasurementSurfaceMeasurementGuideAirV1,
): T {
  return (path ? Object.freeze({ ...path, air }) : null) as T;
}

function landmark(frame: MeasurementBodyFrameV2, id: string): Vec3 | null {
  return frame.landmarks.find((candidate) => candidate.id === id)?.positionM ?? null;
}

function station(frame: MeasurementBodyFrameV2, id: 'chest' | 'waist' | 'hip' | 'shoulder') {
  return frame.torsoStations.find((candidate) => candidate.id === id) ?? null;
}

function nearestVertex(positionsM: Float32Array, point: Vec3): number {
  let bestVertex = -1;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  for (let vertex = 0; vertex < positionsM.length / 3; vertex += 1) {
    const offset = vertex * 3;
    const x = positionsM[offset] - point[0];
    const y = positionsM[offset + 1] - point[1];
    const z = positionsM[offset + 2] - point[2];
    const distanceSquared = x * x + y * y + z * z;
    if (distanceSquared < bestDistanceSquared) {
      bestVertex = vertex;
      bestDistanceSquared = distanceSquared;
    }
  }
  return bestVertex;
}

function vertexPath(
  id: string,
  mesh: MeasurementSurfaceMeshV1,
  pointsM: readonly Vec3[],
  closed: boolean,
): MeasurementSurfaceMeasurementGuidePathV1 | null {
  const vertexIndices = pointsM
    .map((point) => nearestVertex(mesh.positions, point))
    .filter((vertex, index, all) => vertex >= 0 && vertex !== all[index - 1]);
  if (closed && vertexIndices.at(-1) === vertexIndices[0]) vertexIndices.pop();
  const minimum = closed ? 3 : 2;
  if (new Set(vertexIndices).size < minimum) return null;
  return Object.freeze({
    id,
    closed,
    source: 'mesh-vertices' as const,
    vertexIndices: Object.freeze(vertexIndices),
  });
}

function sectionPath(options: {
  readonly id: string;
  readonly mesh: MeasurementSurfaceMeshV1;
  readonly originM: Vec3;
  readonly normal: Vec3;
  readonly seedM?: Vec3;
  readonly bindToMesh: boolean;
}): MeasurementSurfaceMeasurementGuidePathV1 | null {
  const loop = sectionLoop(options);
  if (!loop) return null;
  return pathFromSectionLoop(options.id, options.mesh, loop, options.bindToMesh);
}

function sectionLoop(options: {
  readonly mesh: MeasurementSurfaceMeshV1;
  readonly originM: Vec3;
  readonly normal: Vec3;
  readonly seedM?: Vec3;
}): MeshPlaneSectionLoopV1 | null {
  const section = planeSection(
    options.mesh,
    options.originM,
    options.normal,
    options.seedM ?? options.originM,
  );
  if (!section.ok || !section.selectedLoop) return null;
  return section.selectedLoop;
}

let planeDistanceScratch = new Float64Array(0);

/**
 * A plane section of the mesh, handed only the triangles the plane can cut: the section walks
 * every triangle it gets, and the scans below cut dozens of planes per focus on a phone.
 */
function planeSection(mesh: MeasurementSurfaceMeshV1, originM: Vec3, normal: Vec3, seedM?: Vec3) {
  const { positions, indices } = mesh;
  const vertexCount = Math.floor(positions.length / 3);
  if (planeDistanceScratch.length < vertexCount)
    planeDistanceScratch = new Float64Array(vertexCount);
  const distances = planeDistanceScratch;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const offset = vertex * 3;
    distances[vertex] =
      (positions[offset] - originM[0]) * normal[0] +
      (positions[offset + 1] - originM[1]) * normal[1] +
      (positions[offset + 2] - originM[2]) * normal[2];
  }
  const tolerance = 1e-6 * Math.hypot(...normal);
  const crossing: number[] = [];
  for (let corner = 0; corner + 2 < indices.length; corner += 3) {
    const a = indices[corner];
    const b = indices[corner + 1];
    const c = indices[corner + 2];
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount) continue;
    const da = distances[a];
    const db = distances[b];
    const dc = distances[c];
    if (Math.min(da, db, dc) <= tolerance && Math.max(da, db, dc) >= -tolerance) {
      crossing.push(a, b, c);
    }
  }
  return measureMeshPlaneSectionPerimetersV1({
    positionsM: positions,
    triangleIndices: Uint32Array.from(crossing),
    planeOriginM: originM,
    planeNormal: normal,
    ...(seedM ? { selection: { kind: 'nearest-seed' as const, seedM } } : {}),
    policy: { weldToleranceM: 0.00002 },
  });
}

const GUIDE_SURFACE_OFFSET_M = 0.002;

function offsetLoopPointsM(loop: MeshPlaneSectionLoopV1): readonly Vec3[] {
  return loop.pointsM.map((point) => {
    const radial = subtract(point, loop.centroidM);
    const length = Math.hypot(...radial);
    if (length <= Number.EPSILON) return point;
    const scale = GUIDE_SURFACE_OFFSET_M / length;
    return [
      point[0] + radial[0] * scale,
      point[1] + radial[1] * scale,
      point[2] + radial[2] * scale,
    ] as const;
  });
}

function pathFromSectionLoop(
  id: string,
  mesh: MeasurementSurfaceMeshV1,
  loop: MeshPlaneSectionLoopV1,
  bindToMesh: boolean,
): MeasurementSurfaceMeasurementGuidePathV1 | null {
  return bindToMesh
    ? vertexPath(id, mesh, loop.pointsM, true)
    : fixedPath(id, offsetLoopPointsM(loop), true);
}

/** Lift of a mesh-bound line off the skin (the stage's MESH_VERTEX_LIFT_M). */
const BOUND_LINE_LIFT_M = 0.002;

/**
 * Whether `point` lies inside the closed `mesh`: two of three axis rays (+z, -z, +y) cross its
 * surface an odd number of times. `alongZ` / `alongY` are the triangles that can meet those rays.
 */
function insideClosedMesh(
  mesh: MeasurementSurfaceMeshV1,
  alongZ: readonly number[],
  alongY: readonly number[],
  point: Vec3,
): boolean {
  const { positions, indices } = mesh;
  const crossings = (triangles: readonly number[], axis: 1 | 2, sign: 1 | -1) => {
    const [u, v] = axis === 2 ? [0, 1] : [0, 2];
    let count = 0;
    for (const triangle of triangles) {
      const a = indices[triangle * 3] * 3;
      const b = indices[triangle * 3 + 1] * 3;
      const c = indices[triangle * 3 + 2] * 3;
      const det =
        (positions[b + u] - positions[a + u]) * (positions[c + v] - positions[a + v]) -
        (positions[c + u] - positions[a + u]) * (positions[b + v] - positions[a + v]);
      if (Math.abs(det) < 1e-14) continue;
      const pu = point[u] - positions[a + u];
      const pv = point[v] - positions[a + v];
      const wb =
        (pu * (positions[c + v] - positions[a + v]) - (positions[c + u] - positions[a + u]) * pv) /
        det;
      const wc =
        ((positions[b + u] - positions[a + u]) * pv - pu * (positions[b + v] - positions[a + v])) /
        det;
      if (wb < 0 || wc < 0 || wb + wc > 1) continue;
      const hit =
        positions[a + axis] * (1 - wb - wc) + positions[b + axis] * wb + positions[c + axis] * wc;
      if ((hit - point[axis]) * sign > 0) count += 1;
    }
    return count % 2 === 1;
  };
  const votes =
    Number(crossings(alongZ, 2, 1)) +
    Number(crossings(alongZ, 2, -1)) +
    Number(crossings(alongY, 1, 1));
  return votes >= 2;
}

/**
 * A closed loop bound to vertices of the rest body, drawn on the posed one, keeps only its longest
 * stretch the pose leaves on the skin. A lowered arm folds the armpit shut: the tape there lies
 * inside the fold, hidden in every view, so the line stops at the fold instead of running through
 * the body.
 */
function withoutPoseBuriedRun(
  path: MeasurementSurfaceMeasurementGuidePathV1,
  drawnMesh: MeasurementSurfaceMeshV1,
): MeasurementSurfaceMeasurementGuidePathV1 {
  if (path.source !== 'mesh-vertices' || !path.closed) return path;
  const vertices = path.vertexIndices;
  const { positions, indices } = drawnMesh;
  const count = vertices.length;
  if (count < 3 || vertices.some((vertex) => vertex * 3 + 2 >= positions.length)) return path;

  // Smooth normals of the loop's vertices on the posed body, as the stage lifts them.
  const loopSlot = new Map<number, number>();
  vertices.forEach((vertex, slot) => loopSlot.set(vertex, slot));
  const normals = new Float64Array(count * 3);
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const vertex of vertices) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], positions[vertex * 3 + axis] - 0.01);
      maximum[axis] = Math.max(maximum[axis], positions[vertex * 3 + axis] + 0.01);
    }
  }
  const alongZ: number[] = [];
  const alongY: number[] = [];
  for (let triangle = 0; triangle * 3 + 2 < indices.length; triangle += 1) {
    const corners = [indices[triangle * 3], indices[triangle * 3 + 1], indices[triangle * 3 + 2]];
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    for (const corner of corners) {
      for (let axis = 0; axis < 3; axis += 1) {
        low[axis] = Math.min(low[axis], positions[corner * 3 + axis]);
        high[axis] = Math.max(high[axis], positions[corner * 3 + axis]);
      }
    }
    const overlaps = (axis: number) => low[axis] <= maximum[axis] && high[axis] >= minimum[axis];
    if (overlaps(0) && overlaps(1)) alongZ.push(triangle);
    if (overlaps(0) && overlaps(2) && high[1] >= minimum[1]) alongY.push(triangle);
    if (!corners.some((corner) => loopSlot.has(corner))) continue;
    const [a, b, c] = corners.map((corner) => vertexPositionM(drawnMesh, corner));
    const face = cross(subtract(b, a), subtract(c, a));
    for (const corner of corners) {
      const slot = loopSlot.get(corner);
      if (slot === undefined) continue;
      for (let axis = 0; axis < 3; axis += 1) normals[slot * 3 + axis] += face[axis];
    }
  }
  const lifted = vertices.map((vertex, slot): Vec3 => {
    const point = vertexPositionM(drawnMesh, vertex);
    const normal: Vec3 = [normals[slot * 3], normals[slot * 3 + 1], normals[slot * 3 + 2]];
    const length = Math.hypot(...normal);
    return length > 1e-12
      ? [
          point[0] + (normal[0] / length) * BOUND_LINE_LIFT_M,
          point[1] + (normal[1] / length) * BOUND_LINE_LIFT_M,
          point[2] + (normal[2] / length) * BOUND_LINE_LIFT_M,
        ]
      : point;
  });
  const inside = (point: Vec3) => insideClosedMesh(drawnMesh, alongZ, alongY, point);
  const vertexBuried = lifted.map(inside);
  // Segment `slot` runs from loop vertex `slot` to the next one.
  const segmentBuried = lifted.map(
    (start, slot) =>
      vertexBuried[slot] ||
      vertexBuried[(slot + 1) % count] ||
      [0.25, 0.5, 0.75].some((t) => inside(mix(start, lifted[(slot + 1) % count], t))),
  );
  if (!segmentBuried.some(Boolean) || segmentBuried.every(Boolean)) return path;

  // Longest circular run of segments left on the skin.
  let best = { start: 0, length: 0 };
  for (let start = 0; start < count; start += 1) {
    if (segmentBuried[start] || !segmentBuried[(start + count - 1) % count]) continue;
    let length = 0;
    while (length < count && !segmentBuried[(start + length) % count]) length += 1;
    if (length > best.length) best = { start, length };
  }
  return Object.freeze({
    id: path.id,
    closed: false,
    source: 'mesh-vertices' as const,
    vertexIndices: Object.freeze(
      Array.from({ length: best.length + 1 }, (_, step) => vertices[(best.start + step) % count]),
    ),
  });
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

interface LoopAnchor {
  readonly segment: number;
  readonly t: number;
  readonly pointM: Vec3;
}

function loopCoordinateAnchor(
  pointsM: readonly Vec3[],
  coordinate: 0 | 1 | 2,
  value: number,
  zSide: -1 | 1,
): LoopAnchor | null {
  const candidates: LoopAnchor[] = [];
  for (let segment = 0; segment < pointsM.length; segment += 1) {
    const start = pointsM[segment];
    const end = pointsM[(segment + 1) % pointsM.length];
    const delta = end[coordinate] - start[coordinate];
    if (Math.abs(delta) <= Number.EPSILON) continue;
    const t = (value - start[coordinate]) / delta;
    if (t < -1e-9 || t > 1 + 1e-9) continue;
    candidates.push({
      segment,
      t: Math.min(1, Math.max(0, t)),
      pointM: mix(start, end, Math.min(1, Math.max(0, t))),
    });
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((best, candidate) =>
    zSide * candidate.pointM[2] > zSide * best.pointM[2] ? candidate : best,
  );
}

function dedupeAdjacentPoints(pointsM: readonly Vec3[]): readonly Vec3[] {
  return pointsM.filter((point, index) => {
    const previous = pointsM[index - 1];
    return !previous || Math.hypot(...subtract(point, previous)) > 1e-9;
  });
}

function forwardLoopArc(
  pointsM: readonly Vec3[],
  start: LoopAnchor,
  end: LoopAnchor,
): readonly Vec3[] {
  if (start.segment === end.segment && end.t >= start.t) {
    return dedupeAdjacentPoints([start.pointM, end.pointM]);
  }
  const result: Vec3[] = [start.pointM];
  let segment = start.segment;
  for (let traversed = 0; traversed <= pointsM.length; traversed += 1) {
    result.push(pointsM[(segment + 1) % pointsM.length]);
    segment = (segment + 1) % pointsM.length;
    if (segment === end.segment) {
      result.push(end.pointM);
      return dedupeAdjacentPoints(result);
    }
  }
  return [];
}

function selectSidedLoopArc(
  pointsM: readonly Vec3[],
  start: LoopAnchor,
  end: LoopAnchor,
  zSide: -1 | 1,
): readonly Vec3[] {
  const forward = forwardLoopArc(pointsM, start, end);
  const backward = [...forwardLoopArc(pointsM, end, start)].reverse();
  const sideScore = (points: readonly Vec3[]) =>
    points.reduce((minimum, point) => Math.min(minimum, zSide * point[2]), Infinity);
  return sideScore(forward) >= sideScore(backward) ? forward : backward;
}

function offsetSectionPolylinePointsM(
  pointsM: readonly Vec3[],
  planeNormal: Vec3,
  zSide: -1 | 1,
): readonly Vec3[] {
  return pointsM.map((point, index) => {
    const previous = pointsM[Math.max(0, index - 1)];
    const next = pointsM[Math.min(pointsM.length - 1, index + 1)];
    const tangent = subtract(next, previous);
    let normal = cross(planeNormal, tangent);
    const length = Math.hypot(...normal);
    if (length <= Number.EPSILON) return point;
    normal = [normal[0] / length, normal[1] / length, normal[2] / length];
    if (zSide * normal[2] < 0) {
      normal = [-normal[0], -normal[1], -normal[2]];
    }
    return [
      point[0] + normal[0] * GUIDE_SURFACE_OFFSET_M,
      point[1] + normal[1] * GUIDE_SURFACE_OFFSET_M,
      point[2] + normal[2] * GUIDE_SURFACE_OFFSET_M,
    ];
  });
}

function sidedSectionArcPath(options: {
  readonly id: string;
  readonly mesh: MeasurementSurfaceMeshV1;
  readonly originM: Vec3;
  readonly normal: Vec3;
  readonly seedM: Vec3;
  readonly coordinate: 0 | 1 | 2;
  readonly startValue: number;
  readonly endValue: number;
  readonly zSide: -1 | 1;
  readonly bindToMesh: boolean;
}): MeasurementSurfaceMeasurementGuidePathV1 | null {
  const loop = sectionLoop(options);
  if (!loop) return null;
  const start = loopCoordinateAnchor(
    loop.pointsM,
    options.coordinate,
    options.startValue,
    options.zSide,
  );
  const end = loopCoordinateAnchor(
    loop.pointsM,
    options.coordinate,
    options.endValue,
    options.zSide,
  );
  if (!start || !end) return null;
  const pointsM = selectSidedLoopArc(loop.pointsM, start, end, options.zSide);
  if (pointsM.length < 2) return null;
  return options.bindToMesh
    ? vertexPath(options.id, options.mesh, pointsM, false)
    : fixedPath(options.id, offsetSectionPolylinePointsM(pointsM, options.normal, options.zSide));
}

function segmentExtremumSectionPath(options: {
  readonly id: string;
  readonly mesh: MeasurementSurfaceMeshV1;
  readonly aM: Vec3;
  readonly bM: Vec3;
  readonly range: readonly [number, number];
  readonly select: 'minimum' | 'maximum';
  readonly bindToMesh: boolean;
  /**
   * Walk one limb: stop where the section leaves the last loop or the hand parts into fingers,
   * then re-cut the narrowest loop square to the limb itself (wrist: the frame axis can overshoot
   * the arm, and a finger is the smallest loop of all).
   */
  readonly followLimb?: boolean;
  readonly samples?: number;
}): MeasurementSurfaceMeasurementGuidePathV1 | null {
  const normal = subtract(options.bM, options.aM);
  const samples = options.samples ?? 9;
  if (options.followLimb) {
    const loop = narrowestLimbLoop(options.mesh, options.aM, options.bM, options.range, samples);
    return loop ? pathFromSectionLoop(options.id, options.mesh, loop, options.bindToMesh) : null;
  }
  const loops: MeshPlaneSectionLoopV1[] = [];
  for (let index = 0; index < samples; index += 1) {
    const t = options.range[0] + ((options.range[1] - options.range[0]) * index) / (samples - 1);
    const originM = mix(options.aM, options.bM, t);
    const section = planeSection(options.mesh, originM, normal, originM);
    if (section.ok && section.selectedLoop) loops.push(section.selectedLoop);
  }
  if (loops.length === 0) return null;
  const selected = loops.reduce((best, candidate) => {
    const candidateWins =
      options.select === 'maximum'
        ? candidate.perimeterM > best.perimeterM
        : candidate.perimeterM < best.perimeterM;
    return candidateWins ? candidate : best;
  });
  return pathFromSectionLoop(options.id, options.mesh, selected, options.bindToMesh);
}

/** A section counts as the same limb while it moves this little and keeps 4/5 of its girth. */
const LIMB_JUMP_M = 0.025;
const LIMB_GIRTH_KEPT = 0.8;

function sameLimb(
  previous: MeshPlaneSectionLoopV1 | undefined,
  loop: MeshPlaneSectionLoopV1,
  stepM: number,
): boolean {
  if (!previous) return true;
  const jump = Math.hypot(...subtract(loop.centroidM, previous.centroidM));
  return (
    jump <= 2 * stepM + LIMB_JUMP_M && loop.perimeterM >= LIMB_GIRTH_KEPT * previous.perimeterM
  );
}

function narrowestLimbLoop(
  mesh: MeasurementSurfaceMeshV1,
  aM: Vec3,
  bM: Vec3,
  range: readonly [number, number],
  samples: number,
): MeshPlaneSectionLoopV1 | null {
  const axis = subtract(bM, aM);
  const stepM = (Math.hypot(...axis) * (range[1] - range[0])) / (samples - 1);
  const walked: MeshPlaneSectionLoopV1[] = [];
  for (let index = 0; index < samples; index += 1) {
    const originM = mix(aM, bM, range[0] + ((range[1] - range[0]) * index) / (samples - 1));
    const section = planeSection(mesh, originM, axis, originM);
    const loop = section.ok ? section.selectedLoop : null;
    if (!loop) {
      if (walked.length > 0) break;
      continue;
    }
    if (!sameLimb(walked.at(-1), loop, stepM)) break;
    walked.push(loop);
  }
  if (walked.length === 0) return null;
  let narrowest = 0;
  walked.forEach((loop, index) => {
    if (loop.perimeterM < walked[narrowest].perimeterM) narrowest = index;
  });
  // The limb's own axis through the narrowest loop, from the centroids around it.
  const before = walked[Math.max(0, narrowest - 3)].centroidM;
  const after = walked[Math.min(walked.length - 1, narrowest + 3)].centroidM;
  const limbAxis = subtract(after, before);
  const limbLength = Math.hypot(...limbAxis);
  if (limbLength < 0.005) return walked[narrowest];
  const unit: Vec3 = [limbAxis[0] / limbLength, limbAxis[1] / limbLength, limbAxis[2] / limbLength];
  const center = walked[narrowest].centroidM;
  let best: MeshPlaneSectionLoopV1 | null = null;
  for (let offset = -4; offset <= 4; offset += 1) {
    const originM: Vec3 = [
      center[0] + unit[0] * offset * 0.005,
      center[1] + unit[1] * offset * 0.005,
      center[2] + unit[2] * offset * 0.005,
    ];
    const section = planeSection(mesh, originM, unit, originM);
    const loop = section.ok ? section.selectedLoop : null;
    if (!loop || Math.hypot(...subtract(loop.centroidM, originM)) > LIMB_JUMP_M) continue;
    if (!best || loop.perimeterM < best.perimeterM) best = loop;
  }
  return best ?? walked[narrowest];
}

function torsoSectionPath(options: {
  readonly id: string;
  readonly mesh: MeasurementSurfaceMeshV1;
  readonly yM: number;
  readonly bindToMesh: boolean;
}): MeasurementSurfaceMeasurementGuidePathV1 | null {
  return sectionPath({
    id: options.id,
    mesh: options.mesh,
    originM: [0, options.yM, 0],
    normal: [0, 1, 0],
    bindToMesh: options.bindToMesh,
  });
}

function fixedPath(
  id: string,
  pointsM: readonly Vec3[],
  closed = false,
): MeasurementSurfaceMeasurementGuidePathV1 {
  return Object.freeze({
    id,
    closed,
    source: 'fixed-points' as const,
    pointsM: Object.freeze(pointsM.map((point) => Object.freeze([...point]) as Vec3)),
  });
}

/** A point of a straight guide and the vertex each of its coordinates rides on. */
interface PlacedPoint {
  readonly pointM: Vec3;
  readonly axisVertices: readonly [number, number, number];
}

function onVertex(vertex: number, pointM: Vec3): PlacedPoint {
  return { pointM, axisVertices: [vertex, vertex, vertex] };
}

/**
 * Straight guide lines placed from body points: fixed points on the neutral body; on a posed body
 * every coordinate rides the vertex it was placed from, so the line follows the pose live.
 */
function placedPath(
  id: string,
  mesh: MeasurementSurfaceMeshV1,
  points: readonly PlacedPoint[],
  bindToMesh: boolean,
): MeasurementSurfaceMeasurementGuidePathV1 {
  if (!bindToMesh)
    return fixedPath(
      id,
      points.map(({ pointM }) => pointM),
    );
  return Object.freeze({
    id,
    closed: false,
    source: 'mesh-offset-points' as const,
    points: Object.freeze(
      points.map(({ pointM, axisVertices }) =>
        Object.freeze({
          axisVertices: Object.freeze([...axisVertices] as [number, number, number]),
          offsetM: Object.freeze(
            [0, 1, 2].map(
              (axis) => pointM[axis] - mesh.positions[axisVertices[axis] * 3 + axis],
            ) as [number, number, number],
          ),
        }),
      ),
    ),
  });
}

function vertexPositionM(mesh: MeasurementSurfaceMeshV1, vertex: number): Vec3 {
  const offset = vertex * 3;
  return [mesh.positions[offset], mesh.positions[offset + 1], mesh.positions[offset + 2]];
}

/** The vertex with the largest (or smallest) coordinate on `axis` among those `accept` admits. */
function extremeVertex(
  mesh: MeasurementSurfaceMeshV1,
  axis: 0 | 1 | 2,
  sign: 1 | -1,
  accept: (x: number, y: number, z: number) => boolean = () => true,
): number {
  let best = -1;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let offset = 0; offset < mesh.positions.length; offset += 3) {
    const x = mesh.positions[offset];
    const y = mesh.positions[offset + 1];
    const z = mesh.positions[offset + 2];
    if (!accept(x, y, z)) continue;
    const value = sign * mesh.positions[offset + axis];
    if (value > bestValue) {
      best = offset / 3;
      bestValue = value;
    }
  }
  return best;
}

interface BodyLinePoint {
  readonly pointM: Vec3;
  /** Horizontal outward direction of the skin at the point (radial from the section centroid). */
  readonly outwardM: Vec3;
}

/** Levels from `fromY` towards `toY`, both included, at most `stepM` apart. */
function levelsBetween(fromY: number, toY: number, stepM: number): number[] {
  const count = Math.max(2, Math.ceil(Math.abs(toY - fromY) / stepM) + 1);
  return Array.from({ length: count }, (_, index) => fromY + ((toY - fromY) * index) / (count - 1));
}

/**
 * A tape laid down the body: in every horizontal section at `levels` the point of the loop that
 * lies furthest along `direction` (x, z). The first level takes the loop nearest `startSeedM`;
 * every next level the loop that passes closest to the last point, so the line walks from the
 * torso onto the left leg and never jumps to a hand or the other leg.
 */
function bodyLinePointsM(options: {
  readonly mesh: MeasurementSurfaceMeshV1;
  readonly levels: readonly number[];
  readonly startSeedM: Vec3;
  readonly direction: readonly [number, number];
}): readonly BodyLinePoint[] | null {
  const { mesh, levels, startSeedM, direction } = options;
  const points: BodyLinePoint[] = [];
  let previous: Vec3 | null = null;
  for (let index = 0; index < levels.length; index += 1) {
    const yM = levels[index];
    const section = planeSection(mesh, [0, yM, 0], [0, 1, 0]);
    if (!section.ok || section.loops.length === 0) return null;
    const from: Vec3 | null = previous;
    const distanceTo = (loop: MeshPlaneSectionLoopV1): number =>
      from
        ? Math.min(...loop.pointsM.map((point) => Math.hypot(...subtract(point, from))))
        : Math.hypot(...subtract(loop.centroidM, [startSeedM[0], yM, startSeedM[2]]));
    const loop = section.loops.reduce((best: MeshPlaneSectionLoopV1, candidate) =>
      distanceTo(candidate) < distanceTo(best) ? candidate : best,
    );
    // A step longer than the level spacing allows means the body parted under the line.
    if (from && distanceTo(loop) > 3 * Math.abs(yM - levels[index - 1]) + 0.01) return null;
    let best: Vec3 | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const point of loop.pointsM as readonly Vec3[]) {
      const along = point[0] * direction[0] + point[2] * direction[1];
      // Kept near the last point: it moves only where the body turns further along `direction`,
      // never across a toe or a fold.
      const score = along - (from ? 0.8 * Math.hypot(point[0] - from[0], point[2] - from[2]) : 0);
      if (score > bestScore) {
        best = point;
        bestScore = score;
      }
    }
    if (!best) return null;
    const radial = subtract(best, loop.centroidM);
    const length = Math.hypot(radial[0], radial[2]);
    if (length <= Number.EPSILON) return null;
    points.push({ pointM: best, outwardM: [radial[0] / length, 0, radial[2] / length] });
    previous = best;
  }
  return points.length >= 2 ? points : null;
}

/** A tape on the body: 2 mm off the skin, or bound to the vertices of a posed body. */
function bodyLinePath(
  id: string,
  mesh: MeasurementSurfaceMeshV1,
  line: readonly BodyLinePoint[],
  bindToMesh: boolean,
): MeasurementSurfaceMeasurementGuidePathV1 | null {
  if (bindToMesh) {
    return vertexPath(
      id,
      mesh,
      line.map(({ pointM }) => pointM),
      false,
    );
  }
  return fixedPath(
    id,
    line.map(({ pointM, outwardM }) => [
      pointM[0] + outwardM[0] * GUIDE_SURFACE_OFFSET_M,
      pointM[1],
      pointM[2] + outwardM[2] * GUIDE_SURFACE_OFFSET_M,
    ]),
  );
}

/** The left (+x) side seam from the waist plane down to `toY`, on the torso then the leg. */
function sideSeamPath(
  id: string,
  mesh: MeasurementSurfaceMeshV1,
  fromY: number,
  toY: number,
  bindToMesh: boolean,
): MeasurementSurfaceMeasurementGuidePathV1 | null {
  const line = bodyLinePointsM({
    mesh,
    levels: levelsBetween(fromY, toY, 0.01),
    startSeedM: [0, fromY, 0],
    direction: [1, 0],
  });
  return line ? bodyLinePath(id, mesh, line, bindToMesh) : null;
}

const RULER_CLEARANCE_M = 0.05;
/** Behind the heel: arms that hang forward (a stored pose) never reach the ruler there. */
const RULER_BEHIND_HEEL_M = 0.07;

/**
 * A floor-to-point ruler standing beside and behind the left foot: from the outer edge of the sole
 * along the floor to the ruler, up to just above the point, then a level plate that touches the
 * point. On a posed body every coordinate rides a vertex, so the ruler follows the body.
 */
function floorRulerPath(
  id: string,
  mesh: MeasurementSurfaceMeshV1,
  target: PlacedPoint,
  bindToMesh: boolean,
): MeasurementSurfaceMeasurementGuidePathV1 | null {
  const lowest = extremeVertex(mesh, 1, -1);
  if (lowest < 0) return null;
  const floorY = vertexPositionM(mesh, lowest)[1];
  // The outer edge of the left sole, the widest point of the left lower leg (beside it the ruler
  // stands clear of the body) and the back of the left heel.
  const sole = extremeVertex(mesh, 0, 1, (x, y) => x > 0 && y < floorY + 0.02);
  const shin = extremeVertex(mesh, 0, 1, (x, y) => x > 0 && y < floorY + 0.5);
  const heel = extremeVertex(mesh, 2, -1, (x, y) => x > 0 && y < floorY + 0.1);
  if (sole < 0 || shin < 0 || heel < 0) return null;
  const soleM = vertexPositionM(mesh, sole);
  const rulerX = vertexPositionM(mesh, shin)[0] + RULER_CLEARANCE_M;
  const rulerZ = vertexPositionM(mesh, heel)[2] - RULER_BEHIND_HEEL_M;
  const lineY = floorY + GUIDE_SURFACE_OFFSET_M;
  const topY = target.pointM[1] + GUIDE_SURFACE_OFFSET_M;
  if (topY <= lineY + RULER_CLEARANCE_M) return null;
  const [, targetY] = target.axisVertices;
  return placedPath(
    id,
    mesh,
    [
      {
        pointM: [soleM[0] + GUIDE_SURFACE_OFFSET_M, lineY, soleM[2]],
        axisVertices: [sole, lowest, sole],
      },
      { pointM: [rulerX, lineY, rulerZ], axisVertices: [shin, lowest, heel] },
      { pointM: [rulerX, topY, rulerZ], axisVertices: [shin, targetY, heel] },
      { pointM: [target.pointM[0], topY, target.pointM[2]], axisVertices: target.axisVertices },
    ],
    bindToMesh,
  );
}

function drawnOrUnavailable(
  measurementName: common_BodyMeasurementName,
  status: 'visible' | 'limited',
  paths: readonly (MeasurementSurfaceMeasurementGuidePathV1 | null)[],
) {
  const drawn = paths.filter(
    (path): path is MeasurementSurfaceMeasurementGuidePathV1 => path !== null,
  );
  return drawn.length > 0
    ? result(measurementName, status, drawn)
    : result(measurementName, 'unavailable-section');
}

/** MakeHuman HM08 display topology: every anchor below is a vertex or edge of this mesh. */
const HM08_VERTEX_COUNT = 13_380;
const HM08_INDEX_COUNT = 80_268;

/**
 * Template points the anchor table does not hold yet (probe of the default female/male/neutral
 * display meshes, 17.11). Acromion-L: vertex 8280 sits where the front-view shoulder contour turns
 * down into the arm on all three bases (female 0.253/1.388, male 0.220/1.402, neutral 0.227/1.395
 * m). Bust apex-L: vertex 8454 is the female breast's most anterior vertex; on male and neutral the
 * same vertex is the nipple point 1 cm behind the pectoral maximum. Right points are topology
 * mirrors (1608, 1782).
 */
const GUIDE_TEMPLATE_POINTS = Object.freeze({
  'acromion-l': meshSurfaceVertexPointV1(8280),
  'apex-l': meshSurfaceVertexPointV1(8454),
});

function anchorTemplate(id: SurfaceAnchorIdV1): MeshSurfacePointV1 | null {
  return SURFACE_ANCHOR_TABLE_V1.find((anchor) => anchor.id === id)?.template ?? null;
}

interface GuideAnchor {
  readonly point: MeshSurfacePointV1;
  readonly positionM: Vec3;
}

interface GuideBodyAnchors {
  readonly topology: MeshSurfaceTopologyV1;
  readonly ssn: GuideAnchor;
  readonly c7: GuideAnchor;
  readonly hpsL: GuideAnchor;
  readonly hpsR: GuideAnchor;
  readonly underarmL: GuideAnchor;
  readonly crotch: GuideAnchor;
  readonly acromionL: GuideAnchor;
  readonly acromionR: GuideAnchor;
  readonly apexL: GuideAnchor;
  readonly apexR: GuideAnchor;
}

function surfacePointPositionM(point: MeshSurfacePointV1, positionsM: Float32Array): Vec3 {
  if (point.kind === 'vertex') {
    const offset = point.vertex * 3;
    return [positionsM[offset], positionsM[offset + 1], positionsM[offset + 2]];
  }
  const a = point.a * 3;
  const b = point.b * 3;
  return [
    positionsM[a] + (positionsM[b] - positionsM[a]) * point.t,
    positionsM[a + 1] + (positionsM[b + 1] - positionsM[a + 1]) * point.t,
    positionsM[a + 2] + (positionsM[b + 2] - positionsM[a + 2]) * point.t,
  ];
}

/**
 * The topology's mirror map needs exact float symmetry. Shaped HM08 bodies are symmetric by
 * construction but carry float drift: some midline vertices sit up to 0.11 mm off x = 0 and rare
 * left/right pairs differ by 1e-10 m. The topology is built from a copy with every drifted pair put
 * back on its exact mirror (a pure function of the positions, so anchors never depend on what was
 * built before); a body that is not symmetric within a millimetre gets no anchors. Paths are still
 * traced on the mesh's own positions.
 */
function mirrorSnappedPositions(positionsM: Float32Array): Float32Array | null {
  const snapped = snapMeshMirrorPairsV1(positionsM);
  return snapped.ok ? snapped.positionsM : null;
}

/** The engine's shoulder chord on an HM08 mesh, `+x` (positive) end first; else null. */
function shoulderChordPath(
  id: string,
  mesh: MeasurementSurfaceMeshV1,
  vertices: Readonly<{ negative: number; positive: number }> | undefined,
): MeasurementSurfaceMeasurementGuidePathV1 | null {
  if (!vertices || mesh.positions.length !== HM08_VERTEX_COUNT * 3) return null;
  const { negative, positive } = vertices;
  const valid = (vertex: number) =>
    Number.isInteger(vertex) && vertex >= 0 && vertex < HM08_VERTEX_COUNT;
  if (!valid(negative) || !valid(positive) || negative === positive) return null;
  return Object.freeze({
    id,
    closed: false,
    source: 'mesh-vertices' as const,
    vertexIndices: Object.freeze([positive, negative]),
  });
}

/** Anchors exist only on the HM08 topology; any other mesh gets no guessed landmark. */
function guideBodyAnchors(mesh: MeasurementSurfaceMeshV1): GuideBodyAnchors | null {
  if (mesh.positions.length !== HM08_VERTEX_COUNT * 3 || mesh.indices.length !== HM08_INDEX_COUNT) {
    return null;
  }
  const symmetricPositionsM = mirrorSnappedPositions(mesh.positions);
  if (!symmetricPositionsM) return null;
  const created = createMeshSurfaceTopologyV1({
    positionsM: symmetricPositionsM,
    triangleIndices: mesh.indices,
  });
  if (!created.ok) return null;
  const topology = created.topology;
  const at = (point: MeshSurfacePointV1 | null): GuideAnchor | null =>
    point ? { point, positionM: surfacePointPositionM(point, mesh.positions) } : null;
  const ssn = at(anchorTemplate('ssn'));
  const c7 = at(anchorTemplate('c7'));
  const hpsL = at(anchorTemplate('hps-l'));
  const hpsR = at(anchorTemplate('hps-r'));
  const underarmL = at(anchorTemplate('underarm-l'));
  const crotch = at(anchorTemplate('crotch'));
  const acromionL = at(GUIDE_TEMPLATE_POINTS['acromion-l']);
  const acromionR = at(mirrorMeshSurfacePointV1(GUIDE_TEMPLATE_POINTS['acromion-l'], topology));
  const apexL = at(GUIDE_TEMPLATE_POINTS['apex-l']);
  const apexR = at(mirrorMeshSurfacePointV1(GUIDE_TEMPLATE_POINTS['apex-l'], topology));
  if (!ssn || !c7 || !hpsL || !hpsR || !underarmL || !crotch) return null;
  if (!acromionL || !acromionR || !apexL || !apexR) return null;
  // Plausibility: left points on +x, shoulder point lateral to and below HPS, apex in front.
  if (
    hpsL.positionM[0] <= 0 ||
    acromionL.positionM[0] <= hpsL.positionM[0] ||
    acromionL.positionM[1] >= hpsL.positionM[1] ||
    acromionL.positionM[1] <= underarmL.positionM[1] ||
    apexL.positionM[1] >= underarmL.positionM[1] ||
    apexL.positionM[2] <= underarmL.positionM[2]
  ) {
    return null;
  }
  return {
    topology,
    ssn,
    c7,
    hpsL,
    hpsR,
    underarmL,
    crotch,
    acromionL,
    acromionR,
    apexL,
    apexR,
  };
}

function surfaceGeodesic(
  anchors: GuideBodyAnchors,
  mesh: MeasurementSurfaceMeshV1,
  start: GuideAnchor,
  end: GuideAnchor,
): MeshSurfacePathV1 | null {
  const geodesic = computeMeshSurfaceGeodesicV1({
    topology: anchors.topology,
    positionsM: mesh.positions,
    triangleIndices: mesh.indices,
    start: start.point,
    end: end.point,
  });
  return geodesic.ok ? geodesic.path : null;
}

function surfacePointNormal(
  point: MeshSurfacePointV1,
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
): Vec3 | null {
  const triangles =
    point.kind === 'vertex'
      ? [...meshSurfaceVertexTrianglesV1(topology, point.vertex)]
      : [...meshSurfaceVertexTrianglesV1(topology, point.a)].filter((triangle) =>
          meshSurfaceVertexTrianglesV1(topology, point.b).includes(triangle),
        );
  let normal: Vec3 = [0, 0, 0];
  for (const triangle of triangles) {
    const corners = [0, 1, 2].map((corner) =>
      surfacePointPositionM(
        meshSurfaceVertexPointV1(topology.triangleIndices[triangle * 3 + corner]),
        positionsM,
      ),
    );
    const face = cross(subtract(corners[1], corners[0]), subtract(corners[2], corners[0]));
    normal = [normal[0] + face[0], normal[1] + face[1], normal[2] + face[2]];
  }
  const length = Math.hypot(...normal);
  return length > Number.EPSILON
    ? [normal[0] / length, normal[1] / length, normal[2] / length]
    : null;
}

/** Joins surface segments end to start; each segment's first point repeats the previous end. */
function joinSurfacePoints(segments: readonly (readonly MeshSurfacePointV1[])[]) {
  return segments.flatMap((points, index) => (index === 0 ? points : points.slice(1)));
}

/**
 * A surface-point path drawn 2 mm off the body along the surface normal (neutral pose) or bound to
 * the nearest edge vertex of every point (posed: follows live positions, slightly coarser).
 */
function surfaceGuidePath(options: {
  readonly id: string;
  readonly anchors: GuideBodyAnchors;
  readonly mesh: MeasurementSurfaceMeshV1;
  readonly points: readonly MeshSurfacePointV1[];
  readonly closed: boolean;
  readonly bindToMesh: boolean;
}): MeasurementSurfaceMeasurementGuidePathV1 | null {
  const { id, anchors, mesh, closed } = options;
  const points =
    closed && options.points.length > 1 && samePoint(options.points[0], options.points.at(-1))
      ? options.points.slice(0, -1)
      : options.points;
  if (options.bindToMesh) {
    const vertexIndices = points
      .map((point) => (point.kind === 'vertex' ? point.vertex : point.t < 0.5 ? point.a : point.b))
      .filter((vertex, index, all) => vertex !== all[index - 1]);
    if (closed && vertexIndices.length > 1 && vertexIndices.at(-1) === vertexIndices[0]) {
      vertexIndices.pop();
    }
    if (new Set(vertexIndices).size < (closed ? 3 : 2)) return null;
    return Object.freeze({
      id,
      closed,
      source: 'mesh-vertices' as const,
      vertexIndices: Object.freeze(vertexIndices),
    });
  }
  const pointsM = dedupeAdjacentPoints(
    points.map((point) => {
      const positionM = surfacePointPositionM(point, mesh.positions);
      const normal = surfacePointNormal(point, anchors.topology, mesh.positions);
      return normal
        ? ([
            positionM[0] + normal[0] * GUIDE_SURFACE_OFFSET_M,
            positionM[1] + normal[1] * GUIDE_SURFACE_OFFSET_M,
            positionM[2] + normal[2] * GUIDE_SURFACE_OFFSET_M,
          ] as const)
        : positionM;
    }),
  );
  if (pointsM.length < (closed ? 3 : 2)) return null;
  return fixedPath(id, pointsM, closed);
}

function samePoint(a: MeshSurfacePointV1 | undefined, b: MeshSurfacePointV1 | undefined): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind === 'vertex'
    ? a.vertex === (b as typeof a).vertex
    : a.a === (b as typeof a).a && a.b === (b as typeof a).b && a.t === (b as typeof a).t;
}

/** Chest plane: bust apex level, kept below the underarm so the arms stay separate loops. */
function anchoredChestY(anchors: GuideBodyAnchors): number {
  const apexY = (anchors.apexL.positionM[1] + anchors.apexR.positionM[1]) / 2;
  return Math.min(apexY, anchors.underarmL.positionM[1] - 0.03);
}

/**
 * Inframammary level: walking down from 3 cm below the apex, the first local minimum of the front
 * surface under the apex (the fold). A flat chest can still rise just under its start (the lower
 * edge of the pectoral); the fold is then the first minimum after the surface turns down, and the
 * start stays the answer only when it never does. Null when the scan finds no fold within 8 cm.
 */
function anchoredUnderBustY(
  anchors: GuideBodyAnchors,
  mesh: MeasurementSurfaceMeshV1,
): number | null {
  const apexX = Math.abs(anchors.apexL.positionM[0]);
  const chestY = anchoredChestY(anchors);
  const frontZ = (yM: number) => {
    const loop = sectionLoop({ mesh, originM: [0, yM, 0], normal: [0, 1, 0] });
    if (!loop) return null;
    const near = loop.pointsM.filter(
      (point) => Math.abs(Math.abs(point[0]) - apexX) < 0.015 && point[2] > loop.centroidM[2],
    );
    return near.length > 0 ? Math.max(...near.map((point) => point[2])) : null;
  };
  let previous: { yM: number; zM: number } | null = null;
  let firstStopY: number | null = null;
  let descended = false;
  for (let step = 3; step <= 9; step += 1) {
    const yM = chestY - step * 0.01;
    const zM = frontZ(yM);
    if (zM === null) return firstStopY;
    if (previous && zM >= previous.zM) {
      if (descended) return previous.yM;
      firstStopY ??= previous.yM;
    } else if (previous) {
      descended = true;
    }
    previous = { yM, zM };
  }
  return firstStopY;
}

function anchoredGuide(options: {
  readonly measurementName: common_BodyMeasurementName;
  readonly frame: MeasurementBodyFrameV2;
  readonly mesh: MeasurementSurfaceMeshV1;
  readonly anchors: GuideBodyAnchors;
  readonly neutralPose: boolean;
  readonly waistY: number | undefined;
  readonly drawnMesh?: MeasurementSurfaceMeshV1;
}): MeasurementSurfaceActiveMeasurementGuideV1 | null {
  const { measurementName, frame, mesh, anchors, neutralPose, waistY, drawnMesh } = options;
  const bindToMesh = !neutralPose;
  const { hpsL, acromionL, underarmL, apexL } = anchors;
  const hps = hpsL.positionM;
  const acromion = acromionL.positionM;
  const underarm = underarmL.positionM;
  const surface = (id: string, points: readonly MeshSurfacePointV1[], closed = false) =>
    surfaceGuidePath({ id, anchors, mesh, points, closed, bindToMesh });
  const geodesic = (start: GuideAnchor, end: GuideAnchor) =>
    surfaceGeodesic(anchors, mesh, start, end);
  const vertexAnchor = (vertex: number): GuideAnchor => ({
    point: meshSurfaceVertexPointV1(vertex),
    positionM: surfacePointPositionM(meshSurfaceVertexPointV1(vertex), mesh.positions),
  });
  const vertexOf = (anchor: GuideAnchor) =>
    anchor.point.kind === 'vertex'
      ? anchor.point.vertex
      : nearestVertex(mesh.positions, anchor.positionM);

  switch (measurementName) {
    case 'BODY_MEASUREMENT_NAME_NECK_BASE': {
      // C7 -> HPS-L -> SSN on the surface, mirrored for the right half. The neck-base shape is not
      // solved, so the ring is a limited guide.
      const back = geodesic(anchors.c7, hpsL);
      const front = geodesic(hpsL, anchors.ssn);
      if (!back || !front) return result(measurementName, 'unavailable-section');
      const backRight = mirrorMeshSurfacePathV1(back, anchors.topology).points;
      const frontRight = mirrorMeshSurfacePathV1(front, anchors.topology).points;
      return drawnOrUnavailable(measurementName, 'limited', [
        surface(
          measurementName,
          joinSurfacePoints([
            back.points,
            front.points,
            [...frontRight].reverse(),
            [...backRight].reverse(),
          ]),
          true,
        ),
      ]);
    }
    case 'BODY_MEASUREMENT_NAME_SHOULDER_LENGTH': {
      const path = geodesic(hpsL, acromionL);
      return drawnOrUnavailable(measurementName, 'limited', [
        path ? surface(measurementName, path.points) : null,
      ]);
    }
    case 'BODY_MEASUREMENT_NAME_HPS_TO_BUST_APEX': {
      const path = geodesic(hpsL, apexL);
      return drawnOrUnavailable(measurementName, 'limited', [
        path ? surface(measurementName, path.points) : null,
      ]);
    }
    case 'BODY_MEASUREMENT_NAME_HPS_TO_WAIST_FRONT': {
      // HPS over the bust apex, then down the front to the waist plane below the apex.
      if (waistY === undefined) return result(measurementName, 'unavailable-section');
      const loop = sectionLoop({ mesh, originM: [0, waistY, 0], normal: [0, 1, 0] });
      const toApex = geodesic(hpsL, apexL);
      if (!loop || !toApex) return result(measurementName, 'unavailable-section');
      const apexX = apexL.positionM[0];
      const waistFront = loop.pointsM
        .filter((point) => point[2] > loop.centroidM[2])
        .reduce<Vec3 | null>(
          (best, point) =>
            !best || Math.abs(point[0] - apexX) < Math.abs(best[0] - apexX) ? point : best,
          null,
        );
      const down = waistFront
        ? geodesic(apexL, vertexAnchor(nearestVertex(mesh.positions, waistFront)))
        : null;
      if (!down) return result(measurementName, 'unavailable-section');
      return drawnOrUnavailable(measurementName, 'limited', [
        surface(measurementName, joinSurfacePoints([toApex.points, down.points])),
      ]);
    }
    case 'BODY_MEASUREMENT_NAME_BUST_APEX_TO_APEX': {
      // Front arc of the horizontal section through both apexes (mirror vertices share one level).
      const apexY = (apexL.positionM[1] + anchors.apexR.positionM[1]) / 2;
      return drawnOrUnavailable(measurementName, 'limited', [
        sidedSectionArcPath({
          id: measurementName,
          mesh,
          originM: [0, apexY, 0],
          normal: [0, 1, 0],
          seedM: [0, apexY, apexL.positionM[2]],
          coordinate: 0,
          startValue: anchors.apexR.positionM[0],
          endValue: apexL.positionM[0],
          zSide: 1,
          bindToMesh,
        }),
      ]);
    }
    case 'BODY_MEASUREMENT_NAME_ARMSCYE_CIRCUMFERENCE': {
      // Section around the shoulder joint in the front-back plane through underarm and shoulder
      // point; the loop must pass both landmarks, otherwise nothing is drawn.
      const direction = subtract(acromion, underarm);
      const length = Math.hypot(direction[0], direction[1]);
      if (length <= Number.EPSILON) return result(measurementName, 'unavailable-section');
      const normal: Vec3 = [direction[1] / length, -direction[0] / length, 0];
      const originM = mix(underarm, acromion, 0.5);
      const loop = sectionLoop({ mesh, originM, normal, seedM: originM });
      const passes = (target: Vec3) =>
        loop?.pointsM.some((point) => Math.hypot(...subtract(point, target)) < 0.015) ?? false;
      if (!loop || !passes(underarm) || !passes(acromion)) {
        return result(measurementName, 'unavailable-section');
      }
      const path = pathFromSectionLoop(measurementName, mesh, loop, bindToMesh);
      return drawnOrUnavailable(measurementName, 'limited', [
        path && bindToMesh && drawnMesh?.positions.length === mesh.positions.length
          ? withoutPoseBuriedRun(path, drawnMesh)
          : path,
      ]);
    }
    case 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER': {
      // Straight breadth between the two shoulder points: hidden part reads through the body.
      return drawnOrUnavailable(measurementName, 'limited', [
        airPath(
          Object.freeze({
            id: measurementName,
            closed: false,
            source: 'mesh-vertices' as const,
            vertexIndices: Object.freeze([vertexOf(acromionL), vertexOf(anchors.acromionR)]),
          }),
          'x-ray',
        ),
      ]);
    }
    case 'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH': {
      // Shoulder point -> elbow -> wrist on the back of the arm (the field's view is the back).
      const elbow = landmark(frame, 'elbow-left');
      const wrist = landmark(frame, 'wrist-left');
      if (!elbow || !wrist) return result(measurementName, 'unavailable-section');
      const back = (point: Vec3): Vec3 => [point[0], point[1], point[2] - 0.06];
      const vertexIndices = [
        vertexOf(acromionL),
        nearestVertex(mesh.positions, back(elbow)),
        nearestVertex(mesh.positions, back(wrist)),
      ].filter((vertex, index, all) => vertex !== all[index - 1]);
      if (new Set(vertexIndices).size < 2) return result(measurementName, 'unavailable-section');
      return result(measurementName, 'limited', [
        airPath(
          Object.freeze({
            id: measurementName,
            closed: false,
            source: 'mesh-vertices' as const,
            vertexIndices: Object.freeze(vertexIndices),
          }),
          'x-ray',
        ),
      ]);
    }
    case 'BODY_MEASUREMENT_NAME_CHEST_DEPTH': {
      // Caliper from the bust apex straight back, level on the chest-ring plane: both ends sit at
      // the chest ring's height. Snapping the back end to its nearest vertex tilted the caliper up
      // to 7 mm off that plane. Each end rides its own vertex, so a posed body keeps it on the ring.
      const chestY = anchoredChestY(anchors);
      const loop = sectionLoop({ mesh, originM: [0, chestY, 0], normal: [0, 1, 0] });
      if (!loop) return result(measurementName, 'unavailable-section');
      const apexX = apexL.positionM[0];
      const backPoint = loop.pointsM
        .filter((point) => point[2] < loop.centroidM[2])
        .reduce<Vec3 | null>(
          (best, point) =>
            !best || Math.abs(point[0] - apexX) < Math.abs(best[0] - apexX) ? point : best,
          null,
        );
      if (!backPoint) return result(measurementName, 'unavailable-section');
      const frontVertex = nearestVertex(mesh.positions, [apexX, chestY, apexL.positionM[2]]);
      const backVertex = nearestVertex(mesh.positions, backPoint);
      if (frontVertex === backVertex) return result(measurementName, 'unavailable-section');
      const front = vertexPositionM(mesh, frontVertex);
      return result(measurementName, 'limited', [
        airPath(
          placedPath(
            measurementName,
            mesh,
            [
              onVertex(frontVertex, [front[0], chestY, front[2]]),
              onVertex(backVertex, [backPoint[0], chestY, backPoint[2]]),
            ],
            bindToMesh,
          ),
          'caliper',
        ),
      ]);
    }
    case 'BODY_MEASUREMENT_NAME_SHOULDER_DROP':
    case 'BODY_MEASUREMENT_NAME_ARMSCYE_DEPTH': {
      // HPS level carried out over the shoulder point (or the underarm), then the vertical drop to
      // it. Each coordinate rides its landmark, so a posed body keeps the caliper on it.
      const hpsVertex = vertexOf(hpsL);
      const endAnchor =
        measurementName === 'BODY_MEASUREMENT_NAME_SHOULDER_DROP' ? acromionL : underarmL;
      const endVertex = vertexOf(endAnchor);
      const end = endAnchor.positionM;
      const top: PlacedPoint = {
        pointM: [end[0], hps[1], end[2]],
        axisVertices: [endVertex, hpsVertex, endVertex],
      };
      return result(measurementName, 'limited', [
        airPath(
          placedPath(`${measurementName}:level`, mesh, [onVertex(hpsVertex, hps), top], bindToMesh),
          'caliper',
        ),
        airPath(
          placedPath(measurementName, mesh, [top, onVertex(endVertex, end)], bindToMesh),
          'caliper',
        ),
      ]);
    }
    case 'BODY_MEASUREMENT_NAME_INSEAM': {
      // Crotch down the inside of the left leg to the floor, on its front-inner face so the front
      // view sees the tape; half-centimetre levels over the foot, where the skin turns fast.
      const crotch = anchors.crotch.positionM;
      const lowest = extremeVertex(mesh, 1, -1);
      if (lowest < 0) return result(measurementName, 'unavailable-section');
      const floorY = vertexPositionM(mesh, lowest)[1];
      const ankleY = floorY + 0.12;
      if (crotch[1] - 0.01 <= ankleY) return result(measurementName, 'unavailable-section');
      const line = bodyLinePointsM({
        mesh,
        levels: [
          ...levelsBetween(crotch[1] - 0.01, ankleY, 0.02),
          ...levelsBetween(ankleY, floorY + 0.006, 0.005).slice(1),
        ],
        startSeedM: [crotch[0] + 0.08, crotch[1], crotch[2]],
        direction: [-0.866, 0.5],
      });
      return drawnOrUnavailable(measurementName, 'limited', [
        line ? bodyLinePath(measurementName, mesh, line, bindToMesh) : null,
      ]);
    }
    case 'BODY_MEASUREMENT_NAME_HPS_HEIGHT':
      return drawnOrUnavailable(measurementName, 'visible', [
        floorRulerPath(measurementName, mesh, onVertex(vertexOf(hpsL), hps), bindToMesh),
      ]);
    default:
      return null;
  }
}

/** Fields drawn only from HM08 anchors; any other mesh gets no line rather than a guessed one. */
const ANCHOR_ONLY_FIELDS: ReadonlySet<common_BodyMeasurementName> = new Set([
  'BODY_MEASUREMENT_NAME_NECK_BASE',
  'BODY_MEASUREMENT_NAME_SHOULDER_LENGTH',
  'BODY_MEASUREMENT_NAME_SHOULDER_DROP',
  'BODY_MEASUREMENT_NAME_ARMSCYE_DEPTH',
  'BODY_MEASUREMENT_NAME_ARMSCYE_CIRCUMFERENCE',
  'BODY_MEASUREMENT_NAME_HPS_TO_BUST_APEX',
  'BODY_MEASUREMENT_NAME_BUST_APEX_TO_APEX',
  'BODY_MEASUREMENT_NAME_HPS_TO_WAIST_FRONT',
  'BODY_MEASUREMENT_NAME_INSEAM',
  'BODY_MEASUREMENT_NAME_HPS_HEIGHT',
]);

/** Fields that read an anchor when the mesh has them (placement or the whole line). */
const ANCHORED_FIELDS: ReadonlySet<common_BodyMeasurementName> = new Set([
  ...ANCHOR_ONLY_FIELDS,
  'BODY_MEASUREMENT_NAME_CHEST',
  'BODY_MEASUREMENT_NAME_UNDER_BUST',
  'BODY_MEASUREMENT_NAME_ACROSS_FRONT',
  'BODY_MEASUREMENT_NAME_ACROSS_BACK',
  'BODY_MEASUREMENT_NAME_CF_NECK_TO_WAIST',
  'BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST',
  'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER',
  'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH',
  'BODY_MEASUREMENT_NAME_CHEST_DEPTH',
]);

/**
 * Builds a visual guide from the shaped neutral mesh. On a posed body every guide binds to mesh
 * vertices (tapes ride vertices, straight lines ride the vertices they were placed from), so it
 * follows live posed positions without rebuilding the Three scene.
 */
export function buildMeasurementSurfaceActiveMeasurementGuideV1(
  options: Parameters<typeof buildGuide>[0],
): MeasurementSurfaceActiveMeasurementGuideV1 {
  return withView(buildGuide(options));
}

function buildGuide(options: {
  readonly measurementName: common_BodyMeasurementName;
  readonly frame: MeasurementBodyFrameV2;
  readonly mesh: MeasurementSurfaceMeshV1;
  readonly neutralPose: boolean;
  readonly limbSectionModes?: readonly OpenReferenceLimbCircumferenceModeV1[];
  readonly torsoSectionStations?: Readonly<{
    chest?: Vec3;
    underBust?: Vec3;
    waist?: Vec3;
    highHip?: Vec3;
    hip?: Vec3;
  }>;
  /** Rig knee stations from the beta runtime; the guide draws the positive (left) side. */
  readonly kneeSectionStations?: readonly MeasurementOpenReferenceKneeRigStationV1[];
  /** The neck proxy's rig mid-neck plane from the beta runtime (same helper as the solver). */
  readonly neckSectionStation?: MeasurementOpenReferenceNeckProtectedSectionV1;
  /** The posed body a mesh-bound guide is drawn on (same vertices as `mesh`), when posed. */
  readonly drawnMesh?: MeasurementSurfaceMeshV1;
  /** The display vertices the beta shoulder-breadth stage solves its chord between. */
  readonly shoulderChordVertices?: Readonly<{ negative: number; positive: number }>;
}): MeasurementSurfaceActiveMeasurementGuideV1 {
  const { measurementName, frame, mesh } = options;
  if (!LABELS[measurementName as keyof typeof LABELS]) {
    return result(measurementName, 'unsupported');
  }
  const chest = station(frame, 'chest');
  const waist = station(frame, 'waist');
  const hip = station(frame, 'hip');
  const shoulder = station(frame, 'shoulder');
  const anchors = ANCHORED_FIELDS.has(measurementName) ? guideBodyAnchors(mesh) : null;
  // With anchors the chest plane is the bust apex level (below the underarm, arms excluded);
  // the runtime's chest station is kept only for meshes without them.
  const chestY = anchors
    ? anchoredChestY(anchors)
    : options.torsoSectionStations?.chest?.[1] ?? chest?.yM;
  const foldY =
    anchors && measurementName === 'BODY_MEASUREMENT_NAME_UNDER_BUST'
      ? anchoredUnderBustY(anchors, mesh)
      : null;
  const underBustY = anchors ? foldY ?? undefined : options.torsoSectionStations?.underBust?.[1];
  const waistY = options.torsoSectionStations?.waist?.[1] ?? waist?.yM;
  const hipY = options.torsoSectionStations?.hip?.[1] ?? hip?.yM;
  const highHipStationResolution =
    waistY !== undefined && hipY !== undefined
      ? resolveMeasurementOpenReferenceHighHipStationV1({
          waistStationOriginM: options.torsoSectionStations?.waist ?? [0, waistY, 0],
          hipStationOriginM: options.torsoSectionStations?.hip ?? [0, hipY, 0],
          waistToHighHipMm: frame.measurements.waistToHighHipMm,
        })
      : null;
  const highHipY =
    options.torsoSectionStations?.highHip?.[1] ??
    (highHipStationResolution?.ok ? highHipStationResolution.station.originM[1] : undefined);
  if (measurementName === 'BODY_MEASUREMENT_NAME_HIGH_HIP' && highHipY === undefined) {
    return result(measurementName, 'unavailable-section');
  }
  const torsoY =
    measurementName === 'BODY_MEASUREMENT_NAME_CHEST'
      ? chestY
      : measurementName === 'BODY_MEASUREMENT_NAME_UNDER_BUST' && chestY !== undefined
        ? underBustY ??
          chestY -
            Math.min(
              0.095,
              Math.max(
                0.045,
                frame.measurements.hpsToWaistFrontMm
                  ? (frame.measurements.hpsToWaistFrontMm / 1000) * 0.18
                  : (frame.measurements.heightMm / 1000) * 0.04,
              ),
            )
        : measurementName === 'BODY_MEASUREMENT_NAME_WAIST'
          ? waistY
          : measurementName === 'BODY_MEASUREMENT_NAME_HIGH_HIP'
            ? highHipY
            : measurementName === 'BODY_MEASUREMENT_NAME_HIP'
              ? hipY
              : undefined;
  if (torsoY !== undefined) {
    const status =
      measurementName === 'BODY_MEASUREMENT_NAME_UNDER_BUST' && underBustY === undefined
        ? 'limited'
        : 'visible';
    return drawnOrUnavailable(measurementName, status, [
      torsoSectionPath({
        id: measurementName,
        mesh,
        yM: torsoY,
        bindToMesh: !options.neutralPose,
      }),
    ]);
  }

  const solvedShoulderChord =
    measurementName === 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER'
      ? shoulderChordPath(measurementName, mesh, options.shoulderChordVertices)
      : null;
  if (solvedShoulderChord) {
    // The straight chord the shoulder-breadth stage solves; hidden part reads through the body.
    return result(measurementName, 'limited', [airPath(solvedShoulderChord, 'x-ray')]);
  }

  if (anchors) {
    const anchored = anchoredGuide({
      measurementName,
      frame,
      mesh,
      anchors,
      neutralPose: options.neutralPose,
      waistY,
      drawnMesh: options.drawnMesh,
    });
    if (anchored) return anchored;
  } else if (ANCHOR_ONLY_FIELDS.has(measurementName)) {
    // HPS, shoulder point, underarm, apex, C7 and crotch exist only as anchors of the HM08 mesh.
    return result(measurementName, 'unavailable-section');
  }

  const depthStation =
    measurementName === 'BODY_MEASUREMENT_NAME_CHEST_DEPTH'
      ? chest
      : measurementName === 'BODY_MEASUREMENT_NAME_WAIST_DEPTH'
        ? waist
        : measurementName === 'BODY_MEASUREMENT_NAME_HIP_DEPTH'
          ? hip
          : null;
  if (depthStation && measurementName !== 'BODY_MEASUREMENT_NAME_CHEST_DEPTH') {
    // Waist / hip depth: the caliper spans the torso's own section on the same plane as the
    // waist / hip ring, from its front-most to its back-most point. Snapping the analytic
    // [0, y, ±halfDepth] to the nearest vertex picked a thigh or a hanging hand below the hip.
    const depthY = measurementName === 'BODY_MEASUREMENT_NAME_HIP_DEPTH' ? hipY : waistY;
    const loop =
      depthY === undefined
        ? null
        : sectionLoop({ mesh, originM: [0, depthY, 0], normal: [0, 1, 0] });
    if (loop && loop.pointsM.length >= 3) {
      let front = loop.pointsM[0];
      let back = loop.pointsM[0];
      for (const point of loop.pointsM) {
        if (point[2] > front[2]) front = point;
        if (point[2] < back[2]) back = point;
      }
      const frontVertex = nearestVertex(mesh.positions, front);
      const backVertex = nearestVertex(mesh.positions, back);
      if (frontVertex !== backVertex) {
        return result(measurementName, 'limited', [
          airPath(
            Object.freeze({
              id: measurementName,
              closed: false,
              source: 'mesh-vertices' as const,
              vertexIndices: Object.freeze([frontVertex, backVertex]),
            }),
            'caliper',
          ),
        ]);
      }
    }
  }
  if (depthStation) {
    return drawnOrUnavailable(measurementName, 'limited', [
      airPath(
        vertexPath(
          measurementName,
          mesh,
          [
            [0, depthStation.yM, depthStation.halfDepthM],
            [0, depthStation.yM, -depthStation.halfDepthM],
          ],
          false,
        ),
        'caliper',
      ),
    ]);
  }

  if (measurementName === 'BODY_MEASUREMENT_NAME_NECK') {
    // Mid-neck ring on the proxy's own station; no analytical fallback, so the guide never shows a
    // line the neck proxy does not solve. Neck base above stays its own band and is not derived.
    const neckStation = options.neckSectionStation;
    return drawnOrUnavailable(measurementName, 'visible', [
      neckStation
        ? sectionPath({
            id: measurementName,
            mesh,
            originM: neckStation.originM,
            normal: neckStation.normal,
            seedM: neckStation.originM,
            bindToMesh: !options.neutralPose,
          })
        : null,
    ]);
  }

  const limbConfig =
    measurementName === 'BODY_MEASUREMENT_NAME_BICEP'
      ? ({ segmentId: 'upper-arm-left', range: [0.28, 0.72], select: 'maximum' } as const)
      : measurementName === 'BODY_MEASUREMENT_NAME_WRIST'
        ? ({
            segmentId: 'forearm-left',
            range: [0.3, 1.1],
            select: 'minimum',
            followLimb: true,
            samples: 33,
          } as const)
        : measurementName === 'BODY_MEASUREMENT_NAME_THIGH'
          ? ({ segmentId: 'thigh-left', range: [0.16, 0.52], select: 'maximum' } as const)
          : measurementName === 'BODY_MEASUREMENT_NAME_KNEE'
            ? ({ segmentId: 'thigh-left', range: [0.86, 0.94], select: 'minimum' } as const)
            : measurementName === 'BODY_MEASUREMENT_NAME_CALF'
              ? ({ segmentId: 'calf-left', range: [0.18, 0.68], select: 'maximum' } as const)
              : measurementName === 'BODY_MEASUREMENT_NAME_ANKLE'
                ? ({ segmentId: 'calf-left', range: [0.76, 0.96], select: 'minimum' } as const)
                : null;
  if (limbConfig) {
    const measurementKey =
      LIMB_MEASUREMENT_KEYS[measurementName as keyof typeof LIMB_MEASUREMENT_KEYS];
    const admittedMode = measurementKey
      ? options.limbSectionModes?.find((candidate) => candidate.measurementKey === measurementKey)
      : undefined;
    const admittedStation =
      measurementName === 'BODY_MEASUREMENT_NAME_KNEE'
        ? options.kneeSectionStations?.find(({ side }) => side === 'positive')
        : admittedMode
          ? deriveOpenReferenceLimbSectionStationsV1({
              positionsM: mesh.positions,
              mode: admittedMode,
            }).find(({ side }) => side === 'positive')
          : undefined;
    const segment = frame.segments.find(({ id }) => id === limbConfig.segmentId);
    return drawnOrUnavailable(measurementName, 'visible', [
      admittedStation
        ? sectionPath({
            id: measurementName,
            mesh,
            originM: admittedStation.originM,
            normal: admittedStation.normal,
            seedM: admittedStation.originM,
            bindToMesh: !options.neutralPose,
          })
        : segment
          ? segmentExtremumSectionPath({
              id: measurementName,
              mesh,
              aM: segment.aM,
              bM: segment.bM,
              range: limbConfig.range,
              select: limbConfig.select,
              bindToMesh: !options.neutralPose,
              ...('followLimb' in limbConfig
                ? { followLimb: limbConfig.followLimb, samples: limbConfig.samples }
                : {}),
            })
          : null,
    ]);
  }

  const shoulderLeft = landmark(frame, 'shoulder-left');
  const shoulderRight = landmark(frame, 'shoulder-right');
  if (
    measurementName === 'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER' &&
    shoulderLeft &&
    shoulderRight
  ) {
    const path = vertexPath(measurementName, mesh, [shoulderLeft, shoulderRight], false);
    if (!path && !options.neutralPose) return result(measurementName, 'unavailable-pose');
    return result(measurementName, 'limited', [
      airPath(path ?? fixedPath(measurementName, [shoulderLeft, shoulderRight]), 'x-ray'),
    ]);
  }

  if (measurementName === 'BODY_MEASUREMENT_NAME_HEIGHT') {
    // Floor ruler with a head plate touching the crown.
    const crown = extremeVertex(mesh, 1, 1);
    return drawnOrUnavailable(measurementName, 'visible', [
      crown >= 0
        ? floorRulerPath(
            measurementName,
            mesh,
            onVertex(crown, vertexPositionM(mesh, crown)),
            !options.neutralPose,
          )
        : null,
    ]);
  }

  if (measurementName === 'BODY_MEASUREMENT_NAME_WAIST_HEIGHT' && waistY !== undefined) {
    // Floor ruler with a level plate touching the left side of the waist.
    const loop = sectionLoop({ mesh, originM: [0, waistY, 0], normal: [0, 1, 0] });
    const side = loop?.pointsM.reduce((best, point) => (point[0] > best[0] ? point : best));
    const sideVertex = side ? nearestVertex(mesh.positions, side) : -1;
    return drawnOrUnavailable(measurementName, 'visible', [
      side && sideVertex >= 0
        ? floorRulerPath(measurementName, mesh, onVertex(sideVertex, side), !options.neutralPose)
        : null,
    ]);
  }

  if (measurementName === 'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH') {
    const elbow = landmark(frame, 'elbow-left');
    const wrist = landmark(frame, 'wrist-left');
    if (!shoulderLeft || !elbow || !wrist) return result(measurementName, 'unavailable-section');
    const path = vertexPath(measurementName, mesh, [shoulderLeft, elbow, wrist], false);
    if (!path && !options.neutralPose) return result(measurementName, 'unavailable-pose');
    return result(measurementName, 'limited', [
      airPath(path ?? fixedPath(measurementName, [shoulderLeft, elbow, wrist]), 'x-ray'),
    ]);
  }

  if (
    (measurementName === 'BODY_MEASUREMENT_NAME_ACROSS_FRONT' ||
      measurementName === 'BODY_MEASUREMENT_NAME_ACROSS_BACK') &&
    chest &&
    chestY !== undefined
  ) {
    const zSide = measurementName === 'BODY_MEASUREMENT_NAME_ACROSS_FRONT' ? 1 : -1;
    // Upper-chest level just above the underarm, between the axillary folds (2 cm inside it).
    const acrossY = anchors ? anchors.underarmL.positionM[1] + 0.03 : chestY;
    const halfSpanM = anchors
      ? Math.abs(anchors.underarmL.positionM[0]) - 0.02
      : chest.halfWidthM * 0.78;
    return drawnOrUnavailable(measurementName, 'limited', [
      sidedSectionArcPath({
        id: measurementName,
        mesh,
        originM: [0, acrossY, 0],
        normal: [0, 1, 0],
        seedM: [0, acrossY, zSide * chest.halfDepthM],
        coordinate: 0,
        startValue: -halfSpanM,
        endValue: halfSpanM,
        zSide,
        bindToMesh: !options.neutralPose,
      }),
    ]);
  }
  if (
    (measurementName === 'BODY_MEASUREMENT_NAME_CF_NECK_TO_WAIST' ||
      measurementName === 'BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST') &&
    waist &&
    waistY !== undefined
  ) {
    const frameNeckBase = landmark(frame, 'neck-base');
    const zSide = measurementName === 'BODY_MEASUREMENT_NAME_CF_NECK_TO_WAIST' ? 1 : -1;
    // Centre front starts at the suprasternal notch, centre back at C7 (not the frame's prior).
    const neckBase = anchors ? (zSide > 0 ? anchors.ssn : anchors.c7).positionM : frameNeckBase;
    if (!neckBase) return result(measurementName, 'unavailable-section');
    return drawnOrUnavailable(measurementName, 'limited', [
      sidedSectionArcPath({
        id: measurementName,
        mesh,
        originM: [0, (neckBase[1] + waistY) / 2, 0],
        normal: [1, 0, 0],
        seedM: [0, (neckBase[1] + waistY) / 2, zSide * (shoulder?.halfDepthM ?? 0.1)],
        coordinate: 1,
        startValue: neckBase[1],
        endValue: waistY,
        zSide,
        bindToMesh: !options.neutralPose,
      }),
    ]);
  }

  if (
    measurementName === 'BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP' ||
    measurementName === 'BODY_MEASUREMENT_NAME_WAIST_TO_HIP'
  ) {
    // A tape down the left side seam from the waist plane to the (high) hip plane.
    const endY = measurementName === 'BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP' ? highHipY : hipY;
    if (waistY === undefined || endY === undefined || endY >= waistY) {
      return result(measurementName, 'unavailable-section');
    }
    return drawnOrUnavailable(measurementName, 'limited', [
      sideSeamPath(measurementName, mesh, waistY, endY, !options.neutralPose),
    ]);
  }

  return result(measurementName, 'unavailable-section');
}
