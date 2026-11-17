import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { modelOpenReferenceMeasurementApplicationV1 } from 'components/managers/model/components/model-open-reference-measurement-application-v1';
import { resolveModelOpenReferencePreviewInputV1 } from 'components/managers/model/components/model-open-reference-preview-input-v1';

import { parseMakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import { parseMakeHumanLimbCircumferenceDeltaBundleV1 } from './makehuman-limb-circumference-delta-bundle-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import { createMakeHumanUniformChestShoulderModesResearchV1 } from './makehuman-uniform-chest-shoulder-modes-research-v1';
import { parseMakeHumanWaistHipRigAnchorDeltaBundleV1 } from './makehuman-waist-hip-rig-anchor-research-v1';
import {
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1,
  parseMakeHuman2PoseCompatibleLengthPackV1,
} from './makehuman2-pose-compatible-length-pack-v1';
import { createMeasurementBodyFrameV2 } from './measurement-body-frame-v2';
import { createMeasurementOpenReferenceBetaShapeRuntimeV1 } from './measurement-open-reference-beta-shape-runtime-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import { createMeasurementOpenReferenceLimbSubsetRuntimeV1 } from './measurement-open-reference-limb-subset-runtime-v1';
import {
  DEFAULT_MEASUREMENT_OPEN_REFERENCE_NECK_PROXY_POLICY_V1,
  inspectMeasurementOpenReferenceNeckAdmissionV1,
  resolveMeasurementOpenReferenceNeckRigHeadsV1,
} from './measurement-open-reference-neck-proxy-v1';
import { createMeasurementOpenReferenceUniformWaistHipRuntimeV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';

/**
 * Male-base neck never applies, by geometry rather than by a bug (ANSUR study: 600 of 600 male
 * builds `station-too-close`). The proxy's band radius is 0.45 x the neck01->neck02 distance (max
 * 30 mm) and must be at least 12 mm. The HM08 male rig puts neck01 only ~23 mm under neck02
 * (female ~43 mm, neutral ~35 mm), so the band is ~10.4 mm. Sliding the station up the neck admits
 * it only 7-8 mm higher with 0.2-2 mm of margin, where the band reaches toward the jaw; that is
 * not a safe fix. The honest state is pinned here: the male base reports neck as not applied, and
 * only female and neutral may claim it.
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
const basisOf = (kind: 'female' | 'male' | 'neutral') =>
  parseMakeHumanOpenReferenceBasisV1(
    readAsset(MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
    kind,
  );

/** ANSUR II subject 14066 (male), full form set with neck (study experiment B). */
const ANSUR_14066_FULL = Object.freeze({
  BODY_MEASUREMENT_NAME_HEIGHT: 1873,
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 425,
  BODY_MEASUREMENT_NAME_CHEST: 1132,
  BODY_MEASUREMENT_NAME_WAIST: 978,
  BODY_MEASUREMENT_NAME_HIP: 1070,
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 582,
  BODY_MEASUREMENT_NAME_INSEAM: 872,
  BODY_MEASUREMENT_NAME_CHEST_DEPTH: 285,
  BODY_MEASUREMENT_NAME_WAIST_DEPTH: 253,
  BODY_MEASUREMENT_NAME_HIP_DEPTH: 277,
  BODY_MEASUREMENT_NAME_NECK: 420,
  BODY_MEASUREMENT_NAME_WRIST: 191,
  BODY_MEASUREMENT_NAME_THIGH: 680,
  BODY_MEASUREMENT_NAME_CALF: 405,
  BODY_MEASUREMENT_NAME_ANKLE: 234,
});

const distance = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function admissionOf(kind: 'female' | 'male' | 'neutral', heightMm: number) {
  const basis = basisOf(kind);
  const sourcePositionsM = createMakeHumanUniformChestShoulderModesResearchV1({
    basis,
    heightMm,
    bundle: torsoBundle,
  }).uniformPositionsM;
  const rigHeads = resolveMeasurementOpenReferenceNeckRigHeadsV1({
    basis,
    heightMm,
    rig: poseResources.rig,
  });
  const admission = inspectMeasurementOpenReferenceNeckAdmissionV1({
    sourcePositionsM,
    triangleIndices: basis.indices,
    rigHeads,
  });
  return { rigHeads, admission };
}

async function applicationOf(gender: 'GENDER_ENUM_MALE' | undefined) {
  const resolution = resolveModelOpenReferencePreviewInputV1({
    gender,
    measurements: ANSUR_14066_FULL,
  });
  if (!resolution.ok) throw new Error('ANSUR fixture did not resolve');
  const { measurements } = resolution;
  const basis = basisOf(resolution.basis.basisKind as 'male' | 'neutral');
  const openReference = createMeasurementOpenReferenceUniformHeightDisplayV1({
    basis,
    frame: createMeasurementBodyFrameV2({ measurements, sourceRevision: 'neck-male', pose: 'A' }),
  });
  const waistHipRuntime = await createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
    basis,
    measurements,
    openReference,
    loadBundle: async () => torsoBundle,
  });
  const beta = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
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
  if (!beta) throw new Error('beta runtime did not run');
  return {
    beta,
    application: modelOpenReferenceMeasurementApplicationV1({
      measurements,
      rawMeasurements: ANSUR_14066_FULL,
      beta,
    }),
  };
}

describe('male-base neck station v1', () => {
  it('rejects the male rig band as too close; female and neutral are admitted', () => {
    const heightMm = ANSUR_14066_FULL.BODY_MEASUREMENT_NAME_HEIGHT;
    const policy = DEFAULT_MEASUREMENT_OPEN_REFERENCE_NECK_PROXY_POLICY_V1;
    const male = admissionOf('male', heightMm);
    const maleSpanM = distance(male.rigHeads.neck01, male.rigHeads.neck02);
    expect(maleSpanM * policy.stationDistanceRadiusRatio).toBeLessThan(policy.minimumAxialRadiusM);
    expect(male.admission.ok).toBe(false);
    expect(male.admission.ok ? null : male.admission.diagnostic.code).toBe('station-too-close');
    for (const kind of ['female', 'neutral'] as const) {
      const admitted = admissionOf(kind, heightMm);
      const spanM = distance(admitted.rigHeads.neck01, admitted.rigHeads.neck02);
      expect(spanM, kind).toBeGreaterThan(maleSpanM + 0.01);
      expect(admitted.admission.ok, kind).toBe(true);
    }
  }, 60_000);

  it('reports the male neck as not applied and lets the neutral base claim it', async () => {
    const male = await applicationOf('GENDER_ENUM_MALE');
    expect(male.beta.chestShoulderDiagnostics).toContain('neckCircumferenceMm:station-too-close');
    expect(male.beta.representedVisualControls).not.toContain('neckCircumferenceMm');
    expect(male.beta.limitedVisualControls ?? []).not.toContain('neckCircumferenceMm');
    expect(male.application.notApplied).toContain('neckCircumferenceMm');

    const neutral = await applicationOf(undefined);
    expect([...neutral.application.applied, ...neutral.application.limitedBySafeRange]).toContain(
      'neckCircumferenceMm',
    );
    expect(neutral.application.notApplied).not.toContain('neckCircumferenceMm');
  }, 180_000);
});
