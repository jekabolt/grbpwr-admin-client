import {
  meshSurfaceEdgePointV1,
  meshSurfaceVertexPointV1,
  mirrorMeshSurfacePointV1,
  type MeshSurfacePointV1,
  type MeshSurfaceVec3V1,
} from './mesh-surface-path-v1';
import {
  measureMeshPlaneSectionPerimetersV1,
  type MeshPlaneSectionLoopV1,
} from './mesh-plane-section-perimeter-v1';
import { MESH_SURFACE_TOPOLOGY_V1, type MeshSurfaceTopologyV1 } from './mesh-surface-topology-v1';

export const MEASUREMENT_SURFACE_ANCHORS_V1 = 'measurement-surface-anchors/v1' as const;

export type SurfaceAnchorIdV1 =
  | 'ssn'
  | 'c7'
  | 'hps-l'
  | 'hps-r'
  | 'underarm-l'
  | 'underarm-r'
  | 'crotch';

export type SurfaceAnchorClassV1 = 'robust' | 'limited';

export interface SurfaceAnchorV1 {
  readonly id: SurfaceAnchorIdV1;
  readonly rule: string;
  readonly template: MeshSurfacePointV1;
  readonly checkBandMm: number;
  readonly class: SurfaceAnchorClassV1;
  readonly mirrorOf?: SurfaceAnchorIdV1;
}

const ANCHOR_IDS = Object.freeze([
  'ssn',
  'c7',
  'hps-l',
  'hps-r',
  'underarm-l',
  'underarm-r',
  'crotch',
] as const satisfies readonly SurfaceAnchorIdV1[]);

function anchor(entry: SurfaceAnchorV1): SurfaceAnchorV1 {
  return Object.freeze(entry);
}

/**
 * Gender-base vertex votes (female/neutral/male; base is report-only):
 * SSN 815/815/815 (base 809), C7 857/857/857 (base 857),
 * HPS-L 8189/8189/8189 (base 7478), underarm-L 8337/8336/8336 (base 8304),
 * and crotch 4372/4372/4372 (base 4372). The underarm section consistently crosses
 * edge 8336-8340; its fixed interior point keeps the off-surface gap midpoint inside
 * the 10 mm band on all four bases. Mirrored points use the topology mirror map.
 *
 * MakeHuman's positive x side is the figure's left: HPS-L vertex 8189 has x > 0,
 * while its HPS-R mirror vertex 1505 has x < 0 on every reference basis.
 */
export const SURFACE_ANCHOR_TABLE_V1: readonly SurfaceAnchorV1[] = Object.freeze([
  anchor({
    id: 'ssn',
    rule: 'front-midline-min-z/0.80-0.86H',
    template: meshSurfaceVertexPointV1(815),
    checkBandMm: 15,
    class: 'limited',
  }),
  anchor({
    id: 'c7',
    rule: 'back-midline-max-turn/0.80-0.88H',
    template: meshSurfaceVertexPointV1(857),
    checkBandMm: 20,
    class: 'limited',
  }),
  anchor({
    id: 'hps-l',
    rule: 'coronal-neck-shoulder-chord/left',
    template: meshSurfaceVertexPointV1(8189),
    checkBandMm: 30,
    class: 'limited',
  }),
  anchor({
    id: 'hps-r',
    rule: 'mirror/hps-l',
    template: meshSurfaceVertexPointV1(1505),
    checkBandMm: 30,
    class: 'limited',
    mirrorOf: 'hps-l',
  }),
  anchor({
    id: 'underarm-l',
    rule: 'last-3-loop-gap-midpoint/left',
    template: meshSurfaceEdgePointV1(8336, 8340, 0.4),
    // Known honest failure, kept on purpose (coordinator decision 2026-11-17): on the beta shape
    // runtime at the canonical "large" size (1900 mm) the female underarm rule lands 13.5 mm from
    // this template, so the check fails there; neutral/male "large" sit at 9.1/9.2 mm. The band is
    // not widened without data. Pinned in measurement-surface-anchors-morph-v1.test.ts.
    checkBandMm: 10,
    class: 'robust',
  }),
  anchor({
    id: 'underarm-r',
    rule: 'mirror/underarm-l',
    template: meshSurfaceEdgePointV1(1664, 1668, 0.4),
    checkBandMm: 10,
    class: 'robust',
    mirrorOf: 'underarm-l',
  }),
  anchor({
    id: 'crotch',
    rule: 'last-2-leg-loop-midline-min-y',
    template: meshSurfaceVertexPointV1(4372),
    checkBandMm: 10,
    class: 'robust',
  }),
]);

export type SurfaceAnchorFailureCodeV1 =
  | 'anchor-check-failed'
  | 'anchor-rule-failed'
  | 'height-order-broken'
  | 'topology-mismatch';

export interface SurfaceAnchorRuleSuccessV1 {
  readonly ok: true;
  readonly positionM: MeshSurfaceVec3V1;
  readonly nearest: MeshSurfacePointV1;
  readonly plateauMm?: number;
}

export interface SurfaceAnchorRuleFailureV1 {
  readonly ok: false;
  readonly code: 'anchor-rule-failed' | 'topology-mismatch';
  readonly detail: string;
}

export type SurfaceAnchorRuleResultV1 = SurfaceAnchorRuleSuccessV1 | SurfaceAnchorRuleFailureV1;

export type SurfaceAnchorRuleResultsV1 = Readonly<
  Record<SurfaceAnchorIdV1, SurfaceAnchorRuleResultV1>
>;

export interface CheckedSurfaceAnchorV1 {
  readonly template: MeshSurfacePointV1;
  readonly templatePositionM: MeshSurfaceVec3V1;
  readonly rulePositionM: MeshSurfaceVec3V1;
  readonly distanceMm: number;
  readonly plateauMm?: number;
}

export interface SurfaceAnchorFailureV1 {
  readonly id: SurfaceAnchorIdV1;
  readonly code: SurfaceAnchorFailureCodeV1;
  readonly distanceMm?: number;
  readonly detail: string;
}

export type SurfaceAnchorCheckResultV1 =
  | Readonly<{
      ok: true;
      anchors: Readonly<Record<SurfaceAnchorIdV1, CheckedSurfaceAnchorV1>>;
      heightFractions: Readonly<Record<SurfaceAnchorIdV1, number>>;
    }>
  | Readonly<{
      ok: false;
      code: SurfaceAnchorFailureCodeV1;
      failures: readonly SurfaceAnchorFailureV1[];
      anchors?: Readonly<Partial<Record<SurfaceAnchorIdV1, CheckedSurfaceAnchorV1>>>;
    }>;

export type SurfaceAnchorSubsetCheckResultV1 =
  | Readonly<{
      ok: true;
      anchors: Readonly<Partial<Record<SurfaceAnchorIdV1, CheckedSurfaceAnchorV1>>>;
      heightFractions: Readonly<Partial<Record<SurfaceAnchorIdV1, number>>>;
    }>
  | Readonly<{
      ok: false;
      code: SurfaceAnchorFailureCodeV1;
      failures: readonly SurfaceAnchorFailureV1[];
      anchors?: Readonly<Partial<Record<SurfaceAnchorIdV1, CheckedSurfaceAnchorV1>>>;
    }>;

interface Bounds {
  readonly minimumY: number;
  readonly maximumY: number;
  readonly heightM: number;
}

interface MidlineProfiles {
  readonly front: readonly number[];
  readonly back: readonly number[];
  readonly crotch: number;
}

interface UnderarmRuleSuccess extends SurfaceAnchorRuleSuccessV1 {
  readonly sectionLevelM: number;
}

const EXPECTED_TOPOLOGY_HASH = '13380:80268:41ea4f028f3e74f6';
const SECTION_BISECTION_TOLERANCE_M = 0.0005;

function frozenVec3(x: number, y: number, z: number): MeshSurfaceVec3V1 {
  return Object.freeze([x, y, z]) as MeshSurfaceVec3V1;
}

function vertexPosition(positionsM: Float32Array, vertex: number): MeshSurfaceVec3V1 {
  const offset = vertex * 3;
  return frozenVec3(positionsM[offset], positionsM[offset + 1], positionsM[offset + 2]);
}

function pointPosition(
  point: MeshSurfacePointV1,
  positionsM: Float32Array,
): MeshSurfaceVec3V1 | null {
  if (point.kind === 'vertex') {
    if (
      !Number.isSafeInteger(point.vertex) ||
      point.vertex < 0 ||
      point.vertex * 3 + 2 >= positionsM.length
    )
      return null;
    return vertexPosition(positionsM, point.vertex);
  }
  if (
    !Number.isSafeInteger(point.a) ||
    !Number.isSafeInteger(point.b) ||
    point.a < 0 ||
    point.a >= point.b ||
    point.b * 3 + 2 >= positionsM.length ||
    !Number.isFinite(point.t) ||
    point.t <= 0 ||
    point.t >= 1
  ) {
    return null;
  }
  const a = point.a * 3;
  const b = point.b * 3;
  return frozenVec3(
    positionsM[a] + (positionsM[b] - positionsM[a]) * point.t,
    positionsM[a + 1] + (positionsM[b + 1] - positionsM[a + 1]) * point.t,
    positionsM[a + 2] + (positionsM[b + 2] - positionsM[a + 2]) * point.t,
  );
}

function bounds(positionsM: Float32Array): Bounds | null {
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (let offset = 0; offset < positionsM.length; offset += 3) {
    if (
      !Number.isFinite(positionsM[offset]) ||
      !Number.isFinite(positionsM[offset + 1]) ||
      !Number.isFinite(positionsM[offset + 2])
    ) {
      return null;
    }
    minimumY = Math.min(minimumY, positionsM[offset + 1]);
    maximumY = Math.max(maximumY, positionsM[offset + 1]);
  }
  const heightM = maximumY - minimumY;
  return Number.isFinite(heightM) && heightM > 0
    ? Object.freeze({ minimumY, maximumY, heightM })
    : null;
}

function fractionY(value: number, currentBounds: Bounds): number {
  return (value - currentBounds.minimumY) / currentBounds.heightM;
}

function ruleSuccess(
  positionM: MeshSurfaceVec3V1,
  nearest: MeshSurfacePointV1,
  plateauMm?: number,
): SurfaceAnchorRuleSuccessV1 {
  return Object.freeze({
    ok: true as const,
    positionM,
    nearest,
    ...(plateauMm === undefined ? {} : { plateauMm }),
  });
}

function ruleFailure(
  detail: string,
  code: 'anchor-rule-failed' | 'topology-mismatch' = 'anchor-rule-failed',
): SurfaceAnchorRuleFailureV1 {
  return Object.freeze({ ok: false as const, code, detail });
}

function topologyProblem(topology: MeshSurfaceTopologyV1, positionsM: Float32Array): string | null {
  if (
    topology.version !== MESH_SURFACE_TOPOLOGY_V1 ||
    topology.topologyHash !== EXPECTED_TOPOLOGY_HASH ||
    topology.vertexCount !== 13_380 ||
    topology.triangleIndices.length !== topology.triangleCount * 3 ||
    topology.mirrorVertexMap.length !== topology.vertexCount ||
    positionsM.length !== topology.vertexCount * 3
  ) {
    return 'Positions do not share the measured anchor topology.';
  }
  return null;
}

function midlineProfiles(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  currentBounds: Bounds,
): MidlineProfiles | SurfaceAnchorRuleFailureV1 {
  const component = topology.midlineVertexOrder.reduce<Uint32Array | null>(
    (longest, candidate) => (!longest || candidate.length > longest.length ? candidate : longest),
    null,
  );
  if (!component || component.length < 5) return ruleFailure('Midline profile is incomplete.');

  let crotchIndex = 0;
  for (let index = 1; index < component.length; index += 1) {
    const vertex = component[index];
    const best = component[crotchIndex];
    if (
      positionsM[vertex * 3 + 1] < positionsM[best * 3 + 1] ||
      (positionsM[vertex * 3 + 1] === positionsM[best * 3 + 1] && vertex < best)
    ) {
      crotchIndex = index;
    }
  }
  if (crotchIndex === 0 || crotchIndex === component.length - 1) {
    return ruleFailure('Midline does not split at the crotch.');
  }

  // The mouth-interior vertices remain in the walked arms. They are never z-filtered.
  const firstArm = [...component.slice(0, crotchIndex + 1)].reverse();
  const secondArm = [...component.slice(crotchIndex)];
  const torsoMeanZ = (vertices: readonly number[]): number | null => {
    let sum = 0;
    let count = 0;
    for (const vertex of vertices) {
      const yFraction = fractionY(positionsM[vertex * 3 + 1], currentBounds);
      if (yFraction < 0.7 || yFraction > 0.79) continue;
      sum += positionsM[vertex * 3 + 2];
      count += 1;
    }
    return count > 0 ? sum / count : null;
  };
  const firstMeanZ = torsoMeanZ(firstArm);
  const secondMeanZ = torsoMeanZ(secondArm);
  if (firstMeanZ === null || secondMeanZ === null || firstMeanZ === secondMeanZ) {
    return ruleFailure('Midline front and back profiles are ambiguous.');
  }
  const minimumY = positionsM[component[crotchIndex] * 3 + 1];
  const crotch = [...component]
    .filter((vertex) => positionsM[vertex * 3 + 1] <= minimumY + 0.002)
    .reduce((frontmost, vertex) =>
      positionsM[vertex * 3 + 2] > positionsM[frontmost * 3 + 2] ||
      (positionsM[vertex * 3 + 2] === positionsM[frontmost * 3 + 2] && vertex < frontmost)
        ? vertex
        : frontmost,
    );
  return Object.freeze({
    front: Object.freeze(firstMeanZ > secondMeanZ ? firstArm : secondArm),
    back: Object.freeze(firstMeanZ > secondMeanZ ? secondArm : firstArm),
    crotch,
  });
}

function ssnRule(
  profile: readonly number[],
  positionsM: Float32Array,
  currentBounds: Bounds,
): SurfaceAnchorRuleResultV1 {
  const candidates = profile.filter((vertex) => {
    const value = fractionY(positionsM[vertex * 3 + 1], currentBounds);
    return value >= 0.8 && value <= 0.86;
  });
  if (candidates.length === 0) return ruleFailure('SSN profile band is empty.');
  const vertex = candidates.reduce((best, candidate) => {
    const candidateZ = positionsM[candidate * 3 + 2];
    const bestZ = positionsM[best * 3 + 2];
    return candidateZ < bestZ || (candidateZ === bestZ && candidate < best) ? candidate : best;
  });
  return ruleSuccess(vertexPosition(positionsM, vertex), meshSurfaceVertexPointV1(vertex));
}

function c7Rule(
  profile: readonly number[],
  positionsM: Float32Array,
  currentBounds: Bounds,
): SurfaceAnchorRuleResultV1 {
  let bestVertex = -1;
  let bestTurn = Number.NEGATIVE_INFINITY;
  for (let index = 1; index < profile.length - 1; index += 1) {
    const vertex = profile[index];
    const yFraction = fractionY(positionsM[vertex * 3 + 1], currentBounds);
    if (yFraction < 0.8 || yFraction > 0.88) continue;
    const previous = profile[index - 1];
    const next = profile[index + 1];
    const incoming = [
      positionsM[vertex * 3] - positionsM[previous * 3],
      positionsM[vertex * 3 + 1] - positionsM[previous * 3 + 1],
      positionsM[vertex * 3 + 2] - positionsM[previous * 3 + 2],
    ] as const;
    const outgoing = [
      positionsM[next * 3] - positionsM[vertex * 3],
      positionsM[next * 3 + 1] - positionsM[vertex * 3 + 1],
      positionsM[next * 3 + 2] - positionsM[vertex * 3 + 2],
    ] as const;
    const incomingLength = Math.hypot(...incoming);
    const outgoingLength = Math.hypot(...outgoing);
    if (incomingLength === 0 || outgoingLength === 0) continue;
    const cosine = Math.max(
      -1,
      Math.min(
        1,
        (incoming[0] * outgoing[0] + incoming[1] * outgoing[1] + incoming[2] * outgoing[2]) /
          (incomingLength * outgoingLength),
      ),
    );
    const turn = Math.acos(cosine);
    if (turn > bestTurn || (turn === bestTurn && vertex < bestVertex)) {
      bestTurn = turn;
      bestVertex = vertex;
    }
  }
  if (bestVertex < 0) return ruleFailure('C7 profile band has no valid turn.');
  return ruleSuccess(vertexPosition(positionsM, bestVertex), meshSurfaceVertexPointV1(bestVertex));
}

/** Margin far above the section plane tolerance (1e-8 m), so no crossing triangle is dropped. */
const BAND_MARGIN_M = 1e-5;

/**
 * Triangles whose extent along `axis` overlaps [minimumM, maximumM]. Every triangle a plane in that
 * range can cut is kept, so sections on the band return the same loops as on the full mesh.
 */
function bandTriangles(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  axis: 1 | 2,
  minimumM: number,
  maximumM: number,
): Uint32Array {
  const indices = topology.triangleIndices;
  const low = minimumM - BAND_MARGIN_M;
  const high = maximumM + BAND_MARGIN_M;
  const kept = new Uint32Array(indices.length);
  let count = 0;
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = positionsM[indices[offset] * 3 + axis];
    const b = positionsM[indices[offset + 1] * 3 + axis];
    const c = positionsM[indices[offset + 2] * 3 + axis];
    if (Math.max(a, b, c) < low || Math.min(a, b, c) > high) continue;
    kept[count] = indices[offset];
    kept[count + 1] = indices[offset + 1];
    kept[count + 2] = indices[offset + 2];
    count += 3;
  }
  return kept.subarray(0, count);
}

function horizontalLoops(
  triangleIndices: Uint32Array,
  positionsM: Float32Array,
  levelM: number,
): readonly MeshPlaneSectionLoopV1[] | SurfaceAnchorRuleFailureV1 {
  const section = measureMeshPlaneSectionPerimetersV1({
    positionsM,
    triangleIndices,
    planeOriginM: [0, levelM, 0],
    planeNormal: [0, 1, 0],
  });
  return section.ok ? section.loops : ruleFailure(`Horizontal section failed: ${section.code}.`);
}

function bisectionLevel(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  currentBounds: Bounds,
  lowerFraction: number,
  upperFraction: number,
  lowerLoopCount: number,
  upperLoopCount: number,
): Readonly<{ lowerM: number; upperM: number; band: Uint32Array }> | SurfaceAnchorRuleFailureV1 {
  let lowerM = currentBounds.minimumY + currentBounds.heightM * lowerFraction;
  let upperM = currentBounds.minimumY + currentBounds.heightM * upperFraction;
  const band = bandTriangles(topology, positionsM, 1, lowerM, upperM);
  const lower = horizontalLoops(band, positionsM, lowerM);
  const upper = horizontalLoops(band, positionsM, upperM);
  if ('ok' in lower) return lower;
  if ('ok' in upper) return upper;
  if (lower.length !== lowerLoopCount || upper.length !== upperLoopCount) {
    return ruleFailure(`Section transition is not ${lowerLoopCount}-to-${upperLoopCount} loops.`);
  }
  while (upperM - lowerM > SECTION_BISECTION_TOLERANCE_M) {
    const middleM = (lowerM + upperM) / 2;
    const middle = horizontalLoops(band, positionsM, middleM);
    if ('ok' in middle) return middle;
    if (middle.length === lowerLoopCount) lowerM = middleM;
    else upperM = middleM;
  }
  return Object.freeze({ lowerM, upperM, band });
}

function nearestVertex(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  point: MeshSurfaceVec3V1,
): number {
  let bestVertex = 0;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  for (let vertex = 0; vertex < topology.vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const dx = positionsM[offset] - point[0];
    const dy = positionsM[offset + 1] - point[1];
    const dz = positionsM[offset + 2] - point[2];
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      bestVertex = vertex;
    }
  }
  return bestVertex;
}

function underarmLeftRule(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  currentBounds: Bounds,
): UnderarmRuleSuccess | SurfaceAnchorRuleFailureV1 {
  const transition = bisectionLevel(topology, positionsM, currentBounds, 0.65, 0.8, 3, 1);
  if ('ok' in transition) return transition;
  const loops = horizontalLoops(transition.band, positionsM, transition.lowerM);
  if ('ok' in loops) return loops;
  if (loops.length !== 3) return ruleFailure('Last underarm section does not have three loops.');

  const byCentrality = [...loops].sort(
    (left, right) => Math.abs(left.centroidM[0]) - Math.abs(right.centroidM[0]),
  );
  const torso = byCentrality[0];
  const leftArm = [...loops].sort((left, right) => right.centroidM[0] - left.centroidM[0])[0];
  if (torso === leftArm || leftArm.centroidM[0] <= 0) {
    return ruleFailure('Left arm and torso loops are ambiguous.');
  }

  let armIndex = -1;
  let torsoIndex = -1;
  let distanceSquared = Number.POSITIVE_INFINITY;
  for (let currentArm = 0; currentArm < leftArm.pointsM.length; currentArm += 1) {
    for (let currentTorso = 0; currentTorso < torso.pointsM.length; currentTorso += 1) {
      const armPoint = leftArm.pointsM[currentArm];
      const torsoPoint = torso.pointsM[currentTorso];
      const dx = armPoint[0] - torsoPoint[0];
      const dz = armPoint[2] - torsoPoint[2];
      const candidate = dx * dx + dz * dz;
      if (candidate < distanceSquared) {
        distanceSquared = candidate;
        armIndex = currentArm;
        torsoIndex = currentTorso;
      }
    }
  }
  if (armIndex < 0 || torsoIndex < 0) return ruleFailure('Underarm gap has no closest pair.');
  const armPoint = leftArm.pointsM[armIndex];
  const torsoPoint = torso.pointsM[torsoIndex];
  const positionM = frozenVec3(
    (armPoint[0] + torsoPoint[0]) / 2,
    transition.lowerM,
    (armPoint[2] + torsoPoint[2]) / 2,
  );
  return Object.freeze({
    ...ruleSuccess(
      positionM,
      meshSurfaceVertexPointV1(nearestVertex(topology, positionsM, positionM)),
    ),
    sectionLevelM: transition.lowerM,
  });
}

function crotchRule(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  crotchVertex: number,
): SurfaceAnchorRuleResultV1 {
  const positionM = vertexPosition(positionsM, crotchVertex);
  let lowerM = positionM[1] - 0.001;
  let upperM = positionM[1] + 0.001;
  const band = bandTriangles(topology, positionsM, 1, lowerM, upperM);
  const lower = horizontalLoops(band, positionsM, lowerM);
  const upper = horizontalLoops(band, positionsM, upperM);
  if ('ok' in lower) return lower;
  if ('ok' in upper) return upper;
  if (lower.length !== 2 || upper.length === 2) {
    return ruleFailure('Midline crotch is not within 2 mm of the leg-loop transition.');
  }
  while (upperM - lowerM > SECTION_BISECTION_TOLERANCE_M / 4) {
    const middleM = (lowerM + upperM) / 2;
    const middle = horizontalLoops(band, positionsM, middleM);
    if ('ok' in middle) return middle;
    if (middle.length === 2) lowerM = middleM;
    else upperM = middleM;
  }
  return ruleSuccess(positionM, meshSurfaceVertexPointV1(crotchVertex));
}

/**
 * HPS-L, the construction behind design §2.2 (scratch `neck.mjs`): on the coronal section through
 * mid(z_C7, z_SSN), take the left contour in x ∈ (10, 220) mm, y ∈ (0.78, 0.89)·H; the neck point A is
 * the innermost contour point within 6 mm of 0.875·H; the shoulder point is the contour point whose x is
 * closest to A.x + 90 mm; the corner is the contour point between them farthest from chord A–shoulder.
 * Plateau = the largest distance between any two contour points scoring > 90% of the peak.
 */
/**
 * Points where the coronal plane z = `sectionZ` cuts the mesh, kept only inside the x/y box. Same
 * plane and same edge crossings as `measureMeshPlaneSectionPerimetersV1`, but only the triangles in
 * the box are cut: the HPS rule uses the contour points, not closed loops, and the full coronal
 * section (whole body outline) costs most of the per-shape guide budget. Shared edges repeat a point;
 * that changes no extreme, peak or plateau diameter.
 */
function coronalContour(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  sectionZ: number,
  box: Readonly<{ minimumX: number; maximumX: number; minimumY: number; maximumY: number }>,
): MeshSurfaceVec3V1[] {
  const indices = topology.triangleIndices;
  const points: MeshSurfaceVec3V1[] = [];
  const inBox = (x: number, y: number) =>
    x > box.minimumX && x < box.maximumX && y > box.minimumY && y < box.maximumY;
  const crossEdge = (a: number, b: number) => {
    const da = positionsM[a * 3 + 2] - sectionZ;
    const db = positionsM[b * 3 + 2] - sectionZ;
    if (da === 0 || !(da < 0 !== db < 0) || db === 0) return;
    const t = da / (da - db);
    const x = positionsM[a * 3] + (positionsM[b * 3] - positionsM[a * 3]) * t;
    const y = positionsM[a * 3 + 1] + (positionsM[b * 3 + 1] - positionsM[a * 3 + 1]) * t;
    if (inBox(x, y)) points.push(frozenVec3(x, y, sectionZ));
  };
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset];
    const b = indices[offset + 1];
    const c = indices[offset + 2];
    const za = positionsM[a * 3 + 2];
    const zb = positionsM[b * 3 + 2];
    const zc = positionsM[c * 3 + 2];
    if (Math.max(za, zb, zc) < sectionZ || Math.min(za, zb, zc) > sectionZ) continue;
    for (const vertex of [a, b, c]) {
      const z = positionsM[vertex * 3 + 2];
      if (z === sectionZ && inBox(positionsM[vertex * 3], positionsM[vertex * 3 + 1])) {
        points.push(vertexPosition(positionsM, vertex));
      }
    }
    crossEdge(a, b);
    crossEdge(b, c);
    crossEdge(c, a);
  }
  return points;
}

function hpsLeftRule(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  currentBounds: Bounds,
  ssn: SurfaceAnchorRuleSuccessV1,
  c7: SurfaceAnchorRuleSuccessV1,
): SurfaceAnchorRuleResultV1 {
  const sectionZ = (ssn.positionM[2] + c7.positionM[2]) / 2;
  const levelM = (fraction: number) => currentBounds.minimumY + currentBounds.heightM * fraction;
  const contour = coronalContour(topology, positionsM, sectionZ, {
    minimumX: 0.01,
    maximumX: 0.22,
    minimumY: levelM(0.78),
    maximumY: levelM(0.89),
  });
  if (contour.length === 0) return ruleFailure('Coronal section has no neck/shoulder contour.');
  const neckLevelM = levelM(0.875);
  const neckCandidates = contour.filter((point) => Math.abs(point[1] - neckLevelM) < 0.006);
  if (neckCandidates.length === 0) return ruleFailure('Neck side point is missing.');
  const neck = neckCandidates.reduce((best, point) => (point[0] < best[0] ? point : best));
  const shoulderX = neck[0] + 0.09;
  const shoulder = contour.reduce((best, point) =>
    Math.abs(point[0] - shoulderX) < Math.abs(best[0] - shoulderX) ? point : best,
  );
  const outer = contour.filter(
    (point) =>
      point[0] >= neck[0] - 0.002 &&
      point[0] <= shoulder[0] &&
      point[1] <= neck[1] + 0.001 &&
      point[1] >= shoulder[1] - 0.001,
  );
  const chordX = shoulder[0] - neck[0];
  const chordY = shoulder[1] - neck[1];
  const chordLength = Math.hypot(chordX, chordY);
  if (outer.length === 0 || chordLength === 0) {
    return ruleFailure('Neck/shoulder chord is degenerate.');
  }
  const scored = outer.map((point) => ({
    point,
    distance: Math.abs(
      ((point[0] - neck[0]) * chordY - (point[1] - neck[1]) * chordX) / chordLength,
    ),
  }));
  const peak = scored.reduce((best, candidate) =>
    candidate.distance > best.distance ? candidate : best,
  );
  if (!(peak.distance > 0)) return ruleFailure('Neck/shoulder contour has no corner.');
  const plateau = scored.filter((candidate) => candidate.distance > peak.distance * 0.9);
  let plateauM = 0;
  for (const left of plateau) {
    for (const right of plateau) {
      plateauM = Math.max(
        plateauM,
        Math.hypot(
          right.point[0] - left.point[0],
          right.point[1] - left.point[1],
          right.point[2] - left.point[2],
        ),
      );
    }
  }
  const positionM = frozenVec3(...peak.point);
  return ruleSuccess(
    positionM,
    meshSurfaceVertexPointV1(nearestVertex(topology, positionsM, positionM)),
    plateauM * 1000,
  );
}

function mirroredRule(
  source: SurfaceAnchorRuleResultV1,
  topology: MeshSurfaceTopologyV1,
): SurfaceAnchorRuleResultV1 {
  if (!source.ok) return source;
  return ruleSuccess(
    frozenVec3(-source.positionM[0], source.positionM[1], source.positionM[2]),
    mirrorMeshSurfacePointV1(source.nearest, topology),
    source.plateauMm,
  );
}

type SurfaceAnchorRuleSubsetV1 = Readonly<
  Partial<Record<SurfaceAnchorIdV1, SurfaceAnchorRuleResultV1>>
>;

/** Requested ids plus their prerequisites: HPS needs SSN and C7 (rule and height order). */
function withPrerequisites(ids: readonly SurfaceAnchorIdV1[]): readonly SurfaceAnchorIdV1[] {
  const wanted = new Set(ids);
  if (wanted.has('hps-l') || wanted.has('hps-r')) {
    wanted.add('ssn');
    wanted.add('c7');
  }
  return ANCHOR_IDS.filter((id) => wanted.has(id));
}

function failedRuleSubset(
  ids: readonly SurfaceAnchorIdV1[],
  failure: SurfaceAnchorRuleFailureV1,
): SurfaceAnchorRuleSubsetV1 {
  return Object.freeze(Object.fromEntries(ids.map((id) => [id, failure])));
}

function evaluateRuleSubset(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  ids: readonly SurfaceAnchorIdV1[],
): SurfaceAnchorRuleSubsetV1 {
  const problem = topologyProblem(topology, positionsM);
  const currentBounds = bounds(positionsM);
  if (problem || !currentBounds) {
    return failedRuleSubset(
      ids,
      ruleFailure(problem ?? 'Positions contain invalid coordinates.', 'topology-mismatch'),
    );
  }
  const wanted = new Set(ids);
  const needsHps = wanted.has('hps-l') || wanted.has('hps-r');
  const needsUnderarm = wanted.has('underarm-l') || wanted.has('underarm-r');
  const result: Partial<Record<SurfaceAnchorIdV1, SurfaceAnchorRuleResultV1>> = {};
  if (needsHps || wanted.has('ssn') || wanted.has('c7') || wanted.has('crotch')) {
    const profiles = midlineProfiles(topology, positionsM, currentBounds);
    if ('ok' in profiles) return failedRuleSubset(ids, profiles);
    const ssn = ssnRule(profiles.front, positionsM, currentBounds);
    const c7 = c7Rule(profiles.back, positionsM, currentBounds);
    if (wanted.has('ssn')) result.ssn = ssn;
    if (wanted.has('c7')) result.c7 = c7;
    if (needsHps) {
      const hpsLeft =
        ssn.ok && c7.ok
          ? hpsLeftRule(topology, positionsM, currentBounds, ssn, c7)
          : ruleFailure('HPS prerequisites failed.');
      if (wanted.has('hps-l')) result['hps-l'] = hpsLeft;
      if (wanted.has('hps-r')) result['hps-r'] = mirroredRule(hpsLeft, topology);
    }
    if (wanted.has('crotch')) result.crotch = crotchRule(topology, positionsM, profiles.crotch);
  }
  if (needsUnderarm) {
    const underarmLeft = underarmLeftRule(topology, positionsM, currentBounds);
    if (wanted.has('underarm-l')) result['underarm-l'] = underarmLeft;
    if (wanted.has('underarm-r')) result['underarm-r'] = mirroredRule(underarmLeft, topology);
  }
  return Object.freeze(result);
}

export function evaluateSurfaceAnchorRulesV1(options: {
  readonly topology: MeshSurfaceTopologyV1;
  readonly positionsM: Float32Array;
}): SurfaceAnchorRuleResultsV1 {
  return evaluateRuleSubset(
    options.topology,
    options.positionsM,
    ANCHOR_IDS,
  ) as SurfaceAnchorRuleResultsV1;
}

function distanceMm(left: MeshSurfaceVec3V1, right: MeshSurfaceVec3V1): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]) * 1000;
}

function frozenCheckedAnchor(
  tableAnchor: SurfaceAnchorV1,
  templatePositionM: MeshSurfaceVec3V1,
  ruleResult: SurfaceAnchorRuleSuccessV1,
): CheckedSurfaceAnchorV1 {
  return Object.freeze({
    template: tableAnchor.template,
    templatePositionM,
    rulePositionM: ruleResult.positionM,
    distanceMm: distanceMm(templatePositionM, ruleResult.positionM),
    ...(ruleResult.plateauMm === undefined ? {} : { plateauMm: ruleResult.plateauMm }),
  });
}

function failureResult(
  code: SurfaceAnchorFailureCodeV1,
  failures: readonly SurfaceAnchorFailureV1[],
  anchors?: Readonly<Partial<Record<SurfaceAnchorIdV1, CheckedSurfaceAnchorV1>>>,
): SurfaceAnchorCheckResultV1 {
  return Object.freeze({
    ok: false as const,
    code,
    failures: Object.freeze([...failures]),
    ...(anchors && Object.keys(anchors).length > 0
      ? { anchors: Object.freeze({ ...anchors }) }
      : {}),
  });
}

function checkAnchorSubset(
  options: {
    readonly topology: MeshSurfaceTopologyV1;
    readonly positionsM: Float32Array;
    readonly table?: readonly SurfaceAnchorV1[];
  },
  ids: readonly SurfaceAnchorIdV1[],
): SurfaceAnchorSubsetCheckResultV1 {
  const problem = topologyProblem(options.topology, options.positionsM);
  const currentBounds = bounds(options.positionsM);
  if (problem || !currentBounds) {
    const detail = problem ?? 'Positions contain invalid coordinates.';
    return failureResult(
      'topology-mismatch',
      ids.map((id) => Object.freeze({ id, code: 'topology-mismatch' as const, detail })),
    );
  }

  const table = options.table ?? SURFACE_ANCHOR_TABLE_V1;
  const tableById = new Map<SurfaceAnchorIdV1, SurfaceAnchorV1>();
  for (const entry of table) {
    if (!ANCHOR_IDS.includes(entry.id) || tableById.has(entry.id)) {
      return failureResult('anchor-check-failed', [
        Object.freeze({
          id: entry.id,
          code: 'anchor-check-failed' as const,
          detail: 'Anchor table contains an unknown or duplicate id.',
        }),
      ]);
    }
    tableById.set(entry.id, entry);
  }
  const missing = ids.find((id) => !tableById.has(id));
  if (missing) {
    return failureResult('anchor-check-failed', [
      Object.freeze({
        id: missing,
        code: 'anchor-check-failed' as const,
        detail: 'Anchor table is missing this id.',
      }),
    ]);
  }

  const rules = evaluateRuleSubset(options.topology, options.positionsM, ids);
  const failures: SurfaceAnchorFailureV1[] = [];
  const checked: Partial<Record<SurfaceAnchorIdV1, CheckedSurfaceAnchorV1>> = {};
  for (const id of ids) {
    const rule = rules[id]!;
    if (!rule.ok) {
      failures.push(Object.freeze({ id, code: rule.code, detail: rule.detail }));
      continue;
    }
    const tableAnchor = tableById.get(id)!;
    const templatePositionM = pointPosition(tableAnchor.template, options.positionsM);
    if (!templatePositionM) {
      failures.push(
        Object.freeze({
          id,
          code: 'topology-mismatch' as const,
          detail: 'Template point is invalid for this topology.',
        }),
      );
      continue;
    }
    const current = frozenCheckedAnchor(tableAnchor, templatePositionM, rule);
    checked[id] = current;
    if (current.distanceMm > tableAnchor.checkBandMm) {
      failures.push(
        Object.freeze({
          id,
          code: 'anchor-check-failed' as const,
          distanceMm: current.distanceMm,
          detail: `Template is outside the ${tableAnchor.checkBandMm} mm check band.`,
        }),
      );
    }
    if ((id === 'hps-l' || id === 'hps-r') && (current.plateauMm ?? 0) > 30) {
      failures.push(
        Object.freeze({
          id,
          code: 'anchor-check-failed' as const,
          detail: 'HPS plateau exceeds 30 mm.',
        }),
      );
    }
  }

  if (checked.ssn && checked.c7) {
    const ssnY = checked.ssn.rulePositionM[1];
    const c7Y = checked.c7.rulePositionM[1];
    if (!(ssnY < c7Y)) {
      failures.push(
        Object.freeze({
          id: 'c7',
          code: 'height-order-broken' as const,
          detail: 'SSN must be below C7.',
        }),
      );
    }
    for (const id of ['hps-l', 'hps-r'] as const) {
      const hps = checked[id];
      if (!hps) continue;
      const y = hps.rulePositionM[1];
      if (y < ssnY - 0.01 || y > c7Y + 0.01) {
        failures.push(
          Object.freeze({
            id,
            code: 'height-order-broken' as const,
            detail: 'HPS is outside the neck height order.',
          }),
        );
      }
    }
  }

  if (failures.length > 0) {
    const code = failures.some((failure) => failure.code === 'topology-mismatch')
      ? 'topology-mismatch'
      : failures.some((failure) => failure.code === 'anchor-rule-failed')
        ? 'anchor-rule-failed'
        : failures.some((failure) => failure.code === 'height-order-broken')
          ? 'height-order-broken'
          : 'anchor-check-failed';
    return failureResult(code, failures, checked);
  }

  const anchors = Object.freeze(Object.fromEntries(ids.map((id) => [id, checked[id]!])));
  const heightFractions = Object.freeze(
    Object.fromEntries(
      ids.map((id) => [id, fractionY(checked[id]!.rulePositionM[1], currentBounds)]),
    ),
  );
  return Object.freeze({ ok: true as const, anchors, heightFractions });
}

export function checkSurfaceAnchorsV1(options: {
  readonly topology: MeshSurfaceTopologyV1;
  readonly positionsM: Float32Array;
  readonly table?: readonly SurfaceAnchorV1[];
}): SurfaceAnchorCheckResultV1 {
  return checkAnchorSubset(options, ANCHOR_IDS) as SurfaceAnchorCheckResultV1;
}

/**
 * Checks only the anchors a guide uses (plus prerequisites: HPS brings SSN and C7). The neck loop
 * asks for `['ssn', 'c7', 'hps-l', 'hps-r']`: one coronal section and two midline walks, so it fits
 * inside the per-shape guide budget, while underarm and crotch need bisections of many sections.
 */
export function checkSurfaceAnchorSubsetV1(options: {
  readonly topology: MeshSurfaceTopologyV1;
  readonly positionsM: Float32Array;
  readonly ids: readonly SurfaceAnchorIdV1[];
  readonly table?: readonly SurfaceAnchorV1[];
}): SurfaceAnchorSubsetCheckResultV1 {
  return checkAnchorSubset(options, withPrerequisites(options.ids));
}
