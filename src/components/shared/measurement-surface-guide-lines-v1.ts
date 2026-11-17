import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

import type {
  MeasurementSurfaceActiveMeasurementGuideV1,
  MeasurementSurfaceMeasurementGuidePathV1,
} from './measurement-surface-active-measurement-guide-v1';

/**
 * Screen-space guide lines for the measurement stage (owner-approved mockup, variant C + thicker
 * line). A browser `THREE.Line` is always 1 drawing-buffer px, so every pass is a `LineSegments2`
 * quad strip with an anti-aliased edge, measured in CSS px.
 */
export const MEASUREMENT_SURFACE_GUIDE_LINES_V1 = 'measurement-surface-guide-lines/v1' as const;

export type MeasurementSurfaceGuidePassKindV1 = 'line' | 'x-ray' | 'ends' | 'ticks';

export interface MeasurementSurfaceGuidePassV1 {
  readonly kind: MeasurementSurfaceGuidePassKindV1;
  /** false = drawn through the body (the air / x-ray layer). */
  readonly depthTest: boolean;
  readonly dashed: boolean;
  readonly widthCssPx: number;
  readonly opacity: number;
  readonly renderOrder: number;
}

const LINE_WIDTH_CSS_PX = 4;
const X_RAY_WIDTH_CSS_PX = 3;
const X_RAY_OPACITY = 0.6;
const END_DOT_CSS_PX = 10;
const TICK_WIDTH_CSS_PX = 2.4;
const TICK_OPACITY = 0.8;
const DASH_M = 0.024;
const GAP_M = 0.018;
const DOT_LENGTH_M = 0.0001;

const SURFACE_LINE: MeasurementSurfaceGuidePassV1 = Object.freeze({
  kind: 'line',
  depthTest: true,
  dashed: false,
  widthCssPx: LINE_WIDTH_CSS_PX,
  opacity: 1,
  renderOrder: 9,
});

export function measurementSurfaceGuidePassesV1(
  path: Pick<MeasurementSurfaceMeasurementGuidePathV1, 'air' | 'closed'>,
): readonly MeasurementSurfaceGuidePassV1[] {
  if (path.air === 'x-ray') {
    return Object.freeze([
      Object.freeze({
        kind: 'x-ray' as const,
        depthTest: false,
        dashed: true,
        widthCssPx: X_RAY_WIDTH_CSS_PX,
        opacity: X_RAY_OPACITY,
        renderOrder: 8,
      }),
      SURFACE_LINE,
      ...(path.closed
        ? []
        : [
            Object.freeze({
              kind: 'ends' as const,
              depthTest: false,
              dashed: false,
              widthCssPx: END_DOT_CSS_PX,
              opacity: 1,
              renderOrder: 10,
            }),
          ]),
    ]);
  }
  if (path.air === 'caliper') {
    return Object.freeze([
      Object.freeze({ ...SURFACE_LINE, depthTest: false }),
      ...(path.closed
        ? []
        : [
            Object.freeze({
              kind: 'ticks' as const,
              depthTest: false,
              dashed: false,
              widthCssPx: TICK_WIDTH_CSS_PX,
              opacity: TICK_OPACITY,
              renderOrder: 9,
            }),
          ]),
    ]);
  }
  return Object.freeze([SURFACE_LINE]);
}

export interface MeasurementSurfaceGuideSceneBindingV1 {
  readonly path: MeasurementSurfaceMeasurementGuidePathV1;
  readonly passes: readonly Readonly<{
    pass: MeasurementSurfaceGuidePassV1;
    object: LineSegments2;
  }>[];
}

function pathPolylineV1(
  path: MeasurementSurfaceMeasurementGuidePathV1,
  meshPositions: Float32Array,
): Float32Array | null {
  const points: number[] = [];
  if (path.source === 'fixed-points') {
    for (const point of path.pointsM) {
      if (point.length !== 3 || !point.every(Number.isFinite)) return null;
      points.push(...point);
    }
  } else {
    const vertexCount = meshPositions.length / 3;
    for (const vertex of path.vertexIndices) {
      if (!Number.isSafeInteger(vertex) || vertex < 0 || vertex >= vertexCount) return null;
      const offset = vertex * 3;
      points.push(meshPositions[offset], meshPositions[offset + 1], meshPositions[offset + 2]);
    }
  }
  if (points.length < 6) return null;
  if (path.closed) points.push(points[0], points[1], points[2]);
  return Float32Array.from(points);
}

function polylineSegments(polyline: Float32Array): Float32Array {
  const pointCount = polyline.length / 3;
  const segments = new Float32Array((pointCount - 1) * 6);
  for (let point = 0; point + 1 < pointCount; point += 1) {
    segments.set(polyline.subarray(point * 3, point * 3 + 6), point * 6);
  }
  return segments;
}

function endDirection(polyline: Float32Array, end: 'first' | 'last'): THREE.Vector3 {
  const count = polyline.length / 3;
  const [a, b] = end === 'first' ? [0, 1] : [count - 1, count - 2];
  const direction = new THREE.Vector3(
    polyline[a * 3] - polyline[b * 3],
    polyline[a * 3 + 1] - polyline[b * 3 + 1],
    polyline[a * 3 + 2] - polyline[b * 3 + 2],
  );
  return direction.lengthSq() > 0 ? direction.normalize() : new THREE.Vector3(1, 0, 0);
}

function endSegments(polyline: Float32Array): Float32Array {
  const count = polyline.length / 3;
  const segments = new Float32Array(12);
  ([0, count - 1] as const).forEach((point, index) => {
    const direction = endDirection(polyline, index === 0 ? 'first' : 'last');
    const x = polyline[point * 3];
    const y = polyline[point * 3 + 1];
    const z = polyline[point * 3 + 2];
    // A sub-millimetre segment with round caps renders as a dot of the pass width.
    segments.set(
      [
        x,
        y,
        z,
        x + direction.x * DOT_LENGTH_M,
        y + direction.y * DOT_LENGTH_M,
        z + direction.z * DOT_LENGTH_M,
      ],
      index * 6,
    );
  });
  return segments;
}

function tickSegments(polyline: Float32Array): Float32Array {
  const count = polyline.length / 3;
  const first = new THREE.Vector3(polyline[0], polyline[1], polyline[2]);
  const last = new THREE.Vector3(
    polyline[(count - 1) * 3],
    polyline[(count - 1) * 3 + 1],
    polyline[(count - 1) * 3 + 2],
  );
  const along = last.clone().sub(first);
  const length = along.length();
  if (length > 0) along.divideScalar(length);
  // Ticks stand across the line in the vertical plane, like caliper jaws.
  const across = new THREE.Vector3(0, 1, 0).addScaledVector(along, -along.y);
  if (across.lengthSq() < 1e-6) across.set(1, 0, 0);
  across.normalize().multiplyScalar(THREE.MathUtils.clamp(length * 0.1, 0.015, 0.03));
  const segments = new Float32Array(12);
  [first, last].forEach((point, index) => {
    const low = point.clone().sub(across);
    const high = point.clone().add(across);
    segments.set([low.x, low.y, low.z, high.x, high.y, high.z], index * 6);
  });
  return segments;
}

function passSegments(pass: MeasurementSurfaceGuidePassV1, polyline: Float32Array): Float32Array {
  if (pass.kind === 'ends') return endSegments(polyline);
  if (pass.kind === 'ticks') return tickSegments(polyline);
  return polylineSegments(polyline);
}

function lineDistances(segments: Float32Array): Float32Array {
  const distances = new Float32Array((segments.length / 6) * 2);
  let total = 0;
  for (let segment = 0; segment < segments.length / 6; segment += 1) {
    const offset = segment * 6;
    distances[segment * 2] = total;
    total += Math.hypot(
      segments[offset + 3] - segments[offset],
      segments[offset + 4] - segments[offset + 1],
      segments[offset + 5] - segments[offset + 2],
    );
    distances[segment * 2 + 1] = total;
  }
  return distances;
}

/** Writes segment buffers in place so live posed frames allocate no new GPU buffers. */
function writePassGeometry(
  object: LineSegments2,
  pass: MeasurementSurfaceGuidePassV1,
  segments: Float32Array,
): void {
  const start = object.geometry.getAttribute('instanceStart');
  if (
    start instanceof THREE.InterleavedBufferAttribute &&
    start.data.array.length === segments.length
  ) {
    (start.data.array as Float32Array).set(segments);
    start.data.needsUpdate = true;
  } else {
    const previous = object.geometry;
    object.geometry = new LineSegmentsGeometry().setPositions(segments);
    previous.dispose();
  }
  if (pass.dashed) {
    const distances = lineDistances(segments);
    const distanceStart = object.geometry.getAttribute('instanceDistanceStart');
    if (
      distanceStart instanceof THREE.InterleavedBufferAttribute &&
      distanceStart.data.array.length === distances.length
    ) {
      (distanceStart.data.array as Float32Array).set(distances);
      distanceStart.data.needsUpdate = true;
    } else {
      const buffer = new THREE.InstancedInterleavedBuffer(distances, 2, 1);
      object.geometry.setAttribute(
        'instanceDistanceStart',
        new THREE.InterleavedBufferAttribute(buffer, 1, 0),
      );
      object.geometry.setAttribute(
        'instanceDistanceEnd',
        new THREE.InterleavedBufferAttribute(buffer, 1, 1),
      );
    }
  }
  object.geometry.computeBoundingBox();
  object.geometry.computeBoundingSphere();
}

const EDGE_SMOOTHING_CHUNK = /* glsl */ `
float alpha = opacity;
#ifndef WORLD_UNITS
  // Anti-aliased edge without MSAA: fade the outer buffer pixel of the quad and its round cap.
  float guideSide = abs( vUv.x );
  float guideCap = max( abs( vUv.y ) - 1.0, 0.0 );
  float guideRadius = sqrt( guideSide * guideSide + guideCap * guideCap );
  float guideEdge = max( fwidth( guideRadius ), 1e-4 );
  alpha *= 1.0 - smoothstep( 1.0 - guideEdge, 1.0, guideRadius );
#endif
`;

function createPassMaterial(pass: MeasurementSurfaceGuidePassV1, color: string): LineMaterial {
  const material = new LineMaterial({
    color,
    linewidth: pass.widthCssPx,
    worldUnits: false,
    dashed: pass.dashed,
    dashSize: DASH_M,
    gapSize: GAP_M,
    transparent: true,
    opacity: pass.opacity,
    depthTest: pass.depthTest,
    depthWrite: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'float alpha = opacity;',
      EDGE_SMOOTHING_CHUNK,
    );
  };
  material.customProgramCacheKey = () => MEASUREMENT_SURFACE_GUIDE_LINES_V1;
  return material;
}

export function createMeasurementSurfaceGuideLayerV1(
  guide: MeasurementSurfaceActiveMeasurementGuideV1 | undefined,
  meshPositions: Float32Array,
  color: string,
): Readonly<{
  layer: THREE.Group | null;
  bindings: readonly MeasurementSurfaceGuideSceneBindingV1[];
}> {
  if (!guide || (guide.status !== 'visible' && guide.status !== 'limited')) {
    return Object.freeze({ layer: null, bindings: Object.freeze([]) });
  }
  const layer = new THREE.Group();
  layer.name = `measurement-guide:${guide.measurementName}`;
  const bindings: MeasurementSurfaceGuideSceneBindingV1[] = [];
  for (const path of guide.paths) {
    const polyline = pathPolylineV1(path, meshPositions);
    if (!polyline) continue;
    const passes = measurementSurfaceGuidePassesV1(path).map((pass) => {
      const object = new LineSegments2(new LineSegmentsGeometry(), createPassMaterial(pass, color));
      writePassGeometry(object, pass, passSegments(pass, polyline));
      object.name = `measurement-guide-path:${path.id}:${pass.kind}`;
      object.renderOrder = pass.renderOrder;
      object.userData.measurementName = guide.measurementName;
      object.userData.visualGuideOnly = true;
      object.userData.guidePass = pass.kind;
      layer.add(object);
      return Object.freeze({ pass, object });
    });
    bindings.push(Object.freeze({ path, passes: Object.freeze(passes) }));
  }
  if (bindings.length === 0) {
    disposeMeasurementSurfaceGuideLayerV1(layer);
    return Object.freeze({ layer: null, bindings: Object.freeze([]) });
  }
  return Object.freeze({ layer, bindings: Object.freeze(bindings) });
}

export function updateMeasurementSurfaceGuideLayerPositionsV1(
  bindings: readonly MeasurementSurfaceGuideSceneBindingV1[],
  meshPositions: Float32Array,
): void {
  for (const { path, passes } of bindings) {
    const polyline = pathPolylineV1(path, meshPositions);
    if (!polyline) continue;
    for (const { pass, object } of passes) {
      writePassGeometry(object, pass, passSegments(pass, polyline));
    }
  }
}

/** LineMaterial widths are in CSS px only while its resolution is the canvas CSS size. */
export function syncMeasurementSurfaceGuideResolutionV1(
  layer: THREE.Group | null,
  cssWidth: number,
  cssHeight: number,
): void {
  layer?.traverse((object) => {
    if (object instanceof LineSegments2 && object.material instanceof LineMaterial) {
      object.material.resolution.set(Math.max(cssWidth, 1), Math.max(cssHeight, 1));
    }
  });
}

export function disposeMeasurementSurfaceGuideLayerV1(group: THREE.Group | null): void {
  group?.traverse((object) => {
    if (object instanceof LineSegments2) {
      object.geometry.dispose();
      object.material.dispose();
    }
  });
}

export function measurementSurfaceGuideAirDatasetV1(
  guide: MeasurementSurfaceActiveMeasurementGuideV1 | undefined,
): string {
  if (!guide || (guide.status !== 'visible' && guide.status !== 'limited')) return 'none';
  const kinds = [...new Set(guide.paths.flatMap(({ air }) => (air ? [air] : [])))];
  return kinds.length ? kinds.sort().join(',') : 'none';
}

export type MeasurementSurfaceGuideCameraViewV1 = 'back' | 'side';

/** The focused field's camera view: its own back/side view, otherwise `front`. */
export type MeasurementSurfaceGuideCameraTargetV1 = MeasurementSurfaceGuideCameraViewV1 | 'front';

export type MeasurementSurfaceGuideCameraActionV1 =
  | 'none'
  | 'turn'
  | 'restore'
  | 'forget'
  | 'front';

/** Where the camera looks at the body from; `free` is an orbit of the owner's own. */
export type MeasurementSurfaceGuideCameraFacingV1 = 'front' | 'back' | 'side' | 'free';

/**
 * Per-field camera turn (approved mockup, variant C). A field whose guide declares a back/side view
 * turns the camera there; leaving it restores the camera the owner left. A focused field without a
 * view faces the front again when the camera still looks from the back or side after the turn was
 * let go (a tap on the stage, a blur in between); an orbit of the owner's own stays. Edit pose never
 * moves the camera by itself, and a camera the owner took over during a turn is not taken back on
 * blur.
 */
export function measurementSurfaceGuideCameraActionV1(options: {
  readonly targetView: MeasurementSurfaceGuideCameraTargetV1 | null;
  readonly turn: Readonly<{
    view: MeasurementSurfaceGuideCameraViewV1;
    ownerCameraSaved: boolean;
  }> | null;
  readonly editPose: boolean;
  readonly interactive: boolean;
  readonly cameraFacing?: MeasurementSurfaceGuideCameraFacingV1;
}): MeasurementSurfaceGuideCameraActionV1 {
  const { targetView, turn, editPose, interactive, cameraFacing = 'front' } = options;
  if (!interactive) return 'none';
  if (editPose) return turn ? 'forget' : 'none';
  if (targetView === 'back' || targetView === 'side') {
    return turn?.view === targetView ? 'none' : 'turn';
  }
  if (turn?.ownerCameraSaved) return 'restore';
  if (targetView === 'front' && (cameraFacing === 'back' || cameraFacing === 'side')) {
    return 'front';
  }
  return turn ? 'forget' : 'none';
}
