import { useEffect, useRef, type KeyboardEvent } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { VertexNormalsHelper } from 'three/examples/jsm/helpers/VertexNormalsHelper.js';
import { cn } from 'lib/utility';
import {
  updateMeasurementSurfaceLivePositionsV1,
  type MeasurementSurfaceLivePositionUpdateV1,
} from './measurement-surface-live-positions-v1';
import type { MeasurementBodyFrameV2 } from 'lib/cloth/body/measurement-body-frame-v2';
import type {
  MeasurementSurfaceLodV1,
  MeasurementSurfaceMeshV1,
  MeasurementWatertightSurfaceArtifactV1,
} from 'lib/cloth/body/measurement-watertight-surface-v1';
import type {
  MeasurementSurfaceActiveMeasurementGuideV1,
  MeasurementSurfaceMeasurementGuidePathV1,
} from './measurement-surface-active-measurement-guide-v1';

export type MeasurementSurfaceLodKey = 'display' | 'collisionCandidate';
export type MeasurementSurfaceViewPreset = 'front' | 'side' | 'back';
export type MeasurementSurfaceStageStatus = 'initializing' | 'ready' | 'error';

export interface MeasurementSurfaceOverlays {
  readonly wireframe: boolean;
  readonly normals: boolean;
  readonly landmarks: boolean;
  readonly sectionPlanes: boolean;
}

export interface MeasurementSurfacePatternPieceTransformV1 {
  readonly offsetM: readonly [number, number, number];
  readonly rotationRad: number;
}

export interface MeasurementSurfacePatternPieceContourV1 {
  readonly contourId: string;
  readonly role: 'sewing-boundary' | 'cut-boundary' | 'hole';
  readonly vertices: readonly Readonly<{
    vertexId: string;
    pointMm: Readonly<{ x: number; y: number }>;
  }>[];
}

export interface MeasurementSurfacePatternPieceSeamV1 {
  readonly seamId: string;
  readonly side: 'A' | 'B';
  readonly contourId: string;
  readonly colorCss: string | null;
  readonly orderedVertexIds: readonly string[];
  readonly thread: Readonly<{ bomLineKey: string; colorCss: string }> | null;
  readonly pins: readonly Readonly<{ pinId: string; vertexId: string }>[];
}

export interface MeasurementSurfacePatternPieceV1 {
  readonly pieceKey: string;
  readonly scopeKey: string;
  readonly pieceId: string;
  readonly pieceLineKey: string;
  readonly lane: 'left' | 'right' | 'front' | 'back';
  readonly laneIndex: number;
  readonly contours: readonly MeasurementSurfacePatternPieceContourV1[];
  readonly selected: boolean;
  readonly swatchCss: string | null;
  readonly transform: MeasurementSurfacePatternPieceTransformV1 | null;
  readonly seams: readonly MeasurementSurfacePatternPieceSeamV1[];
}

export interface MeasurementSurfacePatternPieceGuideEndpointV1 {
  readonly pieceKey: string;
  readonly contourId: string;
  readonly vertexId: string;
}

export interface MeasurementSurfacePatternPieceGuideV1 {
  readonly guideId: string;
  readonly kind: 'correspondence' | 'thread';
  readonly seamId: string;
  readonly from: MeasurementSurfacePatternPieceGuideEndpointV1;
  readonly to: MeasurementSurfacePatternPieceGuideEndpointV1;
  /** Thread guides are hidden unless the existing BOM/colorway supplied this colour. */
  readonly thread: Readonly<{ bomLineKey: string; colorCss: string }> | null;
}

export interface MeasurementSurfacePatternPieceOverlayV1 {
  /** Exact contour revision. Selection/tool changes intentionally do not mint geometry. */
  readonly revision: string;
  readonly pieces: readonly MeasurementSurfacePatternPieceV1[];
  readonly tool: 'select' | 'translate' | 'rotate';
  readonly visibility: Readonly<{
    pieces: boolean;
    edges: boolean;
    seams: boolean;
    pins: boolean;
    thread: boolean;
  }>;
  readonly guides?: readonly MeasurementSurfacePatternPieceGuideV1[];
  readonly onSelectPiece?: (
    piece: Pick<MeasurementSurfacePatternPieceV1, 'pieceKey' | 'scopeKey' | 'pieceId'>,
  ) => void;
  readonly onTransformPiece?: (
    pieceKey: string,
    transform: MeasurementSurfacePatternPieceTransformV1,
  ) => void;
}

export const MEASUREMENT_SURFACE_PATTERN_PIECE_PROJECTED_HIT_RECEIPT_V1 =
  'measurement-surface-pattern-piece-projected-hit-receipt-v1' as const;
export const MEASUREMENT_SURFACE_PATTERN_PIECE_TRANSFORM_RECEIPT_V1 =
  'measurement-surface-pattern-piece-transform-receipt-v1' as const;

export interface MeasurementSurfacePatternPieceProjectedHitReceiptV1 {
  readonly schemaVersion: typeof MEASUREMENT_SURFACE_PATTERN_PIECE_PROJECTED_HIT_RECEIPT_V1;
  readonly overlayRevision: string;
  readonly renderRevision: number;
  readonly viewport: Readonly<{ width: number; height: number }>;
  readonly targets: readonly Readonly<{
    pieceKey: string;
    pieceId: string;
    /** Canvas viewport fraction, clamped to the inclusive [0, 1] range. */
    x: number;
    /** Canvas viewport fraction, clamped to the inclusive [0, 1] range. */
    y: number;
  }>[];
}

export interface MeasurementSurfacePatternPieceTransformReceiptV1 {
  readonly schemaVersion: typeof MEASUREMENT_SURFACE_PATTERN_PIECE_TRANSFORM_RECEIPT_V1;
  readonly source: 'caller-owned-overlay-props';
  readonly overlayRevision: string;
  readonly transformRevision: string;
  readonly transforms: readonly Readonly<{
    pieceKey: string;
    pieceId: string;
    offsetM: readonly [number, number, number];
    rotationRad: number;
  }>[];
}

function measurementSurfaceReceiptRecordV1(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function measurementSurfaceReceiptStringV1(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function measurementSurfaceReceiptFiniteV1(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function measurementSurfaceReceiptHashV1(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Reconstructs the published transform receipt from caller-owned overlay props only. Local Three
 * gesture state can therefore never masquerade as a completed application transform.
 */
export function measurementSurfacePatternPieceTransformReceiptV1(
  overlay: MeasurementSurfacePatternPieceOverlayV1 | undefined,
): MeasurementSurfacePatternPieceTransformReceiptV1 | null {
  if (!overlay || !measurementSurfaceReceiptStringV1(overlay.revision)) return null;
  const seenPieceKeys = new Set<string>();
  const transforms: MeasurementSurfacePatternPieceTransformReceiptV1['transforms'][number][] = [];
  for (const piece of [...overlay.pieces].sort((left, right) =>
    left.pieceKey.localeCompare(right.pieceKey),
  )) {
    if (
      !measurementSurfaceReceiptStringV1(piece.pieceKey) ||
      !measurementSurfaceReceiptStringV1(piece.pieceId) ||
      seenPieceKeys.has(piece.pieceKey)
    ) {
      return null;
    }
    seenPieceKeys.add(piece.pieceKey);
    const offset = piece.transform?.offsetM ?? ([0, 0, 0] as const);
    const rotationRad = piece.transform?.rotationRad ?? 0;
    if (!offset.every(Number.isFinite) || !Number.isFinite(rotationRad)) return null;
    transforms.push(
      Object.freeze({
        pieceKey: piece.pieceKey,
        pieceId: piece.pieceId,
        offsetM: Object.freeze(
          offset.map((value) => (Object.is(value, -0) ? 0 : value)) as [number, number, number],
        ),
        rotationRad: Object.is(rotationRad, -0) ? 0 : rotationRad,
      }),
    );
  }
  const canonical = JSON.stringify([
    overlay.revision,
    transforms.map(({ pieceKey, pieceId, offsetM, rotationRad }) => [
      pieceKey,
      pieceId,
      offsetM,
      rotationRad,
    ]),
  ]);
  return Object.freeze({
    schemaVersion: MEASUREMENT_SURFACE_PATTERN_PIECE_TRANSFORM_RECEIPT_V1,
    source: 'caller-owned-overlay-props',
    overlayRevision: overlay.revision,
    transformRevision: `pattern-transform-v1:${measurementSurfaceReceiptHashV1(canonical)}`,
    transforms: Object.freeze(transforms),
  });
}

export function validateMeasurementSurfacePatternPieceTransformReceiptV1(
  value: unknown,
  expectedOverlayRevision: string,
): MeasurementSurfacePatternPieceTransformReceiptV1 | null {
  const record = measurementSurfaceReceiptRecordV1(value);
  if (
    !record ||
    record.schemaVersion !== MEASUREMENT_SURFACE_PATTERN_PIECE_TRANSFORM_RECEIPT_V1 ||
    record.source !== 'caller-owned-overlay-props' ||
    record.overlayRevision !== expectedOverlayRevision ||
    !measurementSurfaceReceiptStringV1(record.transformRevision) ||
    !Array.isArray(record.transforms)
  ) {
    return null;
  }
  const seenPieceKeys = new Set<string>();
  const transforms: MeasurementSurfacePatternPieceTransformReceiptV1['transforms'][number][] = [];
  for (const candidate of record.transforms) {
    const transform = measurementSurfaceReceiptRecordV1(candidate);
    const pieceKey = measurementSurfaceReceiptStringV1(transform?.pieceKey);
    const pieceId = measurementSurfaceReceiptStringV1(transform?.pieceId);
    const rotationRad = measurementSurfaceReceiptFiniteV1(transform?.rotationRad);
    const offset = transform?.offsetM;
    if (
      !transform ||
      !pieceKey ||
      !pieceId ||
      seenPieceKeys.has(pieceKey) ||
      rotationRad === null ||
      !Array.isArray(offset) ||
      offset.length !== 3 ||
      offset.some((coordinate) => measurementSurfaceReceiptFiniteV1(coordinate) === null)
    ) {
      return null;
    }
    seenPieceKeys.add(pieceKey);
    transforms.push(
      Object.freeze({
        pieceKey,
        pieceId,
        offsetM: Object.freeze([offset[0], offset[1], offset[2]] as [number, number, number]),
        rotationRad,
      }),
    );
  }
  return Object.freeze({
    schemaVersion: MEASUREMENT_SURFACE_PATTERN_PIECE_TRANSFORM_RECEIPT_V1,
    source: 'caller-owned-overlay-props',
    overlayRevision: expectedOverlayRevision,
    transformRevision: record.transformRevision as string,
    transforms: Object.freeze(transforms),
  });
}

export function validateMeasurementSurfacePatternPieceProjectedHitReceiptV1(
  value: unknown,
  expected: Readonly<{ overlayRevision: string; renderRevision?: number }>,
): MeasurementSurfacePatternPieceProjectedHitReceiptV1 | null {
  const record = measurementSurfaceReceiptRecordV1(value);
  const viewport = measurementSurfaceReceiptRecordV1(record?.viewport);
  const renderRevision = measurementSurfaceReceiptFiniteV1(record?.renderRevision);
  const width = measurementSurfaceReceiptFiniteV1(viewport?.width);
  const height = measurementSurfaceReceiptFiniteV1(viewport?.height);
  if (
    !record ||
    record.schemaVersion !== MEASUREMENT_SURFACE_PATTERN_PIECE_PROJECTED_HIT_RECEIPT_V1 ||
    record.overlayRevision !== expected.overlayRevision ||
    renderRevision === null ||
    !Number.isInteger(renderRevision) ||
    renderRevision <= 0 ||
    (expected.renderRevision !== undefined && renderRevision !== expected.renderRevision) ||
    width === null ||
    width <= 0 ||
    height === null ||
    height <= 0 ||
    !Array.isArray(record.targets)
  ) {
    return null;
  }
  const seenPieceKeys = new Set<string>();
  const targets: MeasurementSurfacePatternPieceProjectedHitReceiptV1['targets'][number][] = [];
  for (const candidate of record.targets) {
    const target = measurementSurfaceReceiptRecordV1(candidate);
    const pieceKey = measurementSurfaceReceiptStringV1(target?.pieceKey);
    const pieceId = measurementSurfaceReceiptStringV1(target?.pieceId);
    const x = measurementSurfaceReceiptFiniteV1(target?.x);
    const y = measurementSurfaceReceiptFiniteV1(target?.y);
    if (
      !target ||
      !pieceKey ||
      !pieceId ||
      seenPieceKeys.has(pieceKey) ||
      x === null ||
      x < 0 ||
      x > 1 ||
      y === null ||
      y < 0 ||
      y > 1
    ) {
      return null;
    }
    seenPieceKeys.add(pieceKey);
    targets.push(Object.freeze({ pieceKey, pieceId, x, y }));
  }
  return Object.freeze({
    schemaVersion: MEASUREMENT_SURFACE_PATTERN_PIECE_PROJECTED_HIT_RECEIPT_V1,
    overlayRevision: expected.overlayRevision,
    renderRevision,
    viewport: Object.freeze({ width, height }),
    targets: Object.freeze(targets),
  });
}

interface MeasurementSurfacePatternPieceSceneBindingV1 {
  readonly piece: MeasurementSurfacePatternPieceV1;
  readonly anchor: THREE.Group;
  readonly content: THREE.Group;
  readonly basePosition: THREE.Vector3;
  readonly meshes: readonly THREE.Mesh[];
  readonly vertexLocalPositions: ReadonlyMap<string, THREE.Vector3>;
}

interface MeasurementSurfacePatternPieceSceneGuideBindingV1 {
  readonly line: THREE.Line;
  readonly fromBinding: MeasurementSurfacePatternPieceSceneBindingV1;
  readonly fromLocal: THREE.Vector3;
  readonly toBinding: MeasurementSurfacePatternPieceSceneBindingV1;
  readonly toLocal: THREE.Vector3;
}

interface MeasurementSurfaceMeasurementGuideSceneBindingV1 {
  readonly line: THREE.Line;
  readonly path: MeasurementSurfaceMeasurementGuidePathV1;
}

interface StageRuntime {
  readonly applyView: (view: MeasurementSurfaceViewPreset) => void;
  readonly restoreCamera: (state: MeasurementSurfaceCameraStateV10) => void;
  readonly zoomBy: (factor: number) => void;
  readonly scheduleRender: () => void;
  readonly wire: THREE.Mesh;
  readonly normals: VertexNormalsHelper;
  readonly landmarks: THREE.Points;
  readonly sectionPlanes: THREE.Group;
  readonly controls: OrbitControls;
  readonly scene: THREE.Scene;
  readonly patternPieceBindings: ReadonlyMap<string, MeasurementSurfacePatternPieceSceneBindingV1>;
  readonly patternPieceGuides: readonly MeasurementSurfacePatternPieceSceneGuideBindingV1[];
  readonly updateLivePositions: (positions: Float32Array) => MeasurementSurfaceLivePositionUpdateV1;
  readonly syncMeasurementGuide: (
    guide: MeasurementSurfaceActiveMeasurementGuideV1 | undefined,
  ) => void;
  jointLayer: THREE.Group | null;
  jointMarkers: ReadonlyMap<string, THREE.Mesh>;
  jointGroupsSignature: string;
  measurementGuideLayer: THREE.Group | null;
  measurementGuideBindings: readonly MeasurementSurfaceMeasurementGuideSceneBindingV1[];
  readonly syncRotationGizmo: (editor: MeasurementSurfaceJointEditorV1 | undefined) => void;
  readonly syncPositionDragTargets: (
    targets: readonly MeasurementSurfacePositionDragTargetV8[],
  ) => void;
  readonly cancelRotationGizmo: () => void;
  readonly cancelPositionDrag: () => void;
}

export interface MeasurementSurfaceCameraStateV10 {
  readonly direction: readonly [number, number, number];
  readonly targetOffsetRadius: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  readonly distanceRadius: number;
  readonly viewPreset: MeasurementSurfaceViewPreset;
}

function finiteTuple3(value: readonly [number, number, number], label: string) {
  if (!value.every(Number.isFinite)) throw new RangeError(`${label} must be finite.`);
  return value;
}

/**
 * Stores an orbit camera relative to the current body bounds so a retained stage can rebuild its
 * posed mesh without snapping the user back to the front view.
 */
export function measurementSurfaceSnapshotCameraV10(options: {
  readonly positionM: readonly [number, number, number];
  readonly targetM: readonly [number, number, number];
  readonly centerM: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  readonly radiusM: number;
  readonly viewPreset: MeasurementSurfaceViewPreset;
}): MeasurementSurfaceCameraStateV10 {
  const position = new THREE.Vector3(...finiteTuple3(options.positionM, 'camera position'));
  const target = new THREE.Vector3(...finiteTuple3(options.targetM, 'camera target'));
  const center = new THREE.Vector3(...finiteTuple3(options.centerM, 'body center'));
  const up = new THREE.Vector3(...finiteTuple3(options.up, 'camera up'));
  if (!Number.isFinite(options.radiusM) || options.radiusM <= 0) {
    throw new RangeError('Body radius must be positive and finite.');
  }
  const offset = position.sub(target);
  const distance = offset.length();
  if (!Number.isFinite(distance) || distance <= 0 || up.lengthSq() === 0) {
    throw new RangeError('Camera direction, distance, and up vector must be non-degenerate.');
  }
  const targetOffset = target.sub(center).divideScalar(options.radiusM);
  const direction = offset.normalize();
  return Object.freeze({
    direction: Object.freeze(direction.toArray() as [number, number, number]),
    targetOffsetRadius: Object.freeze(targetOffset.toArray() as [number, number, number]),
    up: Object.freeze(up.normalize().toArray() as [number, number, number]),
    distanceRadius: distance / options.radiusM,
    viewPreset: options.viewPreset,
  });
}

export function measurementSurfaceRestoreCameraV10(options: {
  readonly state: MeasurementSurfaceCameraStateV10;
  readonly centerM: readonly [number, number, number];
  readonly radiusM: number;
}): Readonly<{
  positionM: readonly [number, number, number];
  targetM: readonly [number, number, number];
  up: readonly [number, number, number];
}> {
  const { state } = options;
  const center = new THREE.Vector3(...finiteTuple3(options.centerM, 'body center'));
  const direction = new THREE.Vector3(...finiteTuple3(state.direction, 'camera direction'));
  const targetOffset = new THREE.Vector3(
    ...finiteTuple3(state.targetOffsetRadius, 'camera target offset'),
  );
  const up = new THREE.Vector3(...finiteTuple3(state.up, 'camera up'));
  if (
    !Number.isFinite(options.radiusM) ||
    options.radiusM <= 0 ||
    !Number.isFinite(state.distanceRadius) ||
    state.distanceRadius <= 0 ||
    direction.lengthSq() === 0 ||
    up.lengthSq() === 0
  ) {
    throw new RangeError('Saved camera state must be positive, finite, and non-degenerate.');
  }
  const target = center.add(targetOffset.multiplyScalar(options.radiusM));
  const position = target
    .clone()
    .add(direction.normalize().multiplyScalar(state.distanceRadius * options.radiusM));
  return Object.freeze({
    positionM: Object.freeze(position.toArray() as [number, number, number]),
    targetM: Object.freeze(target.toArray() as [number, number, number]),
    up: Object.freeze(up.normalize().toArray() as [number, number, number]),
  });
}

export interface MeasurementSurfaceJointEditorGroupV1 {
  readonly id: string;
  readonly label: string;
  readonly headM: readonly [number, number, number];
  readonly tailM: readonly [number, number, number];
}

export interface MeasurementSurfaceJointEditorV1 {
  readonly mode: 'camera' | 'edit-pose';
  readonly groups: readonly MeasurementSurfaceJointEditorGroupV1[];
  readonly selectedGroupId: string;
  readonly selectedChannel: string;
  readonly overlayStatus: 'ready' | 'unavailable';
  /** Deterministic acceptance signal for applied versus synchronous last-valid live markers. */
  readonly liveOverlayStatus?: 'updated' | 'applied' | 'off';
  readonly liveOverlaySignature?: string;
  readonly onSelectGroup: (groupId: string) => void;
  readonly rotationGizmo?: MeasurementSurfaceRotationGizmoV6;
  readonly positionDragTargets?: readonly MeasurementSurfacePositionDragTargetV8[];
}

export function measurementSurfaceLiveJointOverlayDatasetV10(
  editor: MeasurementSurfaceJointEditorV1 | undefined,
): Readonly<{ status: 'updated' | 'applied' | 'off'; signature: string }> {
  return Object.freeze({
    status: editor?.liveOverlayStatus ?? 'off',
    signature: editor?.liveOverlaySignature ?? '',
  });
}

export interface MeasurementSurfacePositionDragTargetV8 {
  /** Stable body/overlay binding. Changing it cancels an active gesture. */
  readonly revision: string;
  readonly groupId: string;
  readonly pivotM: readonly [number, number, number];
  readonly onStart: (targetM: readonly [number, number, number]) => void;
  readonly onMove: (targetM: readonly [number, number, number]) => void;
  readonly onFinish: (outcome: 'commit' | 'cancel') => void;
}

export interface MeasurementSurfaceRotationGizmoV6 {
  /** Stable body/selection binding. Changing it cancels an active gesture. */
  readonly revision: string;
  readonly pivotM: readonly [number, number, number];
  /** Right-handed local-to-world rotation frame, flattened in row-major order. */
  readonly localToWorld: readonly [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  readonly axis: 'x' | 'y' | 'z';
  readonly onStart: (angleDegrees: number) => void;
  readonly onMove: (angleDegrees: number) => void;
  readonly onFinish: (outcome: 'commit' | 'cancel') => void;
}

interface TransformControlsPointerV6 {
  readonly x: number;
  readonly y: number;
  readonly button: number;
}

interface TransformControlsPointerAdapterV6 {
  readonly hover: (pointer: TransformControlsPointerV6) => void;
  readonly down: (pointer: TransformControlsPointerV6) => void;
  readonly move: (pointer: TransformControlsPointerV6) => void;
  readonly up: (pointer: TransformControlsPointerV6) => void;
  readonly rotationAngle: () => number;
  readonly activeAxis: () => string | null;
}

interface TransformControlsRuntimeShapeV6 {
  pointerHover?: (pointer: TransformControlsPointerV6) => void;
  pointerDown?: (pointer: TransformControlsPointerV6) => void;
  pointerMove?: (pointer: TransformControlsPointerV6) => void;
  pointerUp?: (pointer: TransformControlsPointerV6) => void;
  rotationAngle?: number;
  axis?: string | null;
}

interface TransformControlsPickerRuntimeV9 {
  readonly _gizmo?: Readonly<{
    picker?: Readonly<Record<string, THREE.Object3D>>;
  }>;
}

interface ExclusiveRendererLease {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
}

const exclusiveRendererLeases = new Map<string, ExclusiveRendererLease>();

export interface MeasurementSurfaceRendererSizeStateV1 {
  width: number;
  height: number;
  pixelRatio: number;
}

export const MEASUREMENT_SURFACE_MAX_DRAWING_BUFFER_PIXELS_V1 = 225_000;
export const MEASUREMENT_SURFACE_JOINT_MARKER_HIT_DIAMETER_CSS_PX_V1 = 56;
export const MEASUREMENT_SURFACE_JOINT_MARKER_COARSE_HIT_DIAMETER_CSS_PX_V9 = 64;

export function measurementSurfaceJointMarkerHitDiameterV9(coarsePointer: boolean): number {
  return coarsePointer
    ? MEASUREMENT_SURFACE_JOINT_MARKER_COARSE_HIT_DIAMETER_CSS_PX_V9
    : MEASUREMENT_SURFACE_JOINT_MARKER_HIT_DIAMETER_CSS_PX_V1;
}

export type MeasurementSurfaceSelectedJointVisibilityV10 = 'none' | 'visible' | 'occluded';

export function measurementSurfaceSelectedJointOcclusionSamplesV10(
  groups: readonly MeasurementSurfaceJointEditorGroupV1[],
  selectedGroupId: string,
): readonly (readonly [number, number, number])[] {
  const selected = groups.find(({ id }) => id === selectedGroupId);
  if (!selected) return Object.freeze([]);
  const parentId = selectedGroupId.endsWith('-wrist')
    ? selectedGroupId.replace(/-wrist$/u, '-elbow')
    : selectedGroupId.endsWith('-elbow')
      ? selectedGroupId.replace(/-elbow$/u, '-shoulder-group')
      : selectedGroupId.endsWith('-ankle')
        ? selectedGroupId.replace(/-ankle$/u, '-knee')
        : selectedGroupId.endsWith('-knee')
          ? selectedGroupId.replace(/-knee$/u, '-hip-group')
          : null;
  const parent = parentId ? groups.find(({ id }) => id === parentId) : null;
  if (!parent) return Object.freeze([selected.headM, selected.tailM]);
  const start = new THREE.Vector3(...parent.headM);
  const end = new THREE.Vector3(...selected.headM);
  return Object.freeze([
    Object.freeze(start.clone().lerp(end, 0.25).toArray() as [number, number, number]),
    Object.freeze(start.clone().lerp(end, 0.5).toArray() as [number, number, number]),
    Object.freeze(start.clone().lerp(end, 0.75).toArray() as [number, number, number]),
    selected.headM,
    selected.tailM,
  ]);
}

/** Distal joint centers sit slightly under their own skin; only a materially earlier surface hides them. */
export function measurementSurfaceSelectedJointVisibilityV10(options: {
  readonly groupId: string | null;
  readonly markerDistanceM: number;
  readonly nearestSurfaceDistanceM: number | null;
  readonly bodyRadiusM: number;
}): MeasurementSurfaceSelectedJointVisibilityV10 {
  if (!options.groupId) return 'none';
  if (!/(?:elbow|wrist|knee|ankle)$/u.test(options.groupId)) return 'visible';
  if (
    !Number.isFinite(options.markerDistanceM) ||
    options.markerDistanceM <= 0 ||
    !Number.isFinite(options.bodyRadiusM) ||
    options.bodyRadiusM <= 0 ||
    options.nearestSurfaceDistanceM === null ||
    !Number.isFinite(options.nearestSurfaceDistanceM)
  ) {
    return 'visible';
  }
  // The ray first meets the selected limb's own skinned surface. A generous product tolerance
  // keeps that local shell visible while a torso between the camera and limb remains occluded.
  const ownSkinToleranceM = Math.max(0.1, options.bodyRadiusM * 0.09);
  return options.markerDistanceM - options.nearestSurfaceDistanceM > ownSkinToleranceM
    ? 'occluded'
    : 'visible';
}

export function measurementSurfaceJointEditorEffectiveEditModeV1(
  editor: MeasurementSurfaceJointEditorV1 | undefined,
): boolean {
  return editor?.mode === 'edit-pose' && editor.overlayStatus === 'ready';
}

export function measurementSurfaceOrbitControlsEnabledV2(options: {
  readonly interactive: boolean;
  readonly editor: MeasurementSurfaceJointEditorV1 | undefined;
  readonly unifiedJointInteraction: boolean;
}): boolean {
  return (
    options.interactive &&
    (options.unifiedJointInteraction ||
      !measurementSurfaceJointEditorEffectiveEditModeV1(options.editor))
  );
}

export function measurementSurfaceJointGroupsSignatureV1(
  groups: readonly MeasurementSurfaceJointEditorGroupV1[],
): string {
  return JSON.stringify(groups.map(({ id, headM, tailM }) => [id, ...headM, ...tailM]));
}

export function measurementSurfaceJointGroupsTopologyMatchesV10(
  currentGroupIds: Iterable<string>,
  groups: readonly MeasurementSurfaceJointEditorGroupV1[],
): boolean {
  const current = new Set(currentGroupIds);
  return current.size === groups.length && groups.every(({ id }) => current.has(id));
}

export function measurementSurfaceRotationGizmoSignatureV6(
  gizmo: MeasurementSurfaceRotationGizmoV6 | undefined,
): string {
  return gizmo
    ? JSON.stringify([gizmo.revision, gizmo.axis, ...gizmo.pivotM, ...gizmo.localToWorld])
    : '';
}

export function measurementSurfaceRotationGizmoMatrixV6(
  frame: MeasurementSurfaceRotationGizmoV6['localToWorld'],
): THREE.Matrix4 {
  if (!frame.every(Number.isFinite)) throw new RangeError('Rotation gizmo frame must be finite.');
  return new THREE.Matrix4().set(
    frame[0],
    frame[1],
    frame[2],
    0,
    frame[3],
    frame[4],
    frame[5],
    0,
    frame[6],
    frame[7],
    frame[8],
    0,
    0,
    0,
    0,
    1,
  );
}

/**
 * `three@0.161` exposes these pointer methods in runtime JavaScript but omits them from its type
 * declaration. The narrow checked adapter fails soft if that pinned API ever disappears.
 */
export function measurementSurfaceTransformControlsPointerAdapterV6(
  controls: TransformControlsRuntimeShapeV6,
): TransformControlsPointerAdapterV6 | null {
  if (
    typeof controls.pointerHover !== 'function' ||
    typeof controls.pointerDown !== 'function' ||
    typeof controls.pointerMove !== 'function' ||
    typeof controls.pointerUp !== 'function'
  ) {
    return null;
  }
  const adapter: TransformControlsPointerAdapterV6 = {
    hover: (pointer: TransformControlsPointerV6) => controls.pointerHover?.(pointer),
    down: (pointer: TransformControlsPointerV6) => controls.pointerDown?.(pointer),
    move: (pointer: TransformControlsPointerV6) => controls.pointerMove?.(pointer),
    up: (pointer: TransformControlsPointerV6) => controls.pointerUp?.(pointer),
    rotationAngle: () =>
      typeof controls.rotationAngle === 'number' && Number.isFinite(controls.rotationAngle)
        ? controls.rotationAngle
        : 0,
    activeAxis: () => (typeof controls.axis === 'string' ? controls.axis : null),
  };
  return Object.freeze(adapter);
}

/** Widens only TransformControls' invisible rotate picker; the visible local-axis ring stays thin. */
export function measurementSurfaceExpandRotationPickerV9(
  controls: TransformControlsPickerRuntimeV9,
  minimumTubeRadius = 0.18,
): number {
  if (!Number.isFinite(minimumTubeRadius) || minimumTubeRadius <= 0) {
    throw new RangeError('Rotation picker tube radius must be positive and finite.');
  }
  const picker = controls._gizmo?.picker?.rotate;
  if (!picker) return 0;
  let replacements = 0;
  picker.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.TorusGeometry)) {
      return;
    }
    const current = object.geometry;
    const { radius, tube, radialSegments, tubularSegments, arc } = current.parameters;
    if (tube >= minimumTubeRadius) return;
    object.geometry = new THREE.TorusGeometry(
      radius,
      minimumTubeRadius,
      radialSegments,
      tubularSegments,
      arc,
    );
    current.dispose();
    replacements += 1;
  });
  return replacements;
}

/** Equal-distance projections resolve to the first group in the canonical overlay order. */
export function measurementSurfaceNearestJointMarkerV1(options: {
  readonly pointerX: number;
  readonly pointerY: number;
  readonly markers: readonly Readonly<{ id: string; screenX: number; screenY: number }>[];
  readonly hitDiameterCssPx?: number;
}): string | null {
  const hitDiameter =
    options.hitDiameterCssPx ?? MEASUREMENT_SURFACE_JOINT_MARKER_HIT_DIAMETER_CSS_PX_V1;
  if (!Number.isFinite(hitDiameter) || hitDiameter <= 0) {
    throw new RangeError('Joint marker hit diameter must be positive and finite.');
  }
  const hitRadius = hitDiameter / 2;
  let closest: { id: string; distance: number } | null = null;
  for (const marker of options.markers) {
    const distance = Math.hypot(
      options.pointerX - marker.screenX,
      options.pointerY - marker.screenY,
    );
    if (distance <= hitRadius && (closest === null || distance < closest.distance)) {
      closest = { id: marker.id, distance };
    }
  }
  return closest?.id ?? null;
}

export type MeasurementSurfaceJointPointerOwnerV9 =
  | 'position-drag'
  | 'marker-selection'
  | 'rotation-gizmo'
  | 'camera';

/** An actual ring-axis hit wins; otherwise the enlarged marker keeps selection/drag priority. */
export function measurementSurfaceJointPointerOwnerV9(options: {
  readonly button: number;
  readonly selectedMarkerId: string | null;
  readonly markerHasPositionTarget: boolean;
  readonly rotationGizmoAvailable: boolean;
  readonly rotationGizmoHit?: boolean;
}): MeasurementSurfaceJointPointerOwnerV9 {
  if (options.button === 0 && options.rotationGizmoAvailable && options.rotationGizmoHit === true) {
    return 'rotation-gizmo';
  }
  if (options.selectedMarkerId !== null) {
    return options.button === 0 && options.markerHasPositionTarget
      ? 'position-drag'
      : 'marker-selection';
  }
  return options.button === 0 && options.rotationGizmoAvailable ? 'rotation-gizmo' : 'camera';
}

/** @internal Bounds raster cost while CSS keeps the inspection surface at its full layout size. */
export function measurementSurfaceDrawingBufferPixelRatioV1(
  width: number,
  height: number,
  devicePixelRatio: number,
): number {
  const boundedDevicePixelRatio = Math.min(Math.max(devicePixelRatio, 0.25), 2);
  const pixelBudgetRatio = Math.sqrt(
    MEASUREMENT_SURFACE_MAX_DRAWING_BUFFER_PIXELS_V1 / Math.max(width * height, 1),
  );
  return Math.min(boundedDevicePixelRatio, pixelBudgetRatio);
}

/** @internal Camera changes must not reallocate an unchanged WebGL drawing buffer. */
export function resizeMeasurementSurfaceRendererIfNeededV1(
  renderer: Pick<THREE.WebGLRenderer, 'setPixelRatio' | 'setSize'>,
  state: MeasurementSurfaceRendererSizeStateV1,
  width: number,
  height: number,
  pixelRatio: number,
): boolean {
  if (state.width === width && state.height === height && state.pixelRatio === pixelRatio)
    return false;
  if (state.pixelRatio !== pixelRatio) renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  state.width = width;
  state.height = height;
  state.pixelRatio = pixelRatio;
  return true;
}

export const MEASUREMENT_SURFACE_WARMUP_RENDER_COUNT_V1 = 5;

export const MEASUREMENT_SURFACE_STAGE_DEFAULT_CLASS_NAME_V1 =
  'relative h-[68vh] min-h-96 w-full overflow-hidden bg-pageBg';

export function measurementSurfaceStageClassNameV1(className?: string): string {
  return cn(MEASUREMENT_SURFACE_STAGE_DEFAULT_CLASS_NAME_V1, className);
}

/** @internal Pre-presents both wire states, then restores the requested visible state. */
export function nextMeasurementSurfaceWarmupWireVisibilityV1(
  completedRenderCount: number,
  requestedVisibility: boolean,
): boolean | null {
  if (completedRenderCount >= MEASUREMENT_SURFACE_WARMUP_RENDER_COUNT_V1) return null;
  if (completedRenderCount === 1) return !requestedVisibility;
  return requestedVisibility;
}

/** @internal Primes every fixed camera direction before publishing the requested final view. */
export function nextMeasurementSurfaceWarmupViewV1(
  completedRenderCount: number,
  requestedView: MeasurementSurfaceViewPreset,
): MeasurementSurfaceViewPreset | null {
  if (completedRenderCount === 2) return 'side';
  if (completedRenderCount === 3) return 'back';
  if (completedRenderCount === 4) return requestedView;
  return null;
}

function cssColor(name: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!value) throw new Error(`Required design color token ${name} is missing.`);
  return value;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) material.forEach((item) => item.dispose());
  else material.dispose();
}

function createLandmarks(frame: MeasurementBodyFrameV2): THREE.Points {
  const positions = new Float32Array(frame.landmarks.length * 3);
  frame.landmarks.forEach(({ positionM }, index) => positions.set(positionM, index * 3));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: cssColor('--color-textColor'),
    depthTest: false,
    size: 0.018,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.renderOrder = 3;
  return points;
}

function createSectionPlanes(frame: MeasurementBodyFrameV2, box: THREE.Box3): THREE.Group {
  const size = box.getSize(new THREE.Vector3());
  const width = Math.max(size.x * 1.15, 0.5);
  const depth = Math.max(size.z * 1.5, 0.45);
  const group = new THREE.Group();
  for (const stationId of ['chest', 'waist', 'hip'] as const) {
    const station = frame.torsoStations.find(({ id }) => id === stationId);
    if (!station) throw new Error(`Measurement body frame is missing ${stationId} station.`);
    const planeGeometry = new THREE.PlaneGeometry(width, depth);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: cssColor('--color-borderColor'),
      depthWrite: false,
      opacity: 0.16,
      side: THREE.DoubleSide,
      transparent: true,
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = station.yM;
    plane.renderOrder = 1;
    plane.userData.surfaceSectionPlane = true;

    const edgeGeometry = new THREE.EdgesGeometry(planeGeometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: cssColor('--color-labelColor'),
      transparent: true,
      opacity: 0.72,
    });
    const edge = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edge.rotation.copy(plane.rotation);
    edge.position.copy(plane.position);
    edge.renderOrder = 2;
    edge.userData.surfaceSectionPlaneEdge = true;
    group.add(plane, edge);
  }
  return group;
}

function disposeSectionPlanes(group: THREE.Group | null): void {
  group?.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      disposeMaterial(object.material);
    }
  });
}

function measurementGuidePathPositionsV1(
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

function createMeasurementGuideLayerV1(
  guide: MeasurementSurfaceActiveMeasurementGuideV1 | undefined,
  meshPositions: Float32Array,
): Readonly<{
  layer: THREE.Group | null;
  bindings: readonly MeasurementSurfaceMeasurementGuideSceneBindingV1[];
}> {
  if (!guide || guide.status !== 'visible') {
    return Object.freeze({ layer: null, bindings: Object.freeze([]) });
  }
  const layer = new THREE.Group();
  layer.name = `measurement-guide:${guide.measurementName}`;
  const bindings: MeasurementSurfaceMeasurementGuideSceneBindingV1[] = [];
  for (const path of guide.paths) {
    const positions = measurementGuidePathPositionsV1(path, meshPositions);
    if (!positions) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
    );
    const material = new THREE.LineBasicMaterial({
      color: cssColor('--color-highlightColor'),
      depthTest: false,
      depthWrite: false,
      opacity: 1,
      transparent: true,
    });
    const line = new THREE.Line(geometry, material);
    line.name = `measurement-guide-path:${path.id}`;
    line.renderOrder = 8;
    line.userData.measurementName = guide.measurementName;
    line.userData.visualGuideOnly = true;
    layer.add(line);
    bindings.push(Object.freeze({ line, path }));
  }
  if (bindings.length === 0) {
    disposeMeasurementGuideLayerV1(layer);
    return Object.freeze({ layer: null, bindings: Object.freeze([]) });
  }
  return Object.freeze({ layer, bindings: Object.freeze(bindings) });
}

function updateMeasurementGuideLayerPositionsV1(
  bindings: readonly MeasurementSurfaceMeasurementGuideSceneBindingV1[],
  meshPositions: Float32Array,
): void {
  for (const { line, path } of bindings) {
    const positions = measurementGuidePathPositionsV1(path, meshPositions);
    if (!positions) continue;
    const attribute = line.geometry.getAttribute('position');
    if (!(attribute instanceof THREE.BufferAttribute) || attribute.count * 3 !== positions.length) {
      line.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
      );
    } else {
      (attribute.array as Float32Array).set(positions);
      attribute.needsUpdate = true;
    }
    line.geometry.computeBoundingSphere();
  }
}

function disposeMeasurementGuideLayerV1(group: THREE.Group | null): void {
  group?.traverse((object) => {
    if (object instanceof THREE.Line) {
      object.geometry.dispose();
      disposeMaterial(object.material);
    }
  });
}

export function measurementSurfaceMeasurementGuideDatasetV1(
  guide: MeasurementSurfaceActiveMeasurementGuideV1 | undefined,
): Readonly<{
  activeMeasurement: string;
  status: 'off' | MeasurementSurfaceActiveMeasurementGuideV1['status'];
  pathCount: number;
  visualGuideOnly: boolean;
}> {
  return Object.freeze({
    activeMeasurement: guide?.measurementName ?? '',
    status: guide?.status ?? 'off',
    pathCount: guide?.status === 'visible' ? guide.paths.length : 0,
    visualGuideOnly: guide?.claims.visualGuideOnly ?? false,
  });
}

function createJointEditorLayer(groups: readonly MeasurementSurfaceJointEditorGroupV1[]): {
  readonly layer: THREE.Group;
  readonly markers: ReadonlyMap<string, THREE.Mesh>;
} {
  const layer = new THREE.Group();
  layer.name = 'measurement-surface-joint-editor';
  const markers = new Map<string, THREE.Mesh>();
  const skeletonPositions = new Float32Array(groups.length * 6);
  groups.forEach((group, index) => {
    skeletonPositions.set(group.headM, index * 6);
    skeletonPositions.set(group.tailM, index * 6 + 3);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 12, 8),
      new THREE.MeshBasicMaterial({
        color: cssColor('--color-labelColor'),
        depthTest: false,
      }),
    );
    marker.position.set(...group.headM);
    marker.renderOrder = 5;
    marker.userData.jointGroupId = group.id;
    layer.add(marker);
    markers.set(group.id, marker);
  });
  const skeletonGeometry = new THREE.BufferGeometry();
  skeletonGeometry.setAttribute('position', new THREE.BufferAttribute(skeletonPositions, 3));
  const skeletonMaterial = new THREE.LineBasicMaterial({
    color: cssColor('--color-labelColor'),
    depthTest: false,
    opacity: 0.72,
    transparent: true,
  });
  const skeleton = new THREE.LineSegments(skeletonGeometry, skeletonMaterial);
  skeleton.renderOrder = 4;
  skeleton.userData.jointSkeleton = true;
  layer.add(skeleton);
  layer.visible = false;
  return { layer, markers };
}

function updateJointEditorLayer(
  layer: THREE.Group | null,
  markers: ReadonlyMap<string, THREE.Mesh>,
  groups: readonly MeasurementSurfaceJointEditorGroupV1[],
): boolean {
  if (!layer || !measurementSurfaceJointGroupsTopologyMatchesV10(markers.keys(), groups)) {
    return false;
  }
  const skeleton = layer.children.find(
    (object): object is THREE.LineSegments =>
      object instanceof THREE.LineSegments && object.userData.jointSkeleton === true,
  );
  if (!skeleton) return false;
  const positions = skeleton.geometry.getAttribute('position');
  if (!(positions instanceof THREE.BufferAttribute) || positions.count !== groups.length * 2) {
    return false;
  }
  groups.forEach((group, index) => {
    markers.get(group.id)?.position.set(...group.headM);
    positions.setXYZ(index * 2, ...group.headM);
    positions.setXYZ(index * 2 + 1, ...group.tailM);
  });
  positions.needsUpdate = true;
  skeleton.geometry.computeBoundingSphere();
  return true;
}

function disposeJointEditorLayer(layer: THREE.Group | null): void {
  layer?.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      disposeMaterial(object.material);
    }
  });
}

export function measurementSurfacePatternPieceLaneOffsetV1(options: {
  readonly lane: MeasurementSurfacePatternPieceV1['lane'];
  readonly laneIndex: number;
  readonly bodyRadiusM: number;
}): readonly [number, number, number] {
  const row = Math.max(0, Math.floor(options.laneIndex));
  const radius = options.bodyRadiusM;
  const alternating = row % 2 === 0 ? -1 : 1;
  const tier = Math.floor(row / 2);
  if (options.lane === 'left') {
    return Object.freeze([-radius * (1.03 + tier * 0.42), alternating * radius * 0.38, 0]);
  }
  if (options.lane === 'right') {
    return Object.freeze([radius * (1.03 + tier * 0.42), alternating * radius * 0.38, 0]);
  }
  if (options.lane === 'front') {
    return Object.freeze([
      alternating * radius * 0.42,
      radius * (1.02 + tier * 0.42),
      radius * 0.2,
    ]);
  }
  return Object.freeze([
    alternating * radius * 0.42,
    -radius * (1.02 + tier * 0.42),
    -radius * 0.2,
  ]);
}

function patternPieceLine(
  points: readonly THREE.Vector3[],
  color: THREE.ColorRepresentation,
  opacity = 1,
): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints([...points]);
  const material = new THREE.LineBasicMaterial({
    color,
    depthTest: true,
    depthWrite: false,
    opacity,
    transparent: opacity < 1,
  });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 6;
  return line;
}

function disposePatternPieceLayerV1(layer: THREE.Group | null): void {
  layer?.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose();
      disposeMaterial(object.material);
    }
  });
}

function createPatternPieceLayerV1(
  overlay: MeasurementSurfacePatternPieceOverlayV1 | undefined,
  bodyCenter: THREE.Vector3,
  bodyRadiusM: number,
): Readonly<{
  layer: THREE.Group | null;
  bindings: ReadonlyMap<string, MeasurementSurfacePatternPieceSceneBindingV1>;
  guides: readonly MeasurementSurfacePatternPieceSceneGuideBindingV1[];
}> {
  if (!overlay?.visibility.pieces || overlay.pieces.length === 0) {
    return Object.freeze({ layer: null, bindings: new Map(), guides: Object.freeze([]) });
  }
  const allPoints = overlay.pieces.flatMap((piece) =>
    piece.contours.flatMap((contour) => contour.vertices.map(({ pointMm }) => pointMm)),
  );
  if (allPoints.length < 3)
    return Object.freeze({ layer: null, bindings: new Map(), guides: Object.freeze([]) });
  const minX = Math.min(...allPoints.map(({ x }) => x));
  const maxX = Math.max(...allPoints.map(({ x }) => x));
  const minY = Math.min(...allPoints.map(({ y }) => y));
  const maxY = Math.max(...allPoints.map(({ y }) => y));
  const largestDimensionMm = Math.max(maxX - minX, maxY - minY);
  if (!Number.isFinite(largestDimensionMm) || largestDimensionMm <= 0) {
    return Object.freeze({ layer: null, bindings: new Map(), guides: Object.freeze([]) });
  }
  // One shared scale retains real relative piece dimensions while placement remains presentation-only.
  const scaleMPerMm = (bodyRadiusM * 1.1) / largestDimensionMm;
  const layer = new THREE.Group();
  layer.name = 'measurement-surface-pattern-pieces-v1';
  const bindings = new Map<string, MeasurementSurfacePatternPieceSceneBindingV1>();

  for (const piece of overlay.pieces) {
    const piecePoints = piece.contours.flatMap((contour) =>
      contour.vertices.map(({ pointMm }) => pointMm),
    );
    if (piecePoints.length < 3) continue;
    const pieceCenterX =
      (Math.min(...piecePoints.map(({ x }) => x)) + Math.max(...piecePoints.map(({ x }) => x))) / 2;
    const pieceCenterY =
      (Math.min(...piecePoints.map(({ y }) => y)) + Math.max(...piecePoints.map(({ y }) => y))) / 2;
    const localPoint = (pointMm: Readonly<{ x: number; y: number }>, z = 0) =>
      new THREE.Vector3(
        (pointMm.x - pieceCenterX) * scaleMPerMm,
        -(pointMm.y - pieceCenterY) * scaleMPerMm,
        z,
      );
    const anchor = new THREE.Group();
    anchor.name = `pattern-piece:${piece.pieceKey}`;
    const offset = measurementSurfacePatternPieceLaneOffsetV1({
      lane: piece.lane,
      laneIndex: piece.laneIndex,
      bodyRadiusM,
    });
    const basePosition = bodyCenter.clone().add(new THREE.Vector3(...offset));
    anchor.position
      .copy(basePosition)
      .add(new THREE.Vector3(...(piece.transform?.offsetM ?? ([0, 0, 0] as const))));
    const content = new THREE.Group();
    content.rotation.z = piece.transform?.rotationRad ?? 0;
    anchor.add(content);
    layer.add(anchor);

    const meshes: THREE.Mesh[] = [];
    const vertexLocalPositions = new Map<string, THREE.Vector3>();
    piece.contours.forEach((contour) =>
      contour.vertices.forEach(({ vertexId, pointMm }) =>
        vertexLocalPositions.set(
          `${contour.contourId}\u0000${vertexId}`,
          localPoint(pointMm, 0.02),
        ),
      ),
    );
    const outerContours = piece.contours.filter(({ role }) => role !== 'hole');
    const holeContours = piece.contours.filter(({ role }) => role === 'hole');
    outerContours.forEach((outer, outerIndex) => {
      const first = outer.vertices[0]?.pointMm;
      if (!first) return;
      const shape = new THREE.Shape();
      shape.moveTo((first.x - pieceCenterX) * scaleMPerMm, -(first.y - pieceCenterY) * scaleMPerMm);
      outer.vertices
        .slice(1)
        .forEach(({ pointMm }) =>
          shape.lineTo(
            (pointMm.x - pieceCenterX) * scaleMPerMm,
            -(pointMm.y - pieceCenterY) * scaleMPerMm,
          ),
        );
      shape.closePath();
      if (outerIndex === 0) {
        holeContours.forEach((hole) => {
          const holeFirst = hole.vertices[0]?.pointMm;
          if (!holeFirst) return;
          const path = new THREE.Path();
          path.moveTo(
            (holeFirst.x - pieceCenterX) * scaleMPerMm,
            -(holeFirst.y - pieceCenterY) * scaleMPerMm,
          );
          hole.vertices
            .slice(1)
            .forEach(({ pointMm }) =>
              path.lineTo(
                (pointMm.x - pieceCenterX) * scaleMPerMm,
                -(pointMm.y - pieceCenterY) * scaleMPerMm,
              ),
            );
          path.closePath();
          shape.holes.push(path);
        });
      }
      const geometry = new THREE.ShapeGeometry(shape);
      const material = new THREE.MeshLambertMaterial({
        color: piece.swatchCss ?? cssColor('--color-bgColor'),
        emissive: piece.selected ? cssColor('--color-highlightColor') : 0x000000,
        emissiveIntensity: piece.selected ? 0.2 : 0,
        opacity: piece.selected ? 0.96 : 0.76,
        side: THREE.DoubleSide,
        transparent: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `pattern-piece-mesh:${piece.pieceKey}:${outer.contourId}`;
      mesh.renderOrder = 4;
      mesh.userData.patternPieceKey = piece.pieceKey;
      mesh.userData.patternPieceId = piece.pieceId;
      mesh.userData.patternPieceScopeKey = piece.scopeKey;
      mesh.userData.patternPieceContourId = outer.contourId;
      content.add(mesh);
      meshes.push(mesh);
    });

    if (overlay.visibility.edges) {
      piece.contours.forEach((contour) => {
        const points = contour.vertices.map(({ pointMm }) => localPoint(pointMm, 0.004));
        if (points.length > 1) points.push(points[0].clone());
        const edge = patternPieceLine(
          points,
          piece.selected ? cssColor('--color-highlightColor') : cssColor('--color-textColor'),
          contour.role === 'hole' ? 0.55 : 0.9,
        );
        edge.name = `pattern-piece-edge:${piece.pieceKey}:${contour.contourId}`;
        edge.userData.patternPieceKey = piece.pieceKey;
        edge.userData.patternPieceContourId = contour.contourId;
        content.add(edge);
      });
    }

    if (overlay.visibility.seams) {
      piece.seams.forEach((seam) => {
        const contour = piece.contours.find(({ contourId }) => contourId === seam.contourId);
        if (!contour) return;
        const vertices = new Map(contour.vertices.map((vertex) => [vertex.vertexId, vertex]));
        const seamPoints = seam.orderedVertexIds.flatMap((vertexId) => {
          const vertex = vertices.get(vertexId);
          return vertex ? [localPoint(vertex.pointMm, 0.009)] : [];
        });
        if (seamPoints.length < 2) return;
        const seamColor = seam.colorCss ?? (seam.side === 'A' ? 0xff3b30 : 0x1268e3);
        const seamLine = patternPieceLine(seamPoints, seamColor);
        seamLine.name = `pattern-piece-seam:${seam.seamId}:${seam.side}`;
        seamLine.userData.patternPieceKey = piece.pieceKey;
        seamLine.userData.seamId = seam.seamId;
        seamLine.userData.seamSide = seam.side;
        seamLine.userData.contourId = seam.contourId;
        seamLine.userData.orderedVertexIds = seam.orderedVertexIds;
        content.add(seamLine);
        if (overlay.visibility.thread && seam.thread) {
          const threadLine = patternPieceLine(
            seamPoints.map((point) => point.clone().setZ(0.015)),
            seam.thread.colorCss,
          );
          threadLine.name = `pattern-piece-thread:${seam.seamId}:${seam.thread.bomLineKey}`;
          threadLine.userData.bomLineKey = seam.thread.bomLineKey;
          threadLine.userData.seamId = seam.seamId;
          content.add(threadLine);
        }
        if (overlay.visibility.pins) {
          seam.pins.forEach(({ pinId, vertexId }) => {
            const vertex = vertices.get(vertexId);
            if (!vertex) return;
            const start = localPoint(vertex.pointMm, 0.012);
            const end = start.clone().add(new THREE.Vector3(0, bodyRadiusM * 0.08, 0));
            const pin = patternPieceLine([start, end], seamColor);
            pin.name = `pattern-piece-pin:${seam.seamId}:${pinId}`;
            pin.userData.pinId = pinId;
            pin.userData.vertexId = vertexId;
            pin.userData.seamId = seam.seamId;
            content.add(pin);
          });
        }
      });
    }

    if (piece.selected && overlay.tool !== 'select') {
      const gizmo = new THREE.Group();
      gizmo.name = `pattern-piece-${overlay.tool}-gizmo:${piece.pieceKey}`;
      const size = bodyRadiusM * 0.13;
      if (overlay.tool === 'translate') {
        gizmo.add(
          patternPieceLine(
            [new THREE.Vector3(-size, 0, 0.02), new THREE.Vector3(size, 0, 0.02)],
            cssColor('--color-highlightColor'),
          ),
          patternPieceLine(
            [new THREE.Vector3(0, -size, 0.02), new THREE.Vector3(0, size, 0.02)],
            cssColor('--color-highlightColor'),
          ),
        );
      } else {
        const ringPoints = Array.from({ length: 33 }, (_, index) => {
          const angle = (index / 32) * Math.PI * 2;
          return new THREE.Vector3(Math.cos(angle) * size, Math.sin(angle) * size, 0.02);
        });
        gizmo.add(patternPieceLine(ringPoints, cssColor('--color-highlightColor')));
      }
      content.add(gizmo);
    }
    bindings.set(
      piece.pieceKey,
      Object.freeze({
        piece,
        anchor,
        content,
        basePosition,
        meshes: Object.freeze(meshes),
        vertexLocalPositions,
      }),
    );
  }
  const guides: MeasurementSurfacePatternPieceSceneGuideBindingV1[] = [];
  (overlay.guides ?? []).forEach((guide) => {
    if (guide.kind === 'thread' && (!overlay.visibility.thread || !guide.thread)) return;
    if (guide.kind === 'correspondence' && !overlay.visibility.seams) return;
    const fromBinding = bindings.get(guide.from.pieceKey);
    const toBinding = bindings.get(guide.to.pieceKey);
    const fromLocal = fromBinding?.vertexLocalPositions.get(
      `${guide.from.contourId}\u0000${guide.from.vertexId}`,
    );
    const toLocal = toBinding?.vertexLocalPositions.get(
      `${guide.to.contourId}\u0000${guide.to.vertexId}`,
    );
    if (!fromBinding || !toBinding || !fromLocal || !toLocal) return;
    const color =
      guide.kind === 'thread' && guide.thread
        ? guide.thread.colorCss
        : cssColor('--color-highlightColor');
    const line = patternPieceLine([new THREE.Vector3(), new THREE.Vector3()], color, 0.85);
    line.name = `pattern-piece-guide:${guide.kind}:${guide.guideId}`;
    line.userData.seamId = guide.seamId;
    line.userData.from = guide.from;
    line.userData.to = guide.to;
    line.userData.bomLineKey = guide.thread?.bomLineKey ?? '';
    layer.add(line);
    guides.push(Object.freeze({ line, fromBinding, fromLocal, toBinding, toLocal }));
  });
  return Object.freeze({ layer, bindings, guides: Object.freeze(guides) });
}

function directionForView(view: MeasurementSurfaceViewPreset): THREE.Vector3 {
  if (view === 'side') return new THREE.Vector3(1, 0, 0);
  if (view === 'back') return new THREE.Vector3(0, 0, -1);
  return new THREE.Vector3(0, 0, 1);
}

function selectLod(
  artifact: MeasurementWatertightSurfaceArtifactV1,
  lod: MeasurementSurfaceLodKey,
): MeasurementSurfaceLodV1 {
  return lod === 'display' ? artifact.lods.display : artifact.lods.collisionCandidate;
}

export function resolveMeasurementSurfaceRenderSelectionV1(
  artifact: MeasurementWatertightSurfaceArtifactV1,
  lod: MeasurementSurfaceLodKey,
  displayMeshOverride?: MeasurementSurfaceMeshV1,
): Readonly<{
  selectedLod: MeasurementSurfaceLodV1;
  renderMesh: MeasurementSurfaceMeshV1;
  dataLod: string;
  openReferenceVisual: boolean;
}> {
  const selectedLod = selectLod(artifact, lod);
  const openReferenceVisual = lod === 'display' && displayMeshOverride !== undefined;
  return Object.freeze({
    selectedLod,
    renderMesh: openReferenceVisual ? displayMeshOverride : selectedLod.mesh,
    dataLod: openReferenceVisual ? 'open-reference-display' : selectedLod.id,
    openReferenceVisual,
  });
}

export function MeasurementWatertightSurfaceV1Stage({
  artifact,
  frame,
  lod,
  displayMeshOverride,
  viewPreset,
  overlays,
  onStatus,
  onRenderCount,
  className,
  interactive = true,
  exclusiveContextGroup,
  accessibleLabel,
  jointEditor,
  liveDisplayPositions,
  unifiedJointInteraction = false,
  patternPieceOverlay,
  measurementGuide,
  retainVisibleCanvasOnRebuild = false,
}: {
  artifact: MeasurementWatertightSurfaceArtifactV1;
  frame: MeasurementBodyFrameV2;
  lod: MeasurementSurfaceLodKey;
  displayMeshOverride?: MeasurementSurfaceMeshV1;
  viewPreset: MeasurementSurfaceViewPreset;
  overlays: MeasurementSurfaceOverlays;
  onStatus: (status: MeasurementSurfaceStageStatus, error?: string) => void;
  onRenderCount: (count: number) => void;
  /** Overrides the default inspection height for compact production-editor previews. */
  className?: string;
  /** Enables pointer and keyboard camera controls. Static card previews must disable this. */
  interactive?: boolean;
  /** Makes renderers in the same on-demand surface release the previous context first. */
  exclusiveContextGroup?: string;
  /** Human-readable description. Diagnostic provenance is deliberately excluded by default. */
  accessibleLabel?: string;
  /** Optional fail-soft pointer shortcut layer. The external control rail remains keyboard authority. */
  jointEditor?: MeasurementSurfaceJointEditorV1;
  /** Retained-topology positions for live pose frames. The existing WebGL context is not replaced. */
  liveDisplayPositions?: Float32Array;
  /** Lets empty-canvas gestures orbit while joint/ring hits remain pose gestures. */
  unifiedJointInteraction?: boolean;
  /** Optional caller-owned exact pattern projection rendered inside this existing Three scene. */
  patternPieceOverlay?: MeasurementSurfacePatternPieceOverlayV1;
  /** Focus-driven visual measurement line. It is a guide, never a tape or fit claim. */
  measurementGuide?: MeasurementSurfaceActiveMeasurementGuideV1;
  /** Keeps the last rendered frame visible while replacement geometry warms on the same canvas. */
  retainVisibleCanvasOnRebuild?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<StageRuntime | null>(null);
  const cameraStateRef = useRef<MeasurementSurfaceCameraStateV10 | null>(null);
  const rendererLifetimeRef = useRef<THREE.WebGLRenderer | null>(null);
  const contextReleaseGenerationRef = useRef(0);
  const hasReadyCanvasFrameRef = useRef(false);
  const onStatusRef = useRef(onStatus);
  const onRenderCountRef = useRef(onRenderCount);
  const overlaysRef = useRef(overlays);
  const viewPresetRef = useRef(viewPreset);
  const jointEditorRef = useRef(jointEditor);
  const liveDisplayPositionsRef = useRef(liveDisplayPositions);
  const patternPieceOverlayRef = useRef(patternPieceOverlay);
  const measurementGuideRef = useRef(measurementGuide);
  onStatusRef.current = onStatus;
  onRenderCountRef.current = onRenderCount;
  overlaysRef.current = overlays;
  viewPresetRef.current = viewPreset;
  jointEditorRef.current = jointEditor;
  liveDisplayPositionsRef.current = liveDisplayPositions;
  patternPieceOverlayRef.current = patternPieceOverlay;
  measurementGuideRef.current = measurementGuide;
  const patternPieceOverlayRenderKey = patternPieceOverlay
    ? JSON.stringify([
        patternPieceOverlay.revision,
        patternPieceOverlay.tool,
        patternPieceOverlay.visibility,
        patternPieceOverlay.guides,
        patternPieceOverlay.pieces.map(({ pieceKey, selected, swatchCss, transform, seams }) => [
          pieceKey,
          selected,
          swatchCss,
          transform,
          seams,
        ]),
      ])
    : '';

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const retainedCameraAtMount = interactive ? cameraStateRef.current : null;

    let animationFrame = 0;
    let readyFrame = 0;
    let readyScheduled = false;
    let warmupRenderCount = 0;
    let disposed = false;
    let renderCount = 0;
    let resizeObserver: ResizeObserver | null = null;
    let controls: OrbitControls | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let surfaceMaterial: THREE.MeshLambertMaterial | null = null;
    let wireMaterial: THREE.MeshBasicMaterial | null = null;
    let normals: VertexNormalsHelper | null = null;
    let landmarks: THREE.Points | null = null;
    let sectionPlanes: THREE.Group | null = null;
    let grid: THREE.GridHelper | null = null;
    let jointPointerHandler: ((event: PointerEvent) => void) | null = null;
    let jointPointerMoveHandler: ((event: PointerEvent) => void) | null = null;
    let jointPointerFinishHandler: ((event: PointerEvent) => void) | null = null;
    let jointPointerCancelHandler: ((event: PointerEvent) => void) | null = null;
    let jointLostPointerCaptureHandler: ((event: PointerEvent) => void) | null = null;
    let jointPointerLeaveHandler: (() => void) | null = null;
    let rotationEscapeHandler: ((event: globalThis.KeyboardEvent) => void) | null = null;
    let rotationBlurHandler: (() => void) | null = null;
    let rotationVisibilityHandler: (() => void) | null = null;
    let transformControls: TransformControls | null = null;
    let transformPointerAdapter: TransformControlsPointerAdapterV6 | null = null;
    let transformAnchor: THREE.Object3D | null = null;
    let transformObjectChangeHandler: (() => void) | null = null;
    let transformSignature = '';
    let transformPublishedAxis: MeasurementSurfaceRotationGizmoV6['axis'] | 'none' = 'none';
    let transformSession: Readonly<{
      pointerId: number;
      signature: string;
      onMove: (angleDegrees: number) => void;
      onFinish: (outcome: 'commit' | 'cancel') => void;
    }> | null = null;
    let positionDragSession: Readonly<{
      pointerId: number;
      revision: string;
      plane: THREE.Plane;
      onMove: (targetM: readonly [number, number, number]) => void;
      onFinish: (outcome: 'commit' | 'cancel') => void;
    }> | null = null;
    let suppressTransformMove = false;
    let contextCanvas: HTMLCanvasElement | null = null;
    let contextLostHandler: ((event: { preventDefault(): void }) => void) | null = null;
    let scene: THREE.Scene | null = null;
    let surface: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let bodyCenter: THREE.Vector3 | null = null;
    let bodyRadius = 0;
    let patternPieceLayer: THREE.Group | null = null;
    let measurementGuideLayer: THREE.Group | null = null;
    let measurementGuideBindings: readonly MeasurementSurfaceMeasurementGuideSceneBindingV1[] =
      Object.freeze([]);
    let patternPiecePointerDownHandler: ((event: PointerEvent) => void) | null = null;
    let patternPiecePointerMoveHandler: ((event: PointerEvent) => void) | null = null;
    let patternPiecePointerFinishHandler: ((event: PointerEvent) => void) | null = null;
    let patternPieceGesture: Readonly<{
      pointerId: number;
      binding: MeasurementSurfacePatternPieceSceneBindingV1;
      tool: 'translate' | 'rotate';
      plane: THREE.Plane;
      startPoint: THREE.Vector3;
      startPosition: THREE.Vector3;
      startAngle: number;
      startRotation: number;
    }> | null = null;
    const rendererSize: MeasurementSurfaceRendererSizeStateV1 = {
      width: 0,
      height: 0,
      pixelRatio: 0,
    };

    function writeTransformDataset() {
      if (!contextCanvas) return;
      contextCanvas.dataset.transformAxis = transformPublishedAxis;
      contextCanvas.dataset.gizmoDragging = transformSession ? 'true' : 'false';
    }

    function normalizedTransformPointer(event: PointerEvent, button: number) {
      if (!contextCanvas) return null;
      const rect = contextCanvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return Object.freeze({
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
        button,
      });
    }

    function patternPieceHit(event: PointerEvent) {
      if (!contextCanvas || !camera || !runtimeRef.current?.patternPieceBindings.size) return null;
      const pointer = normalizedTransformPointer(event, event.button);
      if (!pointer) return null;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), camera);
      const meshes = [...runtimeRef.current.patternPieceBindings.values()].flatMap(
        ({ meshes }) => meshes,
      );
      const hit = raycaster.intersectObjects(meshes, false)[0]?.object;
      const pieceKey =
        typeof hit?.userData.patternPieceKey === 'string' ? hit.userData.patternPieceKey : null;
      return pieceKey ? runtimeRef.current.patternPieceBindings.get(pieceKey) ?? null : null;
    }

    function projectedPatternPieceHitTarget(
      binding: MeasurementSurfacePatternPieceSceneBindingV1,
      allMeshes: readonly THREE.Mesh[],
    ): MeasurementSurfacePatternPieceProjectedHitReceiptV1['targets'][number] | null {
      if (!camera) return null;
      const raycaster = new THREE.Raycaster();
      for (const mesh of binding.meshes) {
        const position = mesh.geometry.getAttribute('position');
        if (!(position instanceof THREE.BufferAttribute) || position.itemSize < 3) continue;
        const index = mesh.geometry.getIndex();
        const triangleCount = Math.floor((index?.count ?? position.count) / 3);
        const stride = Math.max(1, Math.floor(triangleCount / 256));
        for (let triangle = 0; triangle < triangleCount; triangle += stride) {
          const vertexOffset = triangle * 3;
          const aIndex = index ? index.getX(vertexOffset) : vertexOffset;
          const bIndex = index ? index.getX(vertexOffset + 1) : vertexOffset + 1;
          const cIndex = index ? index.getX(vertexOffset + 2) : vertexOffset + 2;
          const centroid = new THREE.Vector3()
            .fromBufferAttribute(position, aIndex)
            .add(new THREE.Vector3().fromBufferAttribute(position, bIndex))
            .add(new THREE.Vector3().fromBufferAttribute(position, cIndex))
            .multiplyScalar(1 / 3);
          mesh.localToWorld(centroid);
          const projected = centroid.clone().project(camera);
          if (
            !Number.isFinite(projected.x) ||
            !Number.isFinite(projected.y) ||
            !Number.isFinite(projected.z) ||
            projected.z < -1 ||
            projected.z > 1 ||
            projected.x < -1 ||
            projected.x > 1 ||
            projected.y < -1 ||
            projected.y > 1
          ) {
            continue;
          }
          raycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
          const firstHit = raycaster.intersectObjects([...allMeshes], false)[0]?.object;
          if (firstHit?.userData.patternPieceKey !== binding.piece.pieceKey) continue;
          const roundViewportFraction = (value: number) =>
            THREE.MathUtils.clamp(Math.round(value * 1_000_000) / 1_000_000, 0, 1);
          return Object.freeze({
            pieceKey: binding.piece.pieceKey,
            pieceId: binding.piece.pieceId,
            x: roundViewportFraction((projected.x + 1) / 2),
            y: roundViewportFraction((1 - projected.y) / 2),
          });
        }
      }
      return null;
    }

    function publishPatternPieceAcceptanceReceipts(renderRevision: number) {
      if (!contextCanvas || !camera) return;
      const overlay = patternPieceOverlayRef.current;
      const transformReceipt = measurementSurfacePatternPieceTransformReceiptV1(overlay);
      if (transformReceipt) {
        contextCanvas.dataset.patternPieceTransformReceipt = JSON.stringify(transformReceipt);
        contextCanvas.dataset.patternPieceTransformRevision = transformReceipt.transformRevision;
      } else {
        delete contextCanvas.dataset.patternPieceTransformReceipt;
        delete contextCanvas.dataset.patternPieceTransformRevision;
      }
      const bindings = [...(runtimeRef.current?.patternPieceBindings.values() ?? [])].sort((a, b) =>
        a.piece.pieceKey.localeCompare(b.piece.pieceKey),
      );
      const rect = contextCanvas.getBoundingClientRect();
      if (
        !overlay ||
        bindings.length === 0 ||
        !Number.isFinite(rect.width) ||
        rect.width <= 0 ||
        !Number.isFinite(rect.height) ||
        rect.height <= 0
      ) {
        delete contextCanvas.dataset.patternPieceHitReceipt;
        return;
      }
      camera.updateMatrixWorld(true);
      const allMeshes = bindings.flatMap(({ meshes }) => meshes);
      const targets = bindings.flatMap((binding) => {
        const target = projectedPatternPieceHitTarget(binding, allMeshes);
        return target ? [target] : [];
      });
      // The contract is all-or-nothing: a partial target list could select the wrong visible piece.
      if (targets.length !== bindings.length) {
        delete contextCanvas.dataset.patternPieceHitReceipt;
        return;
      }
      const receipt: MeasurementSurfacePatternPieceProjectedHitReceiptV1 = Object.freeze({
        schemaVersion: MEASUREMENT_SURFACE_PATTERN_PIECE_PROJECTED_HIT_RECEIPT_V1,
        overlayRevision: overlay.revision,
        renderRevision,
        viewport: Object.freeze({ width: rect.width, height: rect.height }),
        targets: Object.freeze(targets),
      });
      contextCanvas.dataset.patternPieceHitReceipt = JSON.stringify(receipt);
    }

    function pointerAngleAroundPatternPiece(
      event: PointerEvent,
      binding: MeasurementSurfacePatternPieceSceneBindingV1,
    ) {
      if (!camera || !contextCanvas) return 0;
      const rect = contextCanvas.getBoundingClientRect();
      const projected = binding.anchor.position.clone().project(camera);
      const centerX = rect.left + ((projected.x + 1) * rect.width) / 2;
      const centerY = rect.top + ((1 - projected.y) * rect.height) / 2;
      return Math.atan2(event.clientY - centerY, event.clientX - centerX);
    }

    function finishPatternPieceGesture() {
      const gesture = patternPieceGesture;
      if (!gesture) return;
      patternPieceGesture = null;
      if (contextCanvas?.hasPointerCapture(gesture.pointerId)) {
        contextCanvas.releasePointerCapture(gesture.pointerId);
      }
      if (controls) controls.enabled = interactive;
      const offset = gesture.binding.anchor.position.clone().sub(gesture.binding.basePosition);
      patternPieceOverlayRef.current?.onTransformPiece?.(
        gesture.binding.piece.pieceKey,
        Object.freeze({
          offsetM: Object.freeze(offset.toArray() as [number, number, number]),
          rotationRad: gesture.binding.content.rotation.z,
        }),
      );
      if (contextCanvas) {
        contextCanvas.dataset.patternPieceGesture = 'idle';
        contextCanvas.style.cursor = '';
      }
      scheduleRender();
    }

    function projectedJointMarkerId(
      event: PointerEvent,
      editor: MeasurementSurfaceJointEditorV1,
    ): string | null {
      if (!renderer || !controls) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const markers: { id: string; screenX: number; screenY: number }[] = [];
      for (const group of editor.groups) {
        const projected = new THREE.Vector3(...group.headM).project(controls.object);
        if (projected.z < -1 || projected.z > 1) continue;
        markers.push({
          id: group.id,
          screenX: ((projected.x + 1) * rect.width) / 2,
          screenY: ((1 - projected.y) * rect.height) / 2,
        });
      }
      const coarsePointer =
        event.pointerType === 'touch' ||
        event.pointerType === 'pen' ||
        (window.matchMedia?.('(pointer: coarse)').matches ?? false);
      return measurementSurfaceNearestJointMarkerV1({
        pointerX: event.clientX - rect.left,
        pointerY: event.clientY - rect.top,
        markers,
        hitDiameterCssPx: measurementSurfaceJointMarkerHitDiameterV9(coarsePointer),
      });
    }

    function publishJointHover(groupId: string | null, positionTarget: boolean) {
      if (!contextCanvas) return;
      contextCanvas.dataset.hoveredJointGroup = groupId ?? '';
      contextCanvas.style.cursor = groupId ? (positionTarget ? 'grab' : 'pointer') : '';
      const selectedId = jointEditorRef.current?.selectedGroupId;
      for (const [candidateId, marker] of runtimeRef.current?.jointMarkers ?? []) {
        const selected = candidateId === selectedId;
        const hovered = candidateId === groupId;
        marker.scale.setScalar(selected ? 1.6 : hovered ? 1.3 : 1);
        const material = marker.material;
        if (material instanceof THREE.MeshBasicMaterial) {
          material.color.set(
            cssColor(selected || hovered ? '--color-textColor' : '--color-labelColor'),
          );
        }
      }
      scheduleRender();
    }

    function applySelectedJointGhosting(occluded: boolean) {
      const selectedId = jointEditorRef.current?.selectedGroupId;
      for (const [groupId, marker] of runtimeRef.current?.jointMarkers ?? []) {
        const ghosted = groupId === selectedId && occluded;
        const material = marker.material;
        if (material instanceof THREE.MeshBasicMaterial) {
          if (material.transparent !== ghosted) material.needsUpdate = true;
          material.transparent = ghosted;
          material.opacity = ghosted ? 0.3 : 1;
        }
      }
      transformControls?.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          const userData = material.userData as { surfaceBaseOpacityV10?: number };
          const baseOpacity = userData.surfaceBaseOpacityV10 ?? material.opacity;
          userData.surfaceBaseOpacityV10 = baseOpacity;
          const transparent = occluded || baseOpacity < 1;
          if (material.transparent !== transparent) material.needsUpdate = true;
          material.transparent = transparent;
          material.opacity = occluded ? baseOpacity * 0.3 : baseOpacity;
        }
      });
    }

    function publishSelectedJointVisibility() {
      if (!contextCanvas || !camera || !surface || !bodyRadius) return;
      const selectedId = jointEditorRef.current?.selectedGroupId ?? null;
      const marker = selectedId ? runtimeRef.current?.jointMarkers.get(selectedId) : null;
      if (
        !selectedId ||
        !marker ||
        !measurementSurfaceJointEditorEffectiveEditModeV1(jointEditorRef.current)
      ) {
        contextCanvas.dataset.selectedJointVisibility = 'none';
        applySelectedJointGhosting(false);
        return;
      }
      const samples = measurementSurfaceSelectedJointOcclusionSamplesV10(
        jointEditorRef.current?.groups ?? [],
        selectedId,
      );
      const visibility = samples.some((sample) => {
        const sampleDirection = new THREE.Vector3(...sample).sub(camera!.position);
        const markerDistanceM = sampleDirection.length();
        const raycaster = new THREE.Raycaster(
          camera!.position,
          sampleDirection.normalize(),
          0,
          markerDistanceM,
        );
        const nearestSurfaceDistanceM =
          raycaster.intersectObject(surface!, false)[0]?.distance ?? null;
        return (
          measurementSurfaceSelectedJointVisibilityV10({
            groupId: selectedId,
            markerDistanceM,
            nearestSurfaceDistanceM,
            bodyRadiusM: bodyRadius,
          }) === 'occluded'
        );
      })
        ? 'occluded'
        : 'visible';
      contextCanvas.dataset.selectedJointVisibility = visibility;
      applySelectedJointGhosting(visibility === 'occluded');
    }

    function finishRotationGizmo(outcome: 'commit' | 'cancel') {
      const session = transformSession;
      if (!session) return;
      transformSession = null;
      if (outcome === 'cancel' && transformControls?.dragging) {
        suppressTransformMove = true;
        transformControls.reset();
        suppressTransformMove = false;
      }
      transformPointerAdapter?.up({ x: 0, y: 0, button: 0 });
      if (contextCanvas?.hasPointerCapture(session.pointerId)) {
        contextCanvas.releasePointerCapture(session.pointerId);
      }
      session.onFinish(outcome);
      writeTransformDataset();
      if (contextCanvas) contextCanvas.style.cursor = 'grab';
      scheduleRender();
    }

    function finishPositionDrag(outcome: 'commit' | 'cancel') {
      const session = positionDragSession;
      if (!session) return;
      positionDragSession = null;
      if (contextCanvas?.hasPointerCapture(session.pointerId)) {
        contextCanvas.releasePointerCapture(session.pointerId);
      }
      session.onFinish(outcome);
      if (contextCanvas) {
        contextCanvas.dataset.positionDragging = 'false';
        contextCanvas.style.cursor = 'grab';
      }
      scheduleRender();
    }

    function syncPositionDragTargets(targets: readonly MeasurementSurfacePositionDragTargetV8[]) {
      if (
        positionDragSession &&
        !targets.some(({ revision }) => revision === positionDragSession?.revision)
      ) {
        finishPositionDrag('cancel');
      }
    }

    function syncRotationGizmo(editor: MeasurementSurfaceJointEditorV1 | undefined) {
      if (!transformControls || !transformAnchor || !transformPointerAdapter) {
        transformPublishedAxis = 'none';
        if (contextCanvas) {
          contextCanvas.dataset.transformAxis = 'none';
          contextCanvas.dataset.gizmoDragging = 'false';
        }
        return;
      }
      const editMode = measurementSurfaceJointEditorEffectiveEditModeV1(editor);
      const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      const gizmo = editMode && !coarsePointer ? editor?.rotationGizmo : undefined;
      const nextSignature = measurementSurfaceRotationGizmoSignatureV6(gizmo);
      if (transformSession && transformSession.signature !== nextSignature) {
        finishRotationGizmo('cancel');
      }
      if (!gizmo) {
        if (transformSession) finishRotationGizmo('cancel');
        transformControls.detach();
        transformControls.enabled = false;
        transformControls.visible = false;
        transformSignature = '';
        transformPublishedAxis = 'none';
        writeTransformDataset();
        scheduleRender();
        return;
      }
      if (nextSignature !== transformSignature && !transformSession) {
        try {
          if (!gizmo.pivotM.every(Number.isFinite)) {
            throw new RangeError('Rotation gizmo pivot must be finite.');
          }
          const matrix = measurementSurfaceRotationGizmoMatrixV6(gizmo.localToWorld);
          transformAnchor.position.set(...gizmo.pivotM);
          transformAnchor.quaternion.setFromRotationMatrix(matrix).normalize();
          transformAnchor.scale.setScalar(1);
          transformAnchor.updateMatrixWorld(true);
          transformControls.attach(transformAnchor);
          transformControls.setMode('rotate');
          transformControls.setSpace('local');
          transformControls.setRotationSnap(THREE.MathUtils.degToRad(1));
          transformControls.showX = gizmo.axis === 'x';
          transformControls.showY = gizmo.axis === 'y';
          transformControls.showZ = gizmo.axis === 'z';
          transformSignature = nextSignature;
          transformPublishedAxis = gizmo.axis;
        } catch {
          transformControls.detach();
          transformControls.enabled = false;
          transformControls.visible = false;
          transformSignature = '';
          transformPublishedAxis = 'none';
          writeTransformDataset();
          scheduleRender();
          return;
        }
      }
      transformControls.enabled = true;
      transformControls.visible = true;
      writeTransformDataset();
      scheduleRender();
    }

    function syncMeasurementGuide(
      guide: MeasurementSurfaceActiveMeasurementGuideV1 | undefined,
    ): void {
      if (!scene || !geometry || !contextCanvas) return;
      if (measurementGuideLayer) scene.remove(measurementGuideLayer);
      disposeMeasurementGuideLayerV1(measurementGuideLayer);
      const positionAttribute = geometry.getAttribute('position');
      const positions =
        positionAttribute instanceof THREE.BufferAttribute &&
        positionAttribute.array instanceof Float32Array
          ? positionAttribute.array
          : new Float32Array();
      const next = createMeasurementGuideLayerV1(guide, positions);
      measurementGuideLayer = next.layer;
      measurementGuideBindings = next.bindings;
      if (measurementGuideLayer) scene.add(measurementGuideLayer);
      const dataset = measurementSurfaceMeasurementGuideDatasetV1(guide);
      contextCanvas.dataset.activeMeasurementGuide = dataset.activeMeasurement;
      contextCanvas.dataset.measurementGuideStatus = dataset.status;
      contextCanvas.dataset.measurementGuidePathCount = String(dataset.pathCount);
      contextCanvas.dataset.measurementGuideVisualOnly = String(dataset.visualGuideOnly);
      const runtime = runtimeRef.current;
      if (runtime) {
        runtime.measurementGuideLayer = measurementGuideLayer;
        runtime.measurementGuideBindings = measurementGuideBindings;
      }
      scheduleRender();
    }

    function cleanup() {
      if (disposed) return;
      finishRotationGizmo('cancel');
      finishPositionDrag('cancel');
      patternPieceGesture = null;
      if (interactive && camera && controls && bodyCenter && bodyRadius > 0 && contextCanvas) {
        cameraStateRef.current = measurementSurfaceSnapshotCameraV10({
          positionM: camera.position.toArray() as [number, number, number],
          targetM: controls.target.toArray() as [number, number, number],
          centerM: bodyCenter.toArray() as [number, number, number],
          up: camera.up.toArray() as [number, number, number],
          radiusM: bodyRadius,
          viewPreset:
            contextCanvas.dataset.viewPreset === 'side' ||
            contextCanvas.dataset.viewPreset === 'back'
              ? contextCanvas.dataset.viewPreset
              : 'front',
        });
      }
      disposed = true;
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      if (animationFrame !== 0) cancelAnimationFrame(animationFrame);
      if (readyFrame !== 0) cancelAnimationFrame(readyFrame);
      resizeObserver?.disconnect();
      if (controls) {
        controls.removeEventListener('change', scheduleRender);
        controls.dispose();
      }
      if (contextCanvas && contextLostHandler) {
        contextCanvas.removeEventListener('webglcontextlost', contextLostHandler);
      }
      if (contextCanvas) {
        delete contextCanvas.dataset.patternPieceHitReceipt;
        delete contextCanvas.dataset.patternPieceTransformReceipt;
        delete contextCanvas.dataset.patternPieceTransformRevision;
      }
      normals?.dispose();
      if (landmarks) {
        landmarks.geometry.dispose();
        disposeMaterial(landmarks.material);
      }
      disposeSectionPlanes(sectionPlanes);
      if (contextCanvas && jointPointerHandler) {
        contextCanvas.removeEventListener('pointerdown', jointPointerHandler);
      }
      if (contextCanvas && jointPointerMoveHandler) {
        contextCanvas.removeEventListener('pointermove', jointPointerMoveHandler);
      }
      if (contextCanvas && jointPointerFinishHandler) {
        contextCanvas.removeEventListener('pointerup', jointPointerFinishHandler);
      }
      if (contextCanvas && jointPointerCancelHandler) {
        contextCanvas.removeEventListener('pointercancel', jointPointerCancelHandler);
      }
      if (contextCanvas && jointLostPointerCaptureHandler) {
        contextCanvas.removeEventListener('lostpointercapture', jointLostPointerCaptureHandler);
      }
      if (contextCanvas && jointPointerLeaveHandler) {
        contextCanvas.removeEventListener('pointerleave', jointPointerLeaveHandler);
      }
      if (contextCanvas && patternPiecePointerDownHandler) {
        contextCanvas.removeEventListener('pointerdown', patternPiecePointerDownHandler);
      }
      if (contextCanvas && patternPiecePointerMoveHandler) {
        contextCanvas.removeEventListener('pointermove', patternPiecePointerMoveHandler);
      }
      if (contextCanvas && patternPiecePointerFinishHandler) {
        contextCanvas.removeEventListener('pointerup', patternPiecePointerFinishHandler);
        contextCanvas.removeEventListener('pointercancel', patternPiecePointerFinishHandler);
      }
      if (rotationEscapeHandler) window.removeEventListener('keydown', rotationEscapeHandler);
      if (rotationBlurHandler) window.removeEventListener('blur', rotationBlurHandler);
      if (rotationVisibilityHandler) {
        document.removeEventListener('visibilitychange', rotationVisibilityHandler);
      }
      if (transformControls) {
        transformControls.removeEventListener('change', scheduleRender);
        if (transformObjectChangeHandler) {
          transformControls.removeEventListener('objectChange', transformObjectChangeHandler);
        }
        transformControls.detach();
        transformControls.dispose();
        transformControls.removeFromParent();
      }
      transformAnchor?.removeFromParent();
      disposeJointEditorLayer(runtime?.jointLayer ?? null);
      disposePatternPieceLayerV1(patternPieceLayer);
      disposeMeasurementGuideLayerV1(measurementGuideLayer);
      geometry?.dispose();
      surfaceMaterial?.dispose();
      wireMaterial?.dispose();
      if (grid) {
        grid.geometry.dispose();
        disposeMaterial(grid.material);
      }
      scene?.clear();
      if (renderer) {
        renderer.renderLists.dispose();
        renderer.dispose();
      }
    }

    function scheduleRender() {
      // Camera/view/resize and gesture changes invalidate old viewport coordinates synchronously.
      if (contextCanvas) delete contextCanvas.dataset.patternPieceHitReceipt;
      if (disposed || animationFrame !== 0) return;
      animationFrame = requestAnimationFrame(() => {
        animationFrame = 0;
        const runtime = runtimeRef.current;
        if (disposed || !renderer || !scene || !controls || !runtime) return;
        try {
          controls.update();
          if (runtime.normals.visible) runtime.normals.update();
          for (const { anchor } of runtime.patternPieceBindings.values()) {
            anchor.quaternion.copy(controls.object.quaternion);
          }
          runtime.scene.updateMatrixWorld(true);
          for (const guide of runtime.patternPieceGuides) {
            const from = guide.fromBinding.content.localToWorld(guide.fromLocal.clone());
            const to = guide.toBinding.content.localToWorld(guide.toLocal.clone());
            const positions = guide.line.geometry.getAttribute('position');
            if (positions instanceof THREE.BufferAttribute && positions.count >= 2) {
              positions.setXYZ(0, from.x, from.y, from.z);
              positions.setXYZ(1, to.x, to.y, to.z);
              positions.needsUpdate = true;
              guide.line.geometry.computeBoundingSphere();
            }
          }
          publishSelectedJointVisibility();
          renderer.render(scene, controls.object);
          renderCount += 1;
          renderer.domElement.dataset.renderCount = String(renderCount);
          publishPatternPieceAcceptanceReceipts(renderCount);
          onRenderCountRef.current(renderCount);
          warmupRenderCount += 1;
          const nextWarmupWireVisibility = nextMeasurementSurfaceWarmupWireVisibilityV1(
            warmupRenderCount,
            overlaysRef.current.wireframe,
          );
          const nextWarmupView = nextMeasurementSurfaceWarmupViewV1(
            warmupRenderCount,
            viewPresetRef.current,
          );
          if (nextWarmupWireVisibility !== null) {
            runtime.wire.visible = nextWarmupWireVisibility;
            if (nextWarmupView === null) scheduleRender();
            else if (warmupRenderCount === 4 && retainedCameraAtMount) {
              runtime.restoreCamera(retainedCameraAtMount);
            } else runtime.applyView(nextWarmupView);
            return;
          }
          if (!readyScheduled) {
            readyScheduled = true;
            renderer.domElement.style.opacity = '1';
            hasReadyCanvasFrameRef.current = true;
            readyFrame = requestAnimationFrame(() => {
              readyFrame = 0;
              if (!disposed) onStatusRef.current('ready');
            });
          }
        } catch (reason: unknown) {
          cleanup();
          onStatusRef.current('error', reason instanceof Error ? reason.message : String(reason));
        }
      });
    }

    try {
      if (artifact.sourceRevision !== frame.sourceRevision || artifact.pose !== frame.pose.kind) {
        throw new Error('Surface artifact and measurement frame do not describe the same build.');
      }
      if (artifact.frameRevision !== frame.revision) {
        throw new Error('Surface artifact and measurement frame revisions do not match.');
      }

      const { selectedLod, renderMesh, dataLod } = resolveMeasurementSurfaceRenderSelectionV1(
        artifact,
        lod,
        displayMeshOverride,
      );
      scene = new THREE.Scene();
      scene.background = new THREE.Color(cssColor('--color-pageBg'));

      geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(renderMesh.positions.slice(), 3).setUsage(THREE.DynamicDrawUsage),
      );
      geometry.setIndex(new THREE.BufferAttribute(renderMesh.indices.slice(), 1));
      geometry.computeVertexNormals();
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      surfaceMaterial = new THREE.MeshLambertMaterial({
        color: cssColor('--color-bgColor'),
      });
      wireMaterial = new THREE.MeshBasicMaterial({
        color: cssColor('--color-textColor'),
        depthWrite: false,
        opacity: 0.2,
        transparent: true,
        wireframe: true,
      });
      surface = new THREE.Mesh(geometry, surfaceMaterial);
      const wire = new THREE.Mesh(geometry, wireMaterial);
      wire.renderOrder = 2;
      scene.add(surface, wire);

      normals = new VertexNormalsHelper(
        surface,
        selectedLod.grid.cellSizeM * 0.36,
        new THREE.Color(cssColor('--color-labelColor')).getHex(),
      );
      if (!Array.isArray(normals.material)) {
        normals.material.transparent = true;
        normals.material.opacity = 0.62;
      }
      scene.add(normals);

      const box = geometry.boundingBox ?? new THREE.Box3().setFromObject(surface);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const bodyGeometryRadius = Math.max(
        geometry.boundingSphere?.radius ?? size.length() * 0.5,
        0.1,
      );
      bodyCenter = center;
      bodyRadius = bodyGeometryRadius;

      const patternPieceScene = createPatternPieceLayerV1(
        patternPieceOverlayRef.current,
        center,
        bodyGeometryRadius,
      );
      patternPieceLayer = patternPieceScene.layer;
      if (patternPieceLayer) scene.add(patternPieceLayer);
      const radius = patternPieceLayer ? bodyGeometryRadius * 1.68 : bodyGeometryRadius;

      landmarks = createLandmarks(frame);
      sectionPlanes = createSectionPlanes(frame, box);
      scene.add(landmarks, sectionPlanes);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.25));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
      keyLight.position.set(1.8, 2.5, 2.2);
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0xffffff, 1.05);
      rimLight.position.set(-1.6, 1.2, -1.4);
      scene.add(rimLight);

      const gridSize = Math.max(size.x, size.z, 1.2) * 1.25;
      grid = new THREE.GridHelper(
        gridSize,
        12,
        cssColor('--color-borderColor'),
        cssColor('--color-hairline'),
      );
      scene.add(grid);

      camera = new THREE.PerspectiveCamera(32, 1, 0.001, 100);
      // The explicit wire overlay is the edge treatment. MSAA made SwiftShader serialize a
      // 999x680 surface+wire present for hundreds of milliseconds without improving topology.
      if (exclusiveContextGroup) {
        const previousLease = exclusiveRendererLeases.get(exclusiveContextGroup);
        if (previousLease && previousLease.canvas !== canvas) {
          previousLease.renderer.forceContextLoss();
          exclusiveRendererLeases.delete(exclusiveContextGroup);
        }
      }
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        powerPreference: 'high-performance',
      });
      if (exclusiveContextGroup) {
        exclusiveRendererLeases.set(exclusiveContextGroup, { canvas, renderer });
      }
      rendererLifetimeRef.current = renderer;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.opacity =
        retainVisibleCanvasOnRebuild && hasReadyCanvasFrameRef.current ? '1' : '0';
      renderer.domElement.style.touchAction = 'none';
      renderer.domElement.dataset.lod = dataLod;
      renderer.domElement.dataset.renderCount = '0';
      renderer.domElement.dataset.renderMode = 'on-demand';
      renderer.domElement.setAttribute('data-testid', 'measurement-watertight-surface-v1-canvas');
      renderer.domElement.setAttribute('aria-hidden', 'true');
      contextCanvas = renderer.domElement;
      contextCanvas.dataset.positionDragging = 'false';
      contextCanvas.dataset.hoveredJointGroup = '';
      contextCanvas.dataset.selectedJointVisibility = 'none';
      contextCanvas.dataset.transformHoverAxis = 'none';
      contextCanvas.dataset.patternPieceCount = String(patternPieceScene.bindings.size);
      contextCanvas.dataset.patternSeamSides = [
        ...new Set(
          patternPieceOverlayRef.current?.pieces.flatMap(({ seams }) =>
            seams.map(({ side }) => side),
          ) ?? [],
        ),
      ]
        .sort()
        .join(',');
      contextCanvas.dataset.patternCorrespondenceGuideCount = String(
        (patternPieceOverlayRef.current?.guides ?? []).filter(
          ({ kind }) => kind === 'correspondence',
        ).length,
      );
      contextCanvas.dataset.patternThreadGuideCount = String(
        (patternPieceOverlayRef.current?.guides ?? []).filter(({ kind }) => kind === 'thread')
          .length,
      );
      contextCanvas.dataset.patternThreadColors = [
        ...new Set(
          (patternPieceOverlayRef.current?.guides ?? []).flatMap(({ thread }) =>
            thread ? [thread.colorCss] : [],
          ),
        ),
      ].join(',');
      contextCanvas.dataset.selectedPatternPiece =
        patternPieceOverlayRef.current?.pieces.find(({ selected }) => selected)?.pieceId ?? '';
      contextCanvas.dataset.patternPieceTool = patternPieceOverlayRef.current?.tool ?? 'off';
      contextCanvas.dataset.patternPieceGesture = 'idle';

      contextLostHandler = (event) => {
        event.preventDefault();
        if (!disposed) onStatusRef.current('error', 'WebGL context was lost.');
      };
      contextCanvas.addEventListener('webglcontextlost', contextLostHandler);

      const detachedTransformElement = document.createElement('div');
      transformControls = new TransformControls(camera, detachedTransformElement);
      measurementSurfaceExpandRotationPickerV9(
        transformControls as unknown as TransformControlsPickerRuntimeV9,
      );
      transformPointerAdapter = measurementSurfaceTransformControlsPointerAdapterV6(
        transformControls as unknown as TransformControlsRuntimeShapeV6,
      );
      if (transformPointerAdapter) {
        transformAnchor = new THREE.Object3D();
        transformAnchor.name = 'measurement-surface-rotation-gizmo-anchor-v6';
        transformControls.name = 'measurement-surface-rotation-gizmo-v6';
        transformControls.enabled = false;
        transformControls.visible = false;
        transformControls.setSize(0.72);
        transformControls.addEventListener('change', scheduleRender);
        transformObjectChangeHandler = () => {
          if (suppressTransformMove || !transformSession || !transformPointerAdapter) return;
          transformSession.onMove(
            THREE.MathUtils.radToDeg(transformPointerAdapter.rotationAngle()),
          );
          writeTransformDataset();
          scheduleRender();
        };
        transformControls.addEventListener('objectChange', transformObjectChangeHandler);
        scene.add(transformAnchor, transformControls);
      } else {
        transformControls.dispose();
        transformControls = null;
      }

      jointPointerHandler = (event) => {
        const editor = jointEditorRef.current;
        if (
          !editor ||
          !measurementSurfaceJointEditorEffectiveEditModeV1(editor) ||
          !renderer ||
          !controls
        )
          return;
        const gizmo = editor.rotationGizmo;
        let rotationGizmoHit = false;
        if (gizmo && transformControls?.enabled && transformPointerAdapter) {
          const transformPointer = normalizedTransformPointer(event, 0);
          if (transformPointer) {
            transformPointerAdapter.hover(transformPointer);
            rotationGizmoHit = transformPointerAdapter.activeAxis() !== null;
          }
        }
        // The selected marker deliberately has a large 56/64 px target. Probe the thin local ring
        // first so that target cannot make an edge-on rotation gizmo impossible to grab.
        const selectedId = projectedJointMarkerId(event, editor);
        const positionTarget = editor.positionDragTargets?.find(
          ({ groupId }) => groupId === selectedId,
        );
        const pointerOwner = measurementSurfaceJointPointerOwnerV9({
          button: event.button,
          selectedMarkerId: selectedId,
          markerHasPositionTarget: positionTarget !== undefined,
          rotationGizmoAvailable:
            gizmo !== undefined &&
            transformControls?.enabled === true &&
            transformPointerAdapter !== null,
          rotationGizmoHit,
        });
        if (pointerOwner === 'position-drag' && selectedId && positionTarget) {
          if (positionDragSession) finishPositionDrag('cancel');
          const pivot = new THREE.Vector3(...positionTarget.pivotM);
          const planeNormal = controls.object.getWorldDirection(new THREE.Vector3()).normalize();
          positionDragSession = Object.freeze({
            pointerId: event.pointerId,
            revision: positionTarget.revision,
            plane: new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, pivot),
            onMove: positionTarget.onMove,
            onFinish: positionTarget.onFinish,
          });
          contextCanvas?.setPointerCapture(event.pointerId);
          if (contextCanvas) {
            contextCanvas.dataset.positionDragging = 'true';
            contextCanvas.style.cursor = 'grabbing';
          }
          editor.onSelectGroup(selectedId);
          positionTarget.onStart(positionTarget.pivotM);
          event.preventDefault();
          event.stopImmediatePropagation();
          scheduleRender();
          return;
        }
        if (pointerOwner === 'marker-selection' && selectedId) {
          publishJointHover(selectedId, false);
          event.preventDefault();
          event.stopImmediatePropagation();
          editor.onSelectGroup(selectedId);
          return;
        }
        if (pointerOwner === 'rotation-gizmo' && gizmo && transformPointerAdapter) {
          const transformPointer = normalizedTransformPointer(event, 0);
          if (transformPointer) {
            transformPointerAdapter.hover(transformPointer);
            transformPointerAdapter.down(transformPointer);
            if (transformControls?.dragging) {
              transformSession = Object.freeze({
                pointerId: event.pointerId,
                signature: measurementSurfaceRotationGizmoSignatureV6(gizmo),
                onMove: gizmo.onMove,
                onFinish: gizmo.onFinish,
              });
              contextCanvas?.setPointerCapture(event.pointerId);
              if (contextCanvas) contextCanvas.style.cursor = 'grabbing';
              gizmo.onStart(0);
              writeTransformDataset();
              event.preventDefault();
              event.stopImmediatePropagation();
              scheduleRender();
            }
          }
        }
      };
      jointPointerMoveHandler = (event) => {
        if (positionDragSession && event.pointerId === positionDragSession.pointerId) {
          if (!camera) return;
          const pointer = normalizedTransformPointer(event, -1);
          if (!pointer) return;
          const target = new THREE.Vector3();
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), camera);
          if (raycaster.ray.intersectPlane(positionDragSession.plane, target)) {
            positionDragSession.onMove([target.x, target.y, target.z]);
            event.preventDefault();
            event.stopImmediatePropagation();
            scheduleRender();
          }
          return;
        }
        if (transformSession && event.pointerId === transformSession.pointerId) {
          const pointer = normalizedTransformPointer(event, -1);
          if (!pointer) return;
          transformPointerAdapter?.move(pointer);
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        const editor = jointEditorRef.current;
        if (!editor || !measurementSurfaceJointEditorEffectiveEditModeV1(editor)) {
          publishJointHover(null, false);
          return;
        }
        if (transformControls?.enabled && transformPointerAdapter) {
          const pointer = normalizedTransformPointer(event, -1);
          if (pointer) {
            transformPointerAdapter.hover(pointer);
            const axis = transformPointerAdapter.activeAxis();
            if (axis) {
              publishJointHover(null, false);
              if (contextCanvas) {
                contextCanvas.dataset.transformHoverAxis = axis;
                contextCanvas.style.cursor = 'grab';
              }
              scheduleRender();
              return;
            }
          }
        }
        const hoveredId = projectedJointMarkerId(event, editor);
        const hoveredPositionTarget = editor.positionDragTargets?.some(
          ({ groupId }) => groupId === hoveredId,
        );
        publishJointHover(hoveredId, hoveredPositionTarget === true);
        if (contextCanvas) {
          contextCanvas.dataset.transformHoverAxis = 'none';
        }
      };
      jointPointerFinishHandler = (event) => {
        if (positionDragSession && event.pointerId === positionDragSession.pointerId) {
          finishPositionDrag('commit');
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (!transformSession || event.pointerId !== transformSession.pointerId) return;
        finishRotationGizmo('commit');
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      jointPointerCancelHandler = (event) => {
        if (positionDragSession && event.pointerId === positionDragSession.pointerId) {
          finishPositionDrag('cancel');
          return;
        }
        if (!transformSession || event.pointerId !== transformSession.pointerId) return;
        finishRotationGizmo('cancel');
      };
      jointLostPointerCaptureHandler = (event) => {
        if (positionDragSession && event.pointerId === positionDragSession.pointerId) {
          finishPositionDrag('cancel');
          return;
        }
        if (!transformSession || event.pointerId !== transformSession.pointerId) return;
        finishRotationGizmo('cancel');
      };
      rotationEscapeHandler = (event) => {
        if (event.key !== 'Escape' || (!transformSession && !positionDragSession)) return;
        event.preventDefault();
        if (positionDragSession) finishPositionDrag('cancel');
        else finishRotationGizmo('cancel');
      };
      rotationBlurHandler = () => {
        finishRotationGizmo('cancel');
        finishPositionDrag('cancel');
      };
      rotationVisibilityHandler = () => {
        if (document.visibilityState === 'hidden') {
          finishRotationGizmo('cancel');
          finishPositionDrag('cancel');
        }
      };
      jointPointerLeaveHandler = () => {
        if (transformSession || positionDragSession) return;
        publishJointHover(null, false);
        if (transformControls) transformControls.axis = null;
        if (contextCanvas) contextCanvas.dataset.transformHoverAxis = 'none';
      };
      contextCanvas.addEventListener('pointerdown', jointPointerHandler);
      contextCanvas.addEventListener('pointermove', jointPointerMoveHandler);
      contextCanvas.addEventListener('pointerup', jointPointerFinishHandler);
      contextCanvas.addEventListener('pointercancel', jointPointerCancelHandler);
      contextCanvas.addEventListener('lostpointercapture', jointLostPointerCaptureHandler);
      contextCanvas.addEventListener('pointerleave', jointPointerLeaveHandler);
      window.addEventListener('keydown', rotationEscapeHandler);
      window.addEventListener('blur', rotationBlurHandler);
      document.addEventListener('visibilitychange', rotationVisibilityHandler);

      patternPiecePointerDownHandler = (event) => {
        if (event.button !== 0 || !camera) return;
        const binding = patternPieceHit(event);
        if (!binding) return;
        const overlay = patternPieceOverlayRef.current;
        overlay?.onSelectPiece?.(binding.piece);
        const tool = overlay?.tool ?? 'select';
        if (!binding.piece.selected || tool === 'select') {
          event.preventDefault();
          event.stopImmediatePropagation();
          scheduleRender();
          return;
        }
        const planeNormal = camera.getWorldDirection(new THREE.Vector3()).normalize();
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
          planeNormal,
          binding.anchor.position,
        );
        const pointer = normalizedTransformPointer(event, event.button);
        if (!pointer) return;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), camera);
        const startPoint = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(plane, startPoint)) return;
        patternPieceGesture = Object.freeze({
          pointerId: event.pointerId,
          binding,
          tool,
          plane,
          startPoint,
          startPosition: binding.anchor.position.clone(),
          startAngle: pointerAngleAroundPatternPiece(event, binding),
          startRotation: binding.content.rotation.z,
        });
        if (controls) controls.enabled = false;
        contextCanvas?.setPointerCapture(event.pointerId);
        if (contextCanvas) {
          contextCanvas.dataset.patternPieceGesture = tool;
          contextCanvas.style.cursor = tool === 'translate' ? 'grabbing' : 'crosshair';
        }
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      patternPiecePointerMoveHandler = (event) => {
        const gesture = patternPieceGesture;
        if (!gesture || gesture.pointerId !== event.pointerId || !camera) return;
        if (gesture.tool === 'translate') {
          const pointer = normalizedTransformPointer(event, -1);
          if (!pointer) return;
          const raycaster = new THREE.Raycaster();
          raycaster.setFromCamera(new THREE.Vector2(pointer.x, pointer.y), camera);
          const point = new THREE.Vector3();
          if (raycaster.ray.intersectPlane(gesture.plane, point)) {
            gesture.binding.anchor.position
              .copy(gesture.startPosition)
              .add(point.sub(gesture.startPoint));
          }
        } else {
          const angle = pointerAngleAroundPatternPiece(event, gesture.binding);
          gesture.binding.content.rotation.z = gesture.startRotation + angle - gesture.startAngle;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        scheduleRender();
      };
      patternPiecePointerFinishHandler = (event) => {
        if (!patternPieceGesture || patternPieceGesture.pointerId !== event.pointerId) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        finishPatternPieceGesture();
      };
      contextCanvas.addEventListener('pointerdown', patternPiecePointerDownHandler);
      contextCanvas.addEventListener('pointermove', patternPiecePointerMoveHandler);
      contextCanvas.addEventListener('pointerup', patternPiecePointerFinishHandler);
      contextCanvas.addEventListener('pointercancel', patternPiecePointerFinishHandler);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enabled = interactive;
      controls.enableDamping = false;
      controls.enablePan = true;
      controls.minDistance = radius * 1.15;
      controls.maxDistance = radius * 12;
      controls.target.copy(center);

      const fit = (direction?: THREE.Vector3) => {
        if (!renderer || !controls || !camera) return;
        const width = Math.max(host.clientWidth, 1);
        const height = Math.max(host.clientHeight, 1);
        const pixelRatio = measurementSurfaceDrawingBufferPixelRatioV1(
          width,
          height,
          window.devicePixelRatio || 1,
        );
        const aspect = width / height;
        camera.aspect = aspect;
        const verticalFov = THREE.MathUtils.degToRad(camera.fov);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
        const distance = (radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2)) * 1.12;
        const viewDirection =
          direction ?? camera.position.clone().sub(center).normalize().multiplyScalar(1);
        if (viewDirection.lengthSq() === 0) viewDirection.set(0, 0, 1);
        camera.up.set(0, 1, 0);
        camera.position.copy(center).add(viewDirection.normalize().multiplyScalar(distance));
        camera.near = Math.max(distance / 1000, 0.001);
        camera.far = distance * 100;
        camera.updateProjectionMatrix();
        resizeMeasurementSurfaceRendererIfNeededV1(
          renderer,
          rendererSize,
          width,
          height,
          pixelRatio,
        );
        controls.target.copy(center);
        controls.update();
        scheduleRender();
      };

      const resize = () => {
        if (!renderer || !controls || !camera) return;
        const width = Math.max(host.clientWidth, 1);
        const height = Math.max(host.clientHeight, 1);
        const pixelRatio = measurementSurfaceDrawingBufferPixelRatioV1(
          width,
          height,
          window.devicePixelRatio || 1,
        );
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        resizeMeasurementSurfaceRendererIfNeededV1(
          renderer,
          rendererSize,
          width,
          height,
          pixelRatio,
        );
        controls.update();
        scheduleRender();
      };

      const applyView = (view: MeasurementSurfaceViewPreset) => {
        renderer?.domElement.setAttribute('data-view-preset', view);
        fit(directionForView(view));
      };

      const restoreCamera = (state: MeasurementSurfaceCameraStateV10) => {
        if (!renderer || !controls || !camera) return;
        const restored = measurementSurfaceRestoreCameraV10({
          state,
          centerM: center.toArray() as [number, number, number],
          radiusM: radius,
        });
        camera.position.set(...restored.positionM);
        camera.up.set(...restored.up);
        controls.target.set(...restored.targetM);
        camera.near = Math.max((state.distanceRadius * radius) / 1000, 0.001);
        camera.far = state.distanceRadius * radius * 100;
        camera.updateProjectionMatrix();
        controls.update();
        renderer.domElement.dataset.viewPreset = state.viewPreset;
        scheduleRender();
      };

      const zoomBy = (factor: number) => {
        if (!controls || !camera || !Number.isFinite(factor) || factor <= 0) return;
        const offset = camera.position.clone().sub(controls.target);
        const currentDistance = offset.length();
        if (!Number.isFinite(currentDistance) || currentDistance <= 0) return;
        const nextDistance = THREE.MathUtils.clamp(
          currentDistance * factor,
          controls.minDistance,
          controls.maxDistance,
        );
        camera.position.copy(controls.target).add(offset.normalize().multiplyScalar(nextDistance));
        camera.updateProjectionMatrix();
        controls.update();
        scheduleRender();
      };

      const initialEditor = jointEditorRef.current;
      const initialJointLayer = initialEditor?.groups.length
        ? createJointEditorLayer(initialEditor.groups)
        : null;
      if (initialJointLayer) scene.add(initialJointLayer.layer);
      const updateLivePositions = (
        positions: Float32Array,
      ): MeasurementSurfaceLivePositionUpdateV1 => {
        if (!geometry || !contextCanvas) {
          return Object.freeze({ status: 'rejected', reason: 'Display geometry is unavailable.' });
        }
        const result = updateMeasurementSurfaceLivePositionsV1({
          geometry,
          positions,
          updateNormals: true,
        });
        contextCanvas.dataset.livePositionStatus = result.status;
        if (result.status === 'rejected') {
          contextCanvas.dataset.livePositionError = result.reason;
          return result;
        }
        delete contextCanvas.dataset.livePositionError;
        if (normals?.visible) normals.update();
        updateMeasurementGuideLayerPositionsV1(measurementGuideBindings, positions);
        scheduleRender();
        return result;
      };
      runtimeRef.current = {
        applyView,
        restoreCamera,
        zoomBy,
        scheduleRender,
        wire,
        normals,
        landmarks,
        sectionPlanes,
        controls,
        scene,
        patternPieceBindings: patternPieceScene.bindings,
        patternPieceGuides: patternPieceScene.guides,
        updateLivePositions,
        syncMeasurementGuide,
        jointLayer: initialJointLayer?.layer ?? null,
        jointMarkers: initialJointLayer?.markers ?? new Map(),
        jointGroupsSignature: measurementSurfaceJointGroupsSignatureV1(initialEditor?.groups ?? []),
        measurementGuideLayer,
        measurementGuideBindings,
        syncRotationGizmo,
        syncPositionDragTargets,
        cancelRotationGizmo: () => finishRotationGizmo('cancel'),
        cancelPositionDrag: () => finishPositionDrag('cancel'),
      };
      if (liveDisplayPositionsRef.current) {
        updateLivePositions(liveDisplayPositionsRef.current);
      }
      syncMeasurementGuide(measurementGuideRef.current);
      wire.visible = overlays.wireframe;
      normals.visible = overlays.normals;
      landmarks.visible = overlays.landmarks;
      sectionPlanes.visible = overlays.sectionPlanes;
      controls.addEventListener('change', scheduleRender);
      syncRotationGizmo(initialEditor);
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      applyView(viewPreset);
      if (retainedCameraAtMount) restoreCamera(retainedCameraAtMount);
    } catch (reason: unknown) {
      cleanup();
      onStatusRef.current('error', reason instanceof Error ? reason.message : String(reason));
    }

    return cleanup;
  }, [
    artifact,
    displayMeshOverride,
    exclusiveContextGroup,
    frame,
    interactive,
    lod,
    patternPieceOverlayRenderKey,
    retainVisibleCanvasOnRebuild,
  ]);

  useEffect(() => {
    contextReleaseGenerationRef.current += 1;
    return () => {
      const renderer = rendererLifetimeRef.current;
      const releaseGeneration = contextReleaseGenerationRef.current + 1;
      contextReleaseGenerationRef.current = releaseGeneration;
      queueMicrotask(() => {
        // React StrictMode immediately replays effects in development. A remount advances this
        // generation before the microtask, while a real card/stage unmount does not.
        if (contextReleaseGenerationRef.current !== releaseGeneration) return;
        renderer?.forceContextLoss();
        if (exclusiveContextGroup) {
          const lease = exclusiveRendererLeases.get(exclusiveContextGroup);
          if (lease?.renderer === renderer) exclusiveRendererLeases.delete(exclusiveContextGroup);
        }
        if (rendererLifetimeRef.current === renderer) rendererLifetimeRef.current = null;
      });
    };
  }, [exclusiveContextGroup]);

  useEffect(() => {
    runtimeRef.current?.applyView(viewPreset);
  }, [viewPreset]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.wire.visible = overlays.wireframe;
    runtime.normals.visible = overlays.normals;
    runtime.landmarks.visible = overlays.landmarks;
    runtime.sectionPlanes.visible = overlays.sectionPlanes;
    runtime.scheduleRender();
  }, [overlays.landmarks, overlays.normals, overlays.sectionPlanes, overlays.wireframe]);

  useEffect(() => {
    runtimeRef.current?.syncMeasurementGuide(measurementGuide);
  }, [measurementGuide]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const editor = jointEditorRef.current;
    const groupsSignature = measurementSurfaceJointGroupsSignatureV1(editor?.groups ?? []);
    if (groupsSignature !== runtime.jointGroupsSignature) {
      const updatedInPlace = updateJointEditorLayer(
        runtime.jointLayer,
        runtime.jointMarkers,
        editor?.groups ?? [],
      );
      if (!updatedInPlace) {
        if (runtime.jointLayer) runtime.scene.remove(runtime.jointLayer);
        disposeJointEditorLayer(runtime.jointLayer);
        const nextLayer = editor?.groups.length ? createJointEditorLayer(editor.groups) : null;
        runtime.jointLayer = nextLayer?.layer ?? null;
        runtime.jointMarkers = nextLayer?.markers ?? new Map();
        if (nextLayer) runtime.scene.add(nextLayer.layer);
      }
      runtime.jointGroupsSignature = groupsSignature;
    }
    const editMode = measurementSurfaceJointEditorEffectiveEditModeV1(editor);
    runtime.controls.enabled = measurementSurfaceOrbitControlsEnabledV2({
      interactive,
      editor,
      unifiedJointInteraction,
    });
    if (runtime.jointLayer) runtime.jointLayer.visible = editMode;
    const canvas = canvasRef.current;
    const hoveredGroupId = canvas?.dataset.hoveredJointGroup ?? '';
    for (const [groupId, marker] of runtime.jointMarkers) {
      const selected = groupId === editor?.selectedGroupId;
      const hovered = groupId === hoveredGroupId;
      marker.scale.setScalar(selected ? 1.6 : hovered ? 1.3 : 1);
      const material = marker.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        material.color.set(
          cssColor(selected || hovered ? '--color-textColor' : '--color-labelColor'),
        );
      }
    }
    if (canvas) {
      const liveOverlayDataset = measurementSurfaceLiveJointOverlayDatasetV10(editor);
      canvas.dataset.jointEditorMode = editMode ? 'edit-pose' : editor ? 'camera' : 'off';
      canvas.dataset.selectedJointGroup = editor?.selectedGroupId ?? '';
      canvas.dataset.selectedJointChannel = editor?.selectedChannel ?? '';
      canvas.dataset.overlayStatus = editor?.overlayStatus ?? 'off';
      canvas.dataset.liveJointOverlayStatus = liveOverlayDataset.status;
      canvas.dataset.liveJointOverlaySignature = liveOverlayDataset.signature;
    }
    runtime.syncRotationGizmo(editor);
    runtime.syncPositionDragTargets(editor?.positionDragTargets ?? []);
    runtime.scheduleRender();
  }, [
    interactive,
    jointEditor?.groups,
    jointEditor?.liveOverlaySignature,
    jointEditor?.liveOverlayStatus,
    jointEditor?.mode,
    jointEditor?.overlayStatus,
    jointEditor?.positionDragTargets,
    jointEditor?.rotationGizmo?.axis,
    jointEditor?.rotationGizmo?.localToWorld,
    jointEditor?.rotationGizmo?.pivotM,
    jointEditor?.rotationGizmo?.revision,
    jointEditor?.selectedChannel,
    jointEditor?.selectedGroupId,
    unifiedJointInteraction,
  ]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !liveDisplayPositions) return;
    runtime.updateLivePositions(liveDisplayPositions);
  }, [liveDisplayPositions]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      !measurementSurfaceOrbitControlsEnabledV2({
        interactive,
        editor: jointEditor,
        unifiedJointInteraction,
      })
    )
      return;
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (event.key === 'Home' || event.key.toLowerCase() === 'r') runtime.applyView('front');
    else if (event.key === 'ArrowLeft') runtime.applyView('side');
    else if (event.key === 'ArrowRight') runtime.applyView('back');
    else if (event.key === 'ArrowUp' || event.key === '+') runtime.zoomBy(0.85);
    else if (event.key === 'ArrowDown' || event.key === '-') runtime.zoomBy(1.15);
    else return;
    event.preventDefault();
  };

  const mannequinKind =
    lod === 'display' && displayMeshOverride
      ? 'CC0 open-reference visual mannequin'
      : `${lod === 'display' ? 'display' : 'collision candidate'} analytical mannequin`;
  const sceneLabel = accessibleLabel ?? `3D ${mannequinKind} in ${artifact.pose} pose`;
  const editMode = measurementSurfaceJointEditorEffectiveEditModeV1(jointEditor);
  const measurementGuideDescription =
    measurementGuide?.status === 'visible'
      ? ` Visual ${measurementGuide.label} guide is highlighted.`
      : '';

  return (
    <div
      ref={hostRef}
      role='img'
      aria-label={
        editMode
          ? `${sceneLabel}. 3D mannequin joint editor. Canvas markers mirror the Pose joint controls.${measurementGuideDescription}`
          : interactive
            ? `${sceneLabel}. Drag to orbit or use the wheel to zoom. Keyboard: Left for side, Right for back, Home for front, Up and Down to zoom.${measurementGuideDescription}`
            : `${sceneLabel}. Static front view.${measurementGuideDescription}`
      }
      tabIndex={interactive && (unifiedJointInteraction || !editMode) ? 0 : undefined}
      onKeyDown={handleKeyDown}
      className={measurementSurfaceStageClassNameV1(className)}
    >
      <canvas
        ref={canvasRef}
        aria-hidden='true'
        data-source-revision={artifact.sourceRevision}
        data-testid='measurement-watertight-surface-v1-canvas'
      />
      {measurementGuide?.status === 'visible' ? (
        <div
          aria-hidden='true'
          className='pointer-events-none absolute left-2 top-2 border border-hairline bg-pageBg px-2 py-1 font-mono text-micro text-textColor'
          data-testid='measurement-surface-active-guide-label'
        >
          {measurementGuide.label}
        </div>
      ) : null}
    </div>
  );
}
