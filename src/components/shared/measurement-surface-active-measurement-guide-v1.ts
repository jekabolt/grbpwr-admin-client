import type { common_BodyMeasurementName } from 'api/proto-http/admin';
import type { MeasurementBodyFrameV2 } from 'lib/cloth/body/measurement-body-frame-v2';
import { MEASUREMENT_OPEN_REFERENCE_HIGH_HIP_PROTOCOL_WAIST_DROP_MM_V1 } from 'lib/cloth/body/measurement-open-reference-high-hip-proxy-v1';
import type { MeasurementOpenReferenceKneeRigStationV1 } from 'lib/cloth/body/measurement-open-reference-knee-proxy-v1';
import type { MeasurementOpenReferenceNeckProtectedSectionV1 } from 'lib/cloth/body/measurement-open-reference-neck-proxy-v1';
import type {
  OpenReferenceLimbCircumferenceKeyV1,
  OpenReferenceLimbCircumferenceModeV1,
} from 'lib/cloth/body/measurement-open-reference-limb-circumference-solver-v1';
import { deriveOpenReferenceLimbSectionStationsV1 } from 'lib/cloth/body/measurement-open-reference-limb-section-station-v1';
import type { MeasurementSurfaceMeshV1 } from 'lib/cloth/body/measurement-watertight-surface-v1';
import {
  measureMeshPlaneSectionPerimetersV1,
  type MeshPlaneSectionLoopV1,
} from 'lib/cloth/body/mesh-plane-section-perimeter-v1';

export const MEASUREMENT_SURFACE_ACTIVE_MEASUREMENT_GUIDE_V1 =
  'measurement-surface-active-measurement-guide/v1' as const;

export type MeasurementSurfaceMeasurementGuideStatusV1 =
  | 'visible'
  | 'unavailable-pose'
  | 'unavailable-section'
  | 'unsupported';

export type MeasurementSurfaceMeasurementGuidePathV1 =
  | Readonly<{
      readonly id: string;
      readonly closed: boolean;
      readonly source: 'mesh-vertices';
      readonly vertexIndices: readonly number[];
    }>
  | Readonly<{
      readonly id: string;
      readonly closed: boolean;
      readonly source: 'fixed-points';
      readonly pointsM: readonly (readonly [number, number, number])[];
    }>;

export interface MeasurementSurfaceActiveMeasurementGuideV1 {
  readonly version: typeof MEASUREMENT_SURFACE_ACTIVE_MEASUREMENT_GUIDE_V1;
  readonly measurementName: common_BodyMeasurementName;
  readonly label: string;
  readonly status: MeasurementSurfaceMeasurementGuideStatusV1;
  readonly paths: readonly MeasurementSurfaceMeasurementGuidePathV1[];
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
  const section = measureMeshPlaneSectionPerimetersV1({
    positionsM: options.mesh.positions,
    triangleIndices: options.mesh.indices,
    planeOriginM: options.originM,
    planeNormal: options.normal,
    selection: { kind: 'nearest-seed', seedM: options.seedM ?? options.originM },
    policy: { weldToleranceM: 0.00002 },
  });
  if (!section.ok || !section.selectedLoop) return null;
  return pathFromSectionLoop(options.id, options.mesh, section.selectedLoop, options.bindToMesh);
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

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
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

function visibleOrUnavailable(
  measurementName: common_BodyMeasurementName,
  paths: readonly (MeasurementSurfaceMeasurementGuidePathV1 | null)[],
) {
  const visible = paths.filter(
    (path): path is MeasurementSurfaceMeasurementGuidePathV1 => path !== null,
  );
  return visible.length > 0
    ? result(measurementName, 'visible', visible)
    : result(measurementName, 'unavailable-section');
}

/**
 * Builds a visual guide from the shaped neutral mesh. Vertex-bound guides follow live posed
 * positions without rebuilding the Three scene. Fixed-coordinate guides fail soft outside the
 * neutral pose because they cannot truthfully follow the deformed body.
 */
export function buildMeasurementSurfaceActiveMeasurementGuideV1(options: {
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
  const chestY = options.torsoSectionStations?.chest?.[1] ?? chest?.yM;
  const underBustY = options.torsoSectionStations?.underBust?.[1];
  const waistY = options.torsoSectionStations?.waist?.[1] ?? waist?.yM;
  const hipY = options.torsoSectionStations?.hip?.[1] ?? hip?.yM;
  // Same protocol station as the high-hip proxy: `waistToHighHipMm` (default 100 mm) below the
  // waist, strictly above the hip. The runtime station wins when the proxy resolved one.
  const highHipDropMm =
    frame.measurements.waistToHighHipMm ??
    MEASUREMENT_OPEN_REFERENCE_HIGH_HIP_PROTOCOL_WAIST_DROP_MM_V1;
  const protocolHighHipY =
    waistY !== undefined && Number.isFinite(highHipDropMm) && highHipDropMm > 0
      ? waistY - highHipDropMm / 1000
      : undefined;
  const highHipY =
    options.torsoSectionStations?.highHip?.[1] ??
    (protocolHighHipY !== undefined &&
    waistY !== undefined &&
    hipY !== undefined &&
    hipY < protocolHighHipY &&
    protocolHighHipY < waistY
      ? protocolHighHipY
      : undefined);
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
    return visibleOrUnavailable(measurementName, [
      torsoSectionPath({
        id: measurementName,
        mesh,
        yM: torsoY,
        bindToMesh: !options.neutralPose,
      }),
    ]);
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
    return visibleOrUnavailable(measurementName, [
      vertexPath(
        measurementName,
        mesh,
        [
          [0, depthStation.yM, depthStation.halfDepthM],
          [0, depthStation.yM, -depthStation.halfDepthM],
        ],
        false,
      ),
    ]);
  }

  if (measurementName === 'BODY_MEASUREMENT_NAME_NECK_BASE') {
    let minimumY = Number.POSITIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;
    for (let offset = 1; offset < mesh.positions.length; offset += 3) {
      minimumY = Math.min(minimumY, mesh.positions[offset]);
      maximumY = Math.max(maximumY, mesh.positions[offset]);
    }
    return visibleOrUnavailable(measurementName, [
      segmentExtremumSectionPath({
        id: measurementName,
        mesh,
        aM: [0, minimumY, 0],
        bM: [0, maximumY, 0],
        range: [0.84, 0.9],
        select: 'minimum',
        bindToMesh: !options.neutralPose,
      }),
    ]);
  }

  if (measurementName === 'BODY_MEASUREMENT_NAME_NECK') {
    // Mid-neck ring on the proxy's own station; no analytical fallback, so the guide never shows a
    // line the neck proxy does not solve. Neck base above stays its own band and is not derived.
    const neckStation = options.neckSectionStation;
    return visibleOrUnavailable(measurementName, [
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
    return visibleOrUnavailable(measurementName, [
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
    return result(measurementName, 'visible', [
      path ?? fixedPath(measurementName, [shoulderLeft, shoulderRight]),
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
    return result(measurementName, 'visible', [
      path ?? fixedPath(measurementName, [shoulderLeft, elbow, wrist]),
    ]);
  }

  if (measurementName === 'BODY_MEASUREMENT_NAME_ACROSS_FRONT' && chest) {
    return visibleOrUnavailable(measurementName, [
      vertexPath(
        measurementName,
        mesh,
        [
          [-chest.halfWidthM * 0.78, chest.yM, chest.halfDepthM],
          [chest.halfWidthM * 0.78, chest.yM, chest.halfDepthM],
        ],
        false,
      ),
    ]);
  }
  if (measurementName === 'BODY_MEASUREMENT_NAME_ACROSS_BACK' && chest) {
    return visibleOrUnavailable(measurementName, [
      vertexPath(
        measurementName,
        mesh,
        [
          [-chest.halfWidthM * 0.78, chest.yM, -chest.halfDepthM],
          [chest.halfWidthM * 0.78, chest.yM, -chest.halfDepthM],
        ],
        false,
      ),
    ]);
  }
  if (measurementName === 'BODY_MEASUREMENT_NAME_HPS_TO_WAIST_FRONT' && waist) {
    const neckBase = landmark(frame, 'neck-base');
    if (!neckBase) return result(measurementName, 'unavailable-section');
    return visibleOrUnavailable(measurementName, [
      vertexPath(
        measurementName,
        mesh,
        [
          [neckBase[0], neckBase[1], shoulder?.halfDepthM ?? 0],
          [0, waist.yM, waist.halfDepthM],
        ],
        false,
      ),
    ]);
  }
  if (measurementName === 'BODY_MEASUREMENT_NAME_CF_NECK_TO_WAIST' && waist) {
    const neckBase = landmark(frame, 'neck-base');
    if (!neckBase) return result(measurementName, 'unavailable-section');
    return visibleOrUnavailable(measurementName, [
      vertexPath(
        measurementName,
        mesh,
        [
          [0, neckBase[1], shoulder?.halfDepthM ?? 0],
          [0, waist.yM, waist.halfDepthM],
        ],
        false,
      ),
    ]);
  }
  if (measurementName === 'BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST' && waist) {
    const neckBase = landmark(frame, 'neck-base');
    if (!neckBase) return result(measurementName, 'unavailable-section');
    return visibleOrUnavailable(measurementName, [
      vertexPath(
        measurementName,
        mesh,
        [
          [0, neckBase[1], -(shoulder?.halfDepthM ?? 0)],
          [0, waist.yM, -waist.halfDepthM],
        ],
        false,
      ),
    ]);
  }

  if (
    (measurementName === 'BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP' ||
      measurementName === 'BODY_MEASUREMENT_NAME_WAIST_TO_HIP') &&
    waist &&
    hip
  ) {
    const t = measurementName === 'BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP' ? 0.45 : 1;
    return visibleOrUnavailable(measurementName, [
      vertexPath(
        measurementName,
        mesh,
        [
          [waist.halfWidthM, waist.yM, 0],
          [
            waist.halfWidthM + (hip.halfWidthM - waist.halfWidthM) * t,
            waist.yM + (hip.yM - waist.yM) * t,
            0,
          ],
        ],
        false,
      ),
    ]);
  }

  // There is no admitted crotch, HPS, bust-apex or armscye landmark. A guessed path would teach
  // the wrong protocol, so those guides remain explicitly unsupported.
  return result(measurementName, 'unsupported');
}
