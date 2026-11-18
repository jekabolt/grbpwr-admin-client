import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import type { common_BodyMeasurementName } from 'api/proto-http/admin';
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
import { parseMakeHumanCoreRigBundleV1 } from 'lib/cloth/body/makehuman-core-rig-pose-research-v1';
import { createMeasurementOpenReferenceFullBodyLocalFkRuntimeV4 } from 'lib/cloth/body/makehuman-full-body-local-fk-runtime-v4';
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
import { snapMeshMirrorPairsV1 } from 'lib/cloth/body/mesh-mirror-pair-snap-v1';
import { measureMeshPlaneSectionPerimetersV1 } from 'lib/cloth/body/mesh-plane-section-perimeter-v1';
import { meshPlaneSectionLoopTapePerimeterMV1 } from 'lib/cloth/body/mesh-plane-section-tape-girth-v1';
import { createMeshSurfaceTopologyV1 } from 'lib/cloth/body/mesh-surface-topology-v1';

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

/**
 * Model #11 on beta, the owner's acceptance case: male, its 19 saved measurements. Before the
 * mirror snap its body was 2.7 um off mirror on 203 vertices and every anchor-only field drew
 * nothing on the live preview.
 */
const MODEL_11_MEASUREMENTS: Readonly<Record<string, number>> = Object.freeze({
  BODY_MEASUREMENT_NAME_HEIGHT: 1900,
  BODY_MEASUREMENT_NAME_ACROSS_BACK: 590,
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 520,
  BODY_MEASUREMENT_NAME_ANKLE: 415,
  BODY_MEASUREMENT_NAME_BICEP: 365,
  BODY_MEASUREMENT_NAME_CALF: 390,
  BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST: 380,
  BODY_MEASUREMENT_NAME_CHEST: 1120,
  BODY_MEASUREMENT_NAME_HIGH_HIP: 800,
  BODY_MEASUREMENT_NAME_HIP: 1060,
  BODY_MEASUREMENT_NAME_HPS_TO_WAIST_FRONT: 410,
  BODY_MEASUREMENT_NAME_INSEAM: 815,
  BODY_MEASUREMENT_NAME_KNEE: 450,
  BODY_MEASUREMENT_NAME_NECK_BASE: 455,
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 700,
  BODY_MEASUREMENT_NAME_THIGH: 560,
  BODY_MEASUREMENT_NAME_UNDER_BUST: 950,
  BODY_MEASUREMENT_NAME_WAIST: 940,
  BODY_MEASUREMENT_NAME_WRIST: 180,
});
/** ANSUR II subject 15456 (male), core set: 13 midline vertices up to 0.1 mm off x = 0. */
const ANSUR_15456_MALE = Object.freeze({
  BODY_MEASUREMENT_NAME_HEIGHT: 1714,
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 422,
  BODY_MEASUREMENT_NAME_CHEST: 1237,
  BODY_MEASUREMENT_NAME_WAIST: 1136,
  BODY_MEASUREMENT_NAME_HIP: 1134,
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 559,
  BODY_MEASUREMENT_NAME_INSEAM: 774,
});
/** ANSUR II subject 14066 (male), core set: chest and shoulder inside the safe range. */
const ANSUR_14066_MALE = Object.freeze({
  BODY_MEASUREMENT_NAME_HEIGHT: 1873,
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 425,
  BODY_MEASUREMENT_NAME_CHEST: 1132,
  BODY_MEASUREMENT_NAME_WAIST: 978,
  BODY_MEASUREMENT_NAME_HIP: 1070,
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 582,
  BODY_MEASUREMENT_NAME_INSEAM: 872,
});

const ANCHOR_ONLY_FIELDS = Object.freeze([
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
] as const satisfies readonly common_BodyMeasurementName[]);

const bodies = new Map<string, ReturnType<typeof buildBody>>();

/** The production preview chain: form input -> beta runtime -> FK display mesh (neutral pose). */
function body(gender: 'GENDER_ENUM_MALE' | undefined, captured: Readonly<Record<string, number>>) {
  const key = `${gender}:${JSON.stringify(captured)}`;
  const built = bodies.get(key) ?? buildBody(gender, captured);
  bodies.set(key, built);
  return built;
}

async function buildBody(
  gender: 'GENDER_ENUM_MALE' | undefined,
  captured: Readonly<Record<string, number>>,
) {
  const guided = resolveModelGuidedMeasurementPreviewInputV1({ gender, measurements: captured });
  const resolution = resolveModelOpenReferencePreviewInputV1(guided.input);
  if (!resolution.ok) throw new Error('fixture did not resolve');
  const kind = resolution.basis.basisKind as 'male' | 'neutral';
  const { measurements } = resolution;
  const basis = parseMakeHumanOpenReferenceBasisV1(
    readAsset(MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
    kind,
  );
  const openReference = createMeasurementOpenReferenceUniformHeightDisplayV1({
    basis,
    frame: createMeasurementBodyFrameV2({ measurements, sourceRevision: 'anchors', pose: 'A' }),
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
  if (!betaRuntime) throw new Error('beta runtime did not run');
  const runtime = await createMeasurementOpenReferenceFullBodyLocalFkRuntimeV4({
    basis,
    measurements,
    proxyRuntime: betaRuntime.fkProxyRuntime,
    input: modelOpenReferenceDirectRuntimePoseV9(MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9),
    sourceRevision: 'anchors',
    loadResources: async () => poseResources as never,
  });
  const frame = createMeasurementBodyFrameV2({
    measurements,
    sourceRevision: runtime.sourceRevision,
    pose: 'A',
  });
  const mesh = runtime.displayMesh;
  const guide = (measurementName: common_BodyMeasurementName) =>
    buildMeasurementSurfaceActiveMeasurementGuideV1({
      measurementName,
      frame,
      mesh,
      neutralPose: true,
      limbSectionModes: betaRuntime.limbSectionModes,
      torsoSectionStations: betaRuntime.torsoSectionStations,
      neckSectionStation: betaRuntime.neckSectionStation,
      shoulderChordVertices: betaRuntime.shoulderChordVertices,
    });
  return { kind, measurements, betaRuntime, mesh, guide };
}

function pathPoints(path: MeasurementSurfaceMeasurementGuidePathV1, positionsM: Float32Array) {
  if (path.source === 'fixed-points') return path.pointsM;
  if (path.source === 'mesh-vertices') {
    return path.vertexIndices.map(
      (vertex) =>
        [positionsM[vertex * 3], positionsM[vertex * 3 + 1], positionsM[vertex * 3 + 2]] as const,
    );
  }
  throw new Error(`unexpected ${path.source} path`);
}

function chordM(points: readonly (readonly [number, number, number])[]) {
  const [a, b] = points;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe('measurement guide anchors on off-mirror bodies v1', () => {
  it.each([
    ['model #11', MODEL_11_MEASUREMENTS],
    ['ANSUR 15456', ANSUR_15456_MALE],
  ] as const)(
    'draws every anchor-only field on %s, whose body is not bit-exact mirror',
    async (_label, captured) => {
      const built = await body('GENDER_ENUM_MALE', captured);
      expect(built.kind).toBe('male');
      // The shaped body itself still fails the exact mirror map (float drift)...
      const raw = createMeshSurfaceTopologyV1({
        positionsM: built.mesh.positions,
        triangleIndices: built.mesh.indices,
      });
      expect(raw.ok).toBe(false);
      // ...by far less than a millimetre, so the guide snaps the pairs and keeps its anchors.
      const snapped = snapMeshMirrorPairsV1(built.mesh.positions);
      expect(snapped.ok).toBe(true);
      expect(snapped.ok && snapped.maxOffsetM).toBeLessThan(0.0002);
      for (const measurementName of ANCHOR_ONLY_FIELDS) {
        const guide = built.guide(measurementName);
        expect(['visible', 'limited'], measurementName).toContain(guide.status);
        expect(guide.paths.length, measurementName).toBeGreaterThan(0);
      }
    },
    180_000,
  );

  it.each([
    ['male', 'GENDER_ENUM_MALE'],
    ['neutral', undefined],
  ] as const)(
    'draws the %s chest on the plane the engine solves and closes it on the target',
    async (_kind, gender) => {
      const built = await body(gender, ANSUR_14066_MALE);
      const station = built.betaRuntime.torsoSectionStations?.chest;
      expect(station).toBeDefined();
      expect(built.betaRuntime.representedVisualControls).toContain('chestCircumferenceMm');
      const guide = built.guide('BODY_MEASUREMENT_NAME_CHEST');
      expect(guide.status).toBe('visible');
      const stationY = station?.[1] ?? NaN;
      const points = pathPoints(guide.paths[0], built.mesh.positions);
      const offPlaneM = Math.max(...points.map((point) => Math.abs(point[1] - stationY)));
      expect(offPlaneM).toBeLessThan(0.0005);
      // The tape around the skin ring on that plane (its convex hull) is the girth the engine
      // closed: typed chest is a tape girth, which bridges the hollows the raw loop follows.
      const ring = measureMeshPlaneSectionPerimetersV1({
        positionsM: built.mesh.positions,
        triangleIndices: built.mesh.indices,
        planeOriginM: [0, stationY, station?.[2] ?? 0],
        planeNormal: [0, 1, 0],
        selection: { kind: 'nearest-seed', seedM: [0, stationY, station?.[2] ?? 0] },
        policy: { weldToleranceM: 0.00002 },
      });
      expect(ring.ok && ring.selectedLoop).toBeTruthy();
      expect(
        (ring.ok && ring.selectedLoop
          ? meshPlaneSectionLoopTapePerimeterMV1(ring.selectedLoop)
          : NaN) * 1000,
      ).toBeCloseTo(built.measurements.chestCircumferenceMm ?? NaN, 0);
    },
    180_000,
  );

  it.each([
    ['ANSUR 14066', ANSUR_14066_MALE],
    ['model #11', MODEL_11_MEASUREMENTS],
  ] as const)(
    'draws the shoulder chord the engine solves on %s',
    async (_label, captured) => {
      const built = await body('GENDER_ENUM_MALE', captured);
      const vertices = built.betaRuntime.shoulderChordVertices;
      expect(vertices).toBeDefined();
      const guide = built.guide('BODY_MEASUREMENT_NAME_ACROSS_SHOULDER');
      expect(guide.status).toBe('limited');
      expect(guide.paths).toHaveLength(1);
      const [path] = guide.paths;
      expect(path).toMatchObject({
        source: 'mesh-vertices',
        air: 'x-ray',
        vertexIndices: [vertices?.positive, vertices?.negative],
      });
      expect(built.betaRuntime.representedVisualControls).toContain('shoulderBreadthMm');
      expect(chordM(pathPoints(path, built.mesh.positions)) * 1000).toBeCloseTo(
        built.measurements.shoulderBreadthMm ?? NaN,
        0,
      );
    },
    180_000,
  );
});
