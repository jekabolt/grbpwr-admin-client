import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import type { common_BodyMeasurementName } from 'api/proto-http/admin';
import { BODY_MEASUREMENT_GROUPS } from 'components/managers/model/components/measurements';
import { resolveModelGuidedMeasurementPreviewInputV1 } from 'components/managers/model/components/model-guided-measurement-preview-input-v1';
import {
  MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  modelOpenReferenceDirectRuntimePoseV9,
} from 'components/managers/model/components/model-open-reference-direct-pose-v9';
import { resolveModelOpenReferencePreviewInputV1 } from 'components/managers/model/components/model-open-reference-preview-input-v1';
import {
  buildMeasurementSurfaceActiveMeasurementGuideV1,
  type MeasurementSurfaceMeasurementGuidePathV1,
} from 'components/shared/measurement-surface-active-measurement-guide-v1';
import { createMeasurementOpenReferenceFullBodyLocalFkRuntimeV4 } from 'lib/cloth/body/makehuman-full-body-local-fk-runtime-v4';
import { parseMakeHumanCoreRigBundleV1 } from 'lib/cloth/body/makehuman-core-rig-pose-research-v1';
import { parseMakeHumanLimbCircumferenceDeltaBundleV1 } from 'lib/cloth/body/makehuman-limb-circumference-delta-bundle-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from 'lib/cloth/body/makehuman-torso-shape-delta-bundle-v1';
import { parseMakeHumanWaistHipRigAnchorDeltaBundleV1 } from 'lib/cloth/body/makehuman-waist-hip-rig-anchor-research-v1';
import {
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1,
  parseMakeHuman2PoseCompatibleLengthPackV1,
} from 'lib/cloth/body/makehuman2-pose-compatible-length-pack-v1';
import { createMeasurementBodyFrameV2 } from 'lib/cloth/body/measurement-body-frame-v2';
import { createMeasurementOpenReferenceBetaShapeRuntimeV1 } from 'lib/cloth/body/measurement-open-reference-beta-shape-runtime-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from 'lib/cloth/body/measurement-open-reference-display-pose-v1';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
} from 'lib/cloth/body/measurement-open-reference-display-v1';
import { createMeasurementOpenReferenceLimbSubsetRuntimeV1 } from 'lib/cloth/body/measurement-open-reference-limb-subset-runtime-v1';
import { createMeasurementOpenReferenceUniformWaistHipRuntimeV1 } from 'lib/cloth/body/measurement-open-reference-uniform-waist-hip-runtime-v1';
import type { MeasurementSurfaceMeshV1 } from 'lib/cloth/body/measurement-watertight-surface-v1';

type Vec3 = [number, number, number];
type BaseName = 'female' | 'male' | 'neutral';

const CSS_SIZE = Object.freeze([1336, 618] as const);
const MAX_DRAWING_BUFFER_PIXELS = 225_000;
const BUFFER_PIXEL_RATIO = Math.sqrt(MAX_DRAWING_BUFFER_PIXELS / (CSS_SIZE[0] * CSS_SIZE[1]));
const BUFFER_SIZE = Object.freeze([
  Math.floor(CSS_SIZE[0] * BUFFER_PIXEL_RATIO),
  Math.floor(CSS_SIZE[1] * BUFFER_PIXEL_RATIO),
] as const);
const FOV_DEGREES = 32;
const FIT_PADDING = 1.12;
const SAMPLE_STEP_M = 0.002;
const INSIDE_EPSILON_M = 0.0005;
const OCCLUSION_EPSILON_M = 0.0005;
const MAX_INSIDE_PERCENT = 1;
const MAX_DEPTH_MM = 2;
const MIN_VISIBLE_FRACTION = 0.4;
const MIN_VISIBLE_BUFFER_PX = 6;

const BASES = Object.freeze([
  Object.freeze({ name: 'female' as const, gender: 'GENDER_ENUM_FEMALE' as const }),
  Object.freeze({ name: 'male' as const, gender: 'GENDER_ENUM_MALE' as const }),
  Object.freeze({ name: 'neutral' as const, gender: undefined }),
]);

const EXTERNAL_RULER_FIELDS = new Set<common_BodyMeasurementName>([
  'BODY_MEASUREMENT_NAME_HEIGHT',
  'BODY_MEASUREMENT_NAME_WAIST_HEIGHT',
]);

type FailureRule = 'status' | 'surface' | 'visibility';

const KNOWN_FAILURE_RULES = new Map<common_BodyMeasurementName, readonly FailureRule[]>([
  // F/M/N inside 99.1/99.1/99.1%, depth 36.8/53.8/48.2 mm; N 0/68 px. Chord crosses the torso.
  ['BODY_MEASUREMENT_NAME_ACROSS_SHOULDER', ['surface', 'visibility']],
  // F/M/N inside 38.9/57.0/38.0%, depth 4.0/4.5/4.4 mm; N 0/88 px. Hidden from the front.
  ['BODY_MEASUREMENT_NAME_SLEEVE_LENGTH', ['surface', 'visibility']],
  // F/M/N inside 0/0/0%, depth 0/0/0 mm; visible 0/37, 0/36, 0/36 px. Back line, front camera.
  ['BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST', ['visibility']],
  // F/M/N inside 0/0/0%, depth 0/0/0 mm; visible 0/40 px. Back arc, front camera.
  ['BODY_MEASUREMENT_NAME_ACROSS_BACK', ['visibility']],
  // F/M/N inside 100/100/100%, depth 91.3/92.1/93.9 mm; N 0/1 px. Inside and end-on.
  ['BODY_MEASUREMENT_NAME_CHEST_DEPTH', ['surface', 'visibility']],
  // F/M/N inside 100/99.1/99.1%, depth 98.6/100.3/98.0 mm; N 0/1 px. Depth chord lies inside.
  ['BODY_MEASUREMENT_NAME_WAIST_DEPTH', ['surface', 'visibility']],
  // F/M/N inside 100/97.9/100%, depth 34.1/24.0/29.1 mm; N 0/6 px. Depth chord lies inside.
  ['BODY_MEASUREMENT_NAME_HIP_DEPTH', ['surface', 'visibility']],
]);

/*
 * TODO(guidevis-air-and-field-views): the guide contract has neither an `air` path marker nor a
 * per-field camera view. Once both exist, assert that air paths use the non-depth-tested layer,
 * project to at least 6 buffer px at V(F), and use the status constraints from report section 8.3.
 * Until then this gate measures the stage's actual fixed front camera and treats every drawn path
 * except the two analytic external rulers as a surface path.
 */

const readAsset = (path: string) => readFileSync(resolve(process.cwd(), path));
const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
  readAsset('src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin'),
);
const limbBundle = parseMakeHumanLimbCircumferenceDeltaBundleV1(
  readAsset('src/assets/cloth/makehuman-hm08-limb-circumference-deltas-v1.bin'),
);
const poseMetadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
const poseResources = Object.freeze({
  rig: parseMakeHumanCoreRigBundleV1(readAsset(poseMetadata.rigAssetPath)),
  anchors: parseMakeHumanWaistHipRigAnchorDeltaBundleV1(readAsset(poseMetadata.anchorAssetPath), {
    byteLength: poseMetadata.anchorByteLength,
    sourceRigBundleSha256: poseMetadata.rigSha256,
    sourceTorsoBundleSha256: poseMetadata.torsoDirectionBundleSha256,
  }),
});
const lengthPack = parseMakeHuman2PoseCompatibleLengthPackV1(
  readAsset(MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.assetPath),
);

class MeshIndex {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly triangleCount: number;
  readonly minimum: Vec3;
  readonly cellSize: number;
  readonly cellCounts: Vec3;
  readonly cellStart: Int32Array;
  readonly cellTriangles: Int32Array;
  readonly stamps: Int32Array;
  stampId = 1;

  constructor(positions: Float32Array, indices: Uint32Array, cellSize = 0.02) {
    this.positions = positions;
    this.indices = indices;
    this.triangleCount = indices.length / 3;
    const minimum: Vec3 = [Infinity, Infinity, Infinity];
    const maximum: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let offset = 0; offset < positions.length; offset += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        minimum[axis] = Math.min(minimum[axis], positions[offset + axis]);
        maximum[axis] = Math.max(maximum[axis], positions[offset + axis]);
      }
    }
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] -= 0.01;
      maximum[axis] += 0.01;
    }
    this.minimum = minimum;
    this.cellSize = cellSize;
    this.cellCounts = [0, 1, 2].map((axis) =>
      Math.max(1, Math.ceil((maximum[axis] - minimum[axis]) / cellSize)),
    ) as Vec3;

    const totalCells = this.cellCounts[0] * this.cellCounts[1] * this.cellCounts[2];
    const counts = new Int32Array(totalCells + 1);
    const triangleRanges: number[] = [];
    for (let triangle = 0; triangle < this.triangleCount; triangle += 1) {
      const low: Vec3 = [Infinity, Infinity, Infinity];
      const high: Vec3 = [-Infinity, -Infinity, -Infinity];
      for (let corner = 0; corner < 3; corner += 1) {
        const offset = indices[triangle * 3 + corner] * 3;
        for (let axis = 0; axis < 3; axis += 1) {
          low[axis] = Math.min(low[axis], positions[offset + axis]);
          high[axis] = Math.max(high[axis], positions[offset + axis]);
        }
      }
      const first = low.map((value, axis) =>
        this.clampCell(axis, Math.floor((value - minimum[axis]) / cellSize)),
      );
      const last = high.map((value, axis) =>
        this.clampCell(axis, Math.floor((value - minimum[axis]) / cellSize)),
      );
      triangleRanges.push(first[0], first[1], first[2], last[0], last[1], last[2]);
      for (let x = first[0]; x <= last[0]; x += 1) {
        for (let y = first[1]; y <= last[1]; y += 1) {
          for (let z = first[2]; z <= last[2]; z += 1) {
            counts[this.cell(x, y, z) + 1] += 1;
          }
        }
      }
    }
    for (let cell = 1; cell <= totalCells; cell += 1) counts[cell] += counts[cell - 1];
    this.cellStart = counts;
    this.cellTriangles = new Int32Array(counts[totalCells]);
    const fill = counts.slice(0, totalCells);
    for (let triangle = 0; triangle < this.triangleCount; triangle += 1) {
      const offset = triangle * 6;
      for (let x = triangleRanges[offset]; x <= triangleRanges[offset + 3]; x += 1) {
        for (let y = triangleRanges[offset + 1]; y <= triangleRanges[offset + 4]; y += 1) {
          for (let z = triangleRanges[offset + 2]; z <= triangleRanges[offset + 5]; z += 1) {
            this.cellTriangles[fill[this.cell(x, y, z)]++] = triangle;
          }
        }
      }
    }
    this.stamps = new Int32Array(this.triangleCount);
  }

  private clampCell(axis: number, cell: number): number {
    return Math.min(this.cellCounts[axis] - 1, Math.max(0, cell));
  }

  private cell(x: number, y: number, z: number): number {
    return (x * this.cellCounts[1] + y) * this.cellCounts[2] + z;
  }

  private vertex(triangle: number, corner: number): Vec3 {
    const offset = this.indices[triangle * 3 + corner] * 3;
    return [this.positions[offset], this.positions[offset + 1], this.positions[offset + 2]];
  }

  private rayTriangleDistance(triangle: number, origin: Vec3, direction: Vec3): number {
    const a = this.vertex(triangle, 0);
    const b = this.vertex(triangle, 1);
    const c = this.vertex(triangle, 2);
    const edge1 = subtract(b, a);
    const edge2 = subtract(c, a);
    const crossX = direction[1] * edge2[2] - direction[2] * edge2[1];
    const crossY = direction[2] * edge2[0] - direction[0] * edge2[2];
    const crossZ = direction[0] * edge2[1] - direction[1] * edge2[0];
    const determinant = edge1[0] * crossX + edge1[1] * crossY + edge1[2] * crossZ;
    if (Math.abs(determinant) < 1e-14) return -1;
    const inverse = 1 / determinant;
    const offsetX = origin[0] - a[0];
    const offsetY = origin[1] - a[1];
    const offsetZ = origin[2] - a[2];
    const u = (offsetX * crossX + offsetY * crossY + offsetZ * crossZ) * inverse;
    if (u < 0 || u > 1) return -1;
    const qx = offsetY * edge1[2] - offsetZ * edge1[1];
    const qy = offsetZ * edge1[0] - offsetX * edge1[2];
    const qz = offsetX * edge1[1] - offsetY * edge1[0];
    const v = (direction[0] * qx + direction[1] * qy + direction[2] * qz) * inverse;
    if (v < 0 || u + v > 1) return -1;
    return (edge2[0] * qx + edge2[1] * qy + edge2[2] * qz) * inverse;
  }

  hits(origin: Vec3, direction: Vec3, minimumDistance: number, maximumDistance: number): number[] {
    const hits: number[] = [];
    let entryDistance = 0;
    let exitDistance = maximumDistance;
    for (let axis = 0; axis < 3; axis += 1) {
      const low = this.minimum[axis];
      const high = this.minimum[axis] + this.cellCounts[axis] * this.cellSize;
      if (Math.abs(direction[axis]) < 1e-15) {
        if (origin[axis] < low || origin[axis] > high) return hits;
      } else {
        let first = (low - origin[axis]) / direction[axis];
        let last = (high - origin[axis]) / direction[axis];
        if (first > last) [first, last] = [last, first];
        entryDistance = Math.max(entryDistance, first);
        exitDistance = Math.min(exitDistance, last);
      }
    }
    if (entryDistance > exitDistance) return hits;

    const stampId = ++this.stampId;
    const start = [0, 1, 2].map((axis) => origin[axis] + direction[axis] * (entryDistance + 1e-9));
    const current = start.map((value, axis) =>
      this.clampCell(axis, Math.floor((value - this.minimum[axis]) / this.cellSize)),
    );
    const step = direction.map((value) => (value > 0 ? 1 : value < 0 ? -1 : 0));
    const distanceDelta = direction.map((value) =>
      value === 0 ? Infinity : this.cellSize / Math.abs(value),
    );
    const nextBoundary = [0, 1, 2].map((axis) => {
      if (direction[axis] === 0) return Infinity;
      const boundary =
        this.minimum[axis] + (current[axis] + (direction[axis] > 0 ? 1 : 0)) * this.cellSize;
      return (boundary - origin[axis]) / direction[axis];
    });

    for (;;) {
      const cell = this.cell(current[0], current[1], current[2]);
      for (let index = this.cellStart[cell]; index < this.cellStart[cell + 1]; index += 1) {
        const triangle = this.cellTriangles[index];
        if (this.stamps[triangle] === stampId) continue;
        this.stamps[triangle] = stampId;
        const distance = this.rayTriangleDistance(triangle, origin, direction);
        if (distance > minimumDistance && distance < maximumDistance) hits.push(distance);
      }
      const axis =
        nextBoundary[0] < nextBoundary[1]
          ? nextBoundary[0] < nextBoundary[2]
            ? 0
            : 2
          : nextBoundary[1] < nextBoundary[2]
            ? 1
            : 2;
      if (nextBoundary[axis] > exitDistance) break;
      current[axis] += step[axis];
      if (current[axis] < 0 || current[axis] >= this.cellCounts[axis]) break;
      nextBoundary[axis] += distanceDelta[axis];
    }
    return hits;
  }

  inside(point: Vec3): boolean {
    const directions: Vec3[] = [
      [0.5773, 0.5774, 0.5773],
      [-0.2673, 0.8018, -0.5345],
      [0.7071, -0.1, -0.7],
    ];
    let insideVotes = 0;
    for (const rawDirection of directions) {
      const length = Math.hypot(...rawDirection);
      const direction = rawDirection.map((value) => value / length) as Vec3;
      if (this.hits(point, direction, 1e-9, 100).length % 2 === 1) insideVotes += 1;
    }
    return insideVotes >= 2;
  }

  distance(point: Vec3): number {
    const centerCell = point.map((value, axis) =>
      Math.floor((value - this.minimum[axis]) / this.cellSize),
    );
    let best = Infinity;
    const stampId = ++this.stampId;
    for (let radius = 0; radius < Math.max(...this.cellCounts); radius += 1) {
      for (let x = centerCell[0] - radius; x <= centerCell[0] + radius; x += 1) {
        for (let y = centerCell[1] - radius; y <= centerCell[1] + radius; y += 1) {
          for (let z = centerCell[2] - radius; z <= centerCell[2] + radius; z += 1) {
            if (
              Math.max(
                Math.abs(x - centerCell[0]),
                Math.abs(y - centerCell[1]),
                Math.abs(z - centerCell[2]),
              ) !== radius
            ) {
              continue;
            }
            if (
              x < 0 ||
              y < 0 ||
              z < 0 ||
              x >= this.cellCounts[0] ||
              y >= this.cellCounts[1] ||
              z >= this.cellCounts[2]
            ) {
              continue;
            }
            const cell = this.cell(x, y, z);
            for (let index = this.cellStart[cell]; index < this.cellStart[cell + 1]; index += 1) {
              const triangle = this.cellTriangles[index];
              if (this.stamps[triangle] === stampId) continue;
              this.stamps[triangle] = stampId;
              best = Math.min(
                best,
                pointTriangleDistance(
                  point,
                  this.vertex(triangle, 0),
                  this.vertex(triangle, 1),
                  this.vertex(triangle, 2),
                ),
              );
            }
          }
        }
      }
      if (best <= radius * this.cellSize) break;
    }
    return best;
  }
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function pointTriangleDistance(point: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab = subtract(b, a);
  const ac = subtract(c, a);
  const ap = subtract(point, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  let nearest: Vec3;
  if (d1 <= 0 && d2 <= 0) {
    nearest = a;
  } else {
    const bp = subtract(point, b);
    const d3 = dot(ab, bp);
    const d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) {
      nearest = b;
    } else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);
        nearest = [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v];
      } else {
        const cp = subtract(point, c);
        const d5 = dot(ab, cp);
        const d6 = dot(ac, cp);
        if (d6 >= 0 && d5 <= d6) {
          nearest = c;
        } else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            const w = d2 / (d2 - d6);
            nearest = [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w];
          } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
              nearest = [
                b[0] + (c[0] - b[0]) * w,
                b[1] + (c[1] - b[1]) * w,
                b[2] + (c[2] - b[2]) * w,
              ];
            } else {
              const inverse = 1 / (va + vb + vc);
              const v = vb * inverse;
              const w = vc * inverse;
              nearest = [
                a[0] + ab[0] * v + ac[0] * w,
                a[1] + ab[1] * v + ac[1] * w,
                a[2] + ab[2] * v + ac[2] * w,
              ];
            }
          }
        }
      }
    }
  }
  return Math.hypot(point[0] - nearest[0], point[1] - nearest[1], point[2] - nearest[2]);
}

interface StageCamera {
  readonly position: Vec3;
  readonly project: (point: Vec3) => readonly [number, number];
}

function stageFrontCamera(positions: Float32Array): StageCamera {
  const minimum: Vec3 = [Infinity, Infinity, Infinity];
  const maximum: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], positions[offset + axis]);
      maximum[axis] = Math.max(maximum[axis], positions[offset + axis]);
    }
  }
  const center = [0, 1, 2].map((axis) => (minimum[axis] + maximum[axis]) / 2) as Vec3;
  let radius = 0;
  for (let offset = 0; offset < positions.length; offset += 3) {
    radius = Math.max(
      radius,
      Math.hypot(
        positions[offset] - center[0],
        positions[offset + 1] - center[1],
        positions[offset + 2] - center[2],
      ),
    );
  }
  radius = Math.max(radius, 0.1);
  const aspect = CSS_SIZE[0] / CSS_SIZE[1];
  const verticalFov = (FOV_DEGREES * Math.PI) / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const distance = (radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2)) * FIT_PADDING;
  const position: Vec3 = [center[0], center[1], center[2] + distance];
  const tangent = Math.tan(verticalFov / 2);

  return {
    position,
    project(point) {
      const x = point[0] - position[0];
      const y = point[1] - position[1];
      const z = position[2] - point[2];
      return [
        ((x / (z * tangent * aspect)) * 0.5 + 0.5) * BUFFER_SIZE[0],
        (0.5 - (y / (z * tangent)) * 0.5) * BUFFER_SIZE[1],
      ];
    },
  };
}

function pathPolyline(
  path: MeasurementSurfaceMeasurementGuidePathV1,
  positions: Float32Array,
): Vec3[] {
  const points: Vec3[] =
    path.source === 'fixed-points'
      ? path.pointsM.map((point) => [point[0], point[1], point[2]])
      : path.vertexIndices.map((vertex) => [
          positions[vertex * 3],
          positions[vertex * 3 + 1],
          positions[vertex * 3 + 2],
        ]);
  if (path.closed && points.length > 0) points.push(points[0]);
  return points;
}

interface GuideMetrics {
  readonly insidePercent: number;
  readonly maxDepthMm: number;
  readonly visiblePx: number;
  readonly projectedPx: number;
}

function measureGuide(
  paths: readonly MeasurementSurfaceMeasurementGuidePathV1[],
  mesh: MeasurementSurfaceMeshV1,
  index: MeshIndex,
  camera: StageCamera,
): GuideMetrics {
  let totalLengthM = 0;
  let insideLengthM = 0;
  let maxDepthM = 0;
  let visiblePx = 0;
  let projectedPx = 0;

  for (const path of paths) {
    const polyline = pathPolyline(path, mesh.positions);
    for (let segment = 0; segment + 1 < polyline.length; segment += 1) {
      const start = polyline[segment];
      const end = polyline[segment + 1];
      const segmentLength = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
      const sampleCount = Math.max(1, Math.ceil(segmentLength / SAMPLE_STEP_M));
      for (let sample = 0; sample < sampleCount; sample += 1) {
        const t0 = sample / sampleCount;
        const t1 = (sample + 1) / sampleCount;
        const midpointT = (sample + 0.5) / sampleCount;
        const point = interpolate(start, end, midpointT);
        const sampleLengthM = segmentLength / sampleCount;
        totalLengthM += sampleLengthM;

        const distance = index.distance(point);
        if (distance > INSIDE_EPSILON_M && index.inside(point)) {
          insideLengthM += sampleLengthM;
          maxDepthM = Math.max(maxDepthM, distance);
        }

        const projectedStart = camera.project(interpolate(start, end, t0));
        const projectedEnd = camera.project(interpolate(start, end, t1));
        const projectedLength = Math.hypot(
          projectedEnd[0] - projectedStart[0],
          projectedEnd[1] - projectedStart[1],
        );
        projectedPx += projectedLength;

        const toCamera: Vec3 = [
          camera.position[0] - point[0],
          camera.position[1] - point[1],
          camera.position[2] - point[2],
        ];
        const cameraDistance = Math.hypot(...toCamera);
        const ray = toCamera.map((value) => value / cameraDistance) as Vec3;
        if (index.hits(point, ray, OCCLUSION_EPSILON_M, cameraDistance).length === 0) {
          visiblePx += projectedLength;
        }
      }
    }
  }

  return {
    insidePercent: totalLengthM === 0 ? Infinity : (insideLengthM / totalLengthM) * 100,
    maxDepthMm: maxDepthM * 1000,
    visiblePx,
    projectedPx,
  };
}

function interpolate(start: Vec3, end: Vec3, t: number): Vec3 {
  return [
    start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t,
    start[2] + (end[2] - start[2]) * t,
  ];
}

async function buildDefaultBody(base: (typeof BASES)[number]) {
  const guided = resolveModelGuidedMeasurementPreviewInputV1({
    gender: base.gender,
    measurements: {},
  });
  const resolution = resolveModelOpenReferencePreviewInputV1(guided.input);
  if (!resolution.ok) throw new Error(`${base.name} reference body did not resolve`);
  expect(resolution.basis.basisKind).toBe(base.name);

  const measurements = resolution.measurements;
  const basis = parseMakeHumanOpenReferenceBasisV1(
    readAsset(MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[base.name].assetPath),
    base.name,
  );
  const initialFrame = createMeasurementBodyFrameV2({
    measurements,
    sourceRevision: `guide-visibility:${base.name}`,
    pose: 'A',
  });
  const openReference = createMeasurementOpenReferenceUniformHeightDisplayV1({
    basis,
    frame: initialFrame,
  });
  const waistHipRuntime = await createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
    basis,
    measurements,
    openReference,
    loadBundle: async () => torsoBundle,
  });
  const betaRuntime = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
    basis,
    measurements,
    waistHipRuntime,
    loadTorsoBundle: async () => torsoBundle,
    loadLengthPack: async () => lengthPack,
    loadPoseResources: async () => poseResources,
    createLimbRuntime: (options) =>
      createMeasurementOpenReferenceLimbSubsetRuntimeV1({
        ...options,
        loadLimbBundle: async () => limbBundle,
        loadTorsoBundle: async () => torsoBundle,
      }),
  });
  const runtime = await createMeasurementOpenReferenceFullBodyLocalFkRuntimeV4({
    basis,
    measurements,
    proxyRuntime: betaRuntime?.fkProxyRuntime ?? waistHipRuntime,
    input: modelOpenReferenceDirectRuntimePoseV9(MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9),
    sourceRevision: `guide-visibility:${base.name}`,
    loadResources: async () => poseResources as never,
  });
  const frame = createMeasurementBodyFrameV2({
    measurements,
    sourceRevision: runtime.sourceRevision,
    pose: 'A',
  });
  return { betaRuntime, frame, mesh: runtime.displayMesh };
}

interface TableRow {
  readonly field: string;
  readonly base: BaseName;
  readonly inside: string;
  readonly depth: string;
  readonly visible: string;
  readonly verdict: string;
}

function fixed(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function printTable(rows: readonly TableRow[]): void {
  console.log(
    [
      '',
      '| field | base | inside % | max depth mm | visible / projected px | verdict |',
      '|---|---:|---:|---:|---:|---|',
      ...rows.map(
        (row) =>
          `| ${row.field} | ${row.base} | ${row.inside} | ${row.depth} | ${row.visible} | ${row.verdict} |`,
      ),
    ].join('\n'),
  );
}

describe('measurement guide visibility v1', () => {
  it('keeps every canonical field visible or honestly unsupported on every real reference base', async () => {
    expect(BUFFER_SIZE).toEqual([697, 322]);
    const measurementNames = BODY_MEASUREMENT_GROUPS.flatMap((group) =>
      group.measurements.map(({ name }) => name),
    );
    expect(new Set(measurementNames).size).toBe(measurementNames.length);

    const rows: TableRow[] = [];
    const unexpectedFailures: string[] = [];
    const knownFailuresNowPassing: string[] = [];
    const knownFailureRuleMismatches: string[] = [];
    const observedKnownFailures = new Set<common_BodyMeasurementName>();

    for (const base of BASES) {
      const body = await buildDefaultBody(base);
      const meshIndex = new MeshIndex(body.mesh.positions, body.mesh.indices);
      const camera = stageFrontCamera(body.mesh.positions);

      for (const measurementName of measurementNames) {
        const guide = buildMeasurementSurfaceActiveMeasurementGuideV1({
          measurementName,
          frame: body.frame,
          mesh: body.mesh,
          neutralPose: true,
          limbSectionModes: body.betaRuntime?.limbSectionModes,
          torsoSectionStations: body.betaRuntime?.torsoSectionStations,
          neckSectionStation: body.betaRuntime?.neckSectionStation,
        });
        const field = measurementName.replace('BODY_MEASUREMENT_NAME_', '');
        const drawnStatus = guide.status === 'visible' || guide.status === 'limited';
        const statusPass = guide.paths.length === 0 ? guide.status === 'unsupported' : drawnStatus;
        const metrics =
          guide.paths.length > 0 ? measureGuide(guide.paths, body.mesh, meshIndex, camera) : null;
        const isSurfacePath = !EXTERNAL_RULER_FIELDS.has(measurementName);
        const surfacePass =
          metrics === null ||
          !isSurfacePath ||
          (metrics.insidePercent <= MAX_INSIDE_PERCENT && metrics.maxDepthMm <= MAX_DEPTH_MM);
        const visibilityPass =
          metrics === null ||
          (metrics.projectedPx > 0 &&
            metrics.visiblePx / metrics.projectedPx >= MIN_VISIBLE_FRACTION &&
            metrics.visiblePx >= MIN_VISIBLE_BUFFER_PX);
        const passed = statusPass && surfacePass && visibilityPass;
        const failedRules: FailureRule[] = [];
        if (!statusPass) failedRules.push('status');
        if (!surfacePass) failedRules.push('surface');
        if (!visibilityPass) failedRules.push('visibility');
        const expectedKnownFailureRules = KNOWN_FAILURE_RULES.get(measurementName);
        const isKnownFailure = expectedKnownFailureRules !== undefined;

        if (expectedKnownFailureRules) {
          observedKnownFailures.add(measurementName);
          if (passed) knownFailuresNowPassing.push(`${field}/${base.name}`);
          else if (failedRules.join(',') !== expectedKnownFailureRules.join(',')) {
            knownFailureRuleMismatches.push(
              `${field}/${base.name}: expected ${expectedKnownFailureRules.join('+')}, got ${failedRules.join('+')}`,
            );
          }
        } else if (!passed) {
          unexpectedFailures.push(`${field}/${base.name}: ${failedRules.join(', ')}`);
        }

        rows.push({
          field,
          base: base.name,
          inside: metrics ? fixed(metrics.insidePercent) : '—',
          depth: metrics ? fixed(metrics.maxDepthMm) : '—',
          visible: metrics
            ? `${Math.round(metrics.visiblePx)} / ${Math.round(metrics.projectedPx)}`
            : '—',
          verdict:
            guide.paths.length === 0 && guide.status === 'unsupported'
              ? 'PASS unsupported'
              : passed
                ? 'PASS'
                : `${isKnownFailure ? 'KNOWN FAIL' : 'FAIL'} ${failedRules.join('+')}`,
        });
      }
    }

    printTable(rows);

    const unobservedKnownFailures = [...KNOWN_FAILURE_RULES.keys()]
      .filter((field) => !observedKnownFailures.has(field))
      .map((field) => field.replace('BODY_MEASUREMENT_NAME_', ''));
    expect({
      unexpectedFailures,
      knownFailuresNowPassing,
      knownFailureRuleMismatches,
      unobservedKnownFailures,
    }).toEqual({
      unexpectedFailures: [],
      knownFailuresNowPassing: [],
      knownFailureRuleMismatches: [],
      unobservedKnownFailures: [],
    });
  }, 90_000);
});
