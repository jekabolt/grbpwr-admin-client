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

/** Where the camera looks while the field is focused; absent means the owner's camera. */
export type MeasurementSurfaceMeasurementGuideViewV1 = 'front' | 'back' | 'side';

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
    }>;

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

/** Fields whose line reads only from the back or the side (owner-approved mockup, variant C). */
const FIELD_VIEWS = Object.freeze({
  BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST: 'back',
  BODY_MEASUREMENT_NAME_ACROSS_BACK: 'back',
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 'back',
  BODY_MEASUREMENT_NAME_CHEST_DEPTH: 'side',
  BODY_MEASUREMENT_NAME_WAIST_DEPTH: 'side',
  BODY_MEASUREMENT_NAME_HIP_DEPTH: 'side',
  BODY_MEASUREMENT_NAME_ARMSCYE_DEPTH: 'back',
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
  const section = measureMeshPlaneSectionPerimetersV1({
    positionsM: options.mesh.positions,
    triangleIndices: options.mesh.indices,
    planeOriginM: options.originM,
    planeNormal: options.normal,
    selection: { kind: 'nearest-seed', seedM: options.seedM ?? options.originM },
    policy: { weldToleranceM: 0.00002 },
  });
  if (!section.ok || !section.selectedLoop) return null;
  return section.selectedLoop;
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
}): MeasurementSurfaceMeasurementGuidePathV1 | null {
  const normal = subtract(options.bM, options.aM);
  const samples = 9;
  const loops: MeshPlaneSectionLoopV1[] = [];
  for (let index = 0; index < samples; index += 1) {
    const t = options.range[0] + ((options.range[1] - options.range[0]) * index) / (samples - 1);
    const originM = mix(options.aM, options.bM, t);
    const section = measureMeshPlaneSectionPerimetersV1({
      positionsM: options.mesh.positions,
      triangleIndices: options.mesh.indices,
      planeOriginM: originM,
      planeNormal: normal,
      selection: { kind: 'nearest-seed', seedM: originM },
      policy: { weldToleranceM: 0.00002 },
    });
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

/** Farther than this from x = 0 a vertex is a left/right point, never a drifted midline one. */
const MIDLINE_SNAP_M = 0.00005;

/**
 * The topology's mirror map needs exact float symmetry. Shaped HM08 bodies keep every left/right
 * pair exact but let some midline vertices drift off x = 0 (1e-20 m on the female base, 0.02 mm on
 * the male), so the topology is built from a copy with those vertices put back on the midline.
 * Paths are still traced on the mesh's own positions.
 */
function midlineSnappedPositions(positionsM: Float32Array): Float32Array {
  let snapped: Float32Array | null = null;
  for (let offset = 0; offset < positionsM.length; offset += 3) {
    const x = positionsM[offset];
    if (x !== 0 && Math.abs(x) < MIDLINE_SNAP_M) {
      snapped ??= Float32Array.from(positionsM);
      snapped[offset] = 0;
    }
  }
  return snapped ?? positionsM;
}

/** Anchors exist only on the HM08 topology; any other mesh gets no guessed landmark. */
function guideBodyAnchors(mesh: MeasurementSurfaceMeshV1): GuideBodyAnchors | null {
  if (mesh.positions.length !== HM08_VERTEX_COUNT * 3 || mesh.indices.length !== HM08_INDEX_COUNT) {
    return null;
  }
  const created = createMeshSurfaceTopologyV1({
    positionsM: midlineSnappedPositions(mesh.positions),
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
 * surface under the apex (the fold). Null when the scan finds no fold within 8 cm.
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
  for (let step = 3; step <= 9; step += 1) {
    const yM = chestY - step * 0.01;
    const zM = frontZ(yM);
    if (zM === null) return null;
    if (previous && zM >= previous.zM) return previous.yM;
    previous = { yM, zM };
  }
  return null;
}

function anchoredFixedPath(
  id: string,
  pointsM: readonly Vec3[],
  air?: MeasurementSurfaceMeasurementGuideAirV1,
): MeasurementSurfaceMeasurementGuidePathV1 {
  const path = fixedPath(id, pointsM);
  return air ? airPath(path, air) : path;
}

function anchoredGuide(options: {
  readonly measurementName: common_BodyMeasurementName;
  readonly frame: MeasurementBodyFrameV2;
  readonly mesh: MeasurementSurfaceMeshV1;
  readonly anchors: GuideBodyAnchors;
  readonly neutralPose: boolean;
  readonly waistY: number | undefined;
}): MeasurementSurfaceActiveMeasurementGuideV1 | null {
  const { measurementName, frame, mesh, anchors, neutralPose, waistY } = options;
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
      return drawnOrUnavailable(measurementName, 'limited', [
        pathFromSectionLoop(measurementName, mesh, loop, bindToMesh),
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
      // Caliper from the bust apex straight back on the chest plane.
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
    default:
      break;
  }

  // The rest are straight or vertical lines placed in space; they cannot follow a posed body.
  const fixedFields: readonly common_BodyMeasurementName[] = [
    'BODY_MEASUREMENT_NAME_SHOULDER_DROP',
    'BODY_MEASUREMENT_NAME_ARMSCYE_DEPTH',
    'BODY_MEASUREMENT_NAME_INSEAM',
    'BODY_MEASUREMENT_NAME_HPS_HEIGHT',
  ];
  if (!fixedFields.includes(measurementName)) return null;
  if (!neutralPose) return result(measurementName, 'unavailable-pose');

  switch (measurementName) {
    case 'BODY_MEASUREMENT_NAME_SHOULDER_DROP': {
      // HPS level carried out over the shoulder point, then the vertical drop to it.
      const top: Vec3 = [acromion[0], hps[1], acromion[2]];
      return result(measurementName, 'limited', [
        anchoredFixedPath(`${measurementName}:level`, [hps, top], 'caliper'),
        anchoredFixedPath(measurementName, [top, acromion], 'caliper'),
      ]);
    }
    case 'BODY_MEASUREMENT_NAME_ARMSCYE_DEPTH': {
      // HPS level down to the underarm level on the same side.
      const top: Vec3 = [underarm[0], hps[1], underarm[2]];
      return result(measurementName, 'limited', [
        anchoredFixedPath(`${measurementName}:level`, [hps, top], 'caliper'),
        anchoredFixedPath(measurementName, [top, underarm], 'caliper'),
      ]);
    }
    case 'BODY_MEASUREMENT_NAME_INSEAM': {
      // Crotch point straight down to the floor; dashed where it passes the inner thighs.
      const crotch = anchors.crotch.positionM;
      return result(measurementName, 'limited', [
        anchoredFixedPath(measurementName, [crotch, [crotch[0], 0, crotch[2]]], 'x-ray'),
      ]);
    }
    case 'BODY_MEASUREMENT_NAME_HPS_HEIGHT': {
      // External ruler like height, with a level leader to the HPS point.
      const offsetX = frame.measurements.shoulderBreadthMm / 2000 + 0.14;
      const topY = hps[1] + 0.003;
      return result(measurementName, 'visible', [
        fixedPath(measurementName, [
          [offsetX, 0, 0],
          [offsetX, topY, 0],
        ]),
        fixedPath(`${measurementName}:leader`, [
          [offsetX, topY, 0],
          [hps[0], topY, hps[2]],
        ]),
      ]);
    }
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
 * Builds a visual guide from the shaped neutral mesh. Vertex-bound guides follow live posed
 * positions without rebuilding the Three scene. Fixed-coordinate guides fail soft outside the
 * neutral pose because they cannot truthfully follow the deformed body.
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

  if (anchors) {
    const anchored = anchoredGuide({
      measurementName,
      frame,
      mesh,
      anchors,
      neutralPose: options.neutralPose,
      waistY,
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
        ? ({ segmentId: 'forearm-left', range: [0.76, 0.96], select: 'minimum' } as const)
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
    if (!options.neutralPose) return result(measurementName, 'unavailable-pose');
    const heightM = frame.measurements.heightMm / 1000;
    const offsetX = frame.measurements.shoulderBreadthMm / 2000 + 0.14;
    return result(measurementName, 'visible', [
      fixedPath(measurementName, [
        [offsetX, 0, 0],
        [offsetX, heightM, 0],
      ]),
    ]);
  }

  if (measurementName === 'BODY_MEASUREMENT_NAME_WAIST_HEIGHT' && waist) {
    if (!options.neutralPose) return result(measurementName, 'unavailable-pose');
    const offsetX = waist.halfWidthM + 0.1;
    return result(measurementName, 'visible', [
      fixedPath(measurementName, [
        [offsetX, 0, 0],
        [offsetX, waist.yM, 0],
      ]),
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
    (measurementName === 'BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP' ||
      measurementName === 'BODY_MEASUREMENT_NAME_WAIST_TO_HIP') &&
    waist &&
    hip
  ) {
    if (!options.neutralPose) return result(measurementName, 'unavailable-pose');
    const endY = measurementName === 'BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP' ? highHipY : hipY;
    if (waistY === undefined || endY === undefined) {
      return result(measurementName, 'unavailable-section');
    }
    const offsetX = Math.max(waist.halfWidthM, hip.halfWidthM) + 0.1;
    return result(measurementName, 'limited', [
      fixedPath(measurementName, [
        [offsetX, waistY, 0],
        [offsetX, endY, 0],
      ]),
    ]);
  }

  return result(measurementName, 'unavailable-section');
}
