import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { ANSUR_UNTYPED_FIELD_ESTIMATE_KEYS_V1 } from './ansur-untyped-field-estimates-v1';
import { parseMakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import { parseMakeHumanLimbCircumferenceDeltaBundleV1 } from './makehuman-limb-circumference-delta-bundle-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import { parseMakeHumanWaistHipRigAnchorDeltaBundleV1 } from './makehuman-waist-hip-rig-anchor-research-v1';
import {
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1,
  parseMakeHuman2PoseCompatibleLengthPackV1,
} from './makehuman2-pose-compatible-length-pack-v1';
import {
  CANONICAL_BODY_MEASUREMENTS_VERSION,
  type CanonicalBodyMeasurementsMm,
} from './measurement-adapter';
import { createMeasurementBodyFrameV2 } from './measurement-body-frame-v2';
import {
  createMeasurementOpenReferenceBetaShapeRuntimeV1,
  type MeasurementOpenReferenceBetaShapeRuntimeResultV1,
} from './measurement-open-reference-beta-shape-runtime-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import { createMeasurementOpenReferenceLimbSubsetRuntimeV1 } from './measurement-open-reference-limb-subset-runtime-v1';
import { createMeasurementOpenReferenceUniformWaistHipRuntimeV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';

const read = (path: string) => readFileSync(resolve(process.cwd(), path));
const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
  read('src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin'),
);
const limbBundle = parseMakeHumanLimbCircumferenceDeltaBundleV1(
  read('src/assets/cloth/makehuman-hm08-limb-circumference-deltas-v1.bin'),
);
const poseMetadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
const poseResources = Object.freeze({
  rig: parseMakeHumanCoreRigBundleV1(read(poseMetadata.rigAssetPath)),
  anchors: parseMakeHumanWaistHipRigAnchorDeltaBundleV1(read(poseMetadata.anchorAssetPath), {
    byteLength: poseMetadata.anchorByteLength,
    sourceRigBundleSha256: poseMetadata.rigSha256,
    sourceTorsoBundleSha256: poseMetadata.torsoDirectionBundleSha256,
  }),
});
const lengthPack = parseMakeHuman2PoseCompatibleLengthPackV1(
  read(MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.assetPath),
);

/**
 * ANSUR II holdout subject 18186 (female), only the seven core fields typed: stature 1608,
 * biacromial 374, chest 850, waist 768 (navel, typed as is), buttock 975, sleeve outseam 537,
 * crotch height 763 mm. Her untyped fields get the pinned guesses of the coefficient module test.
 */
const SUBJECT_18186: CanonicalBodyMeasurementsMm = Object.freeze({
  schemaVersion: CANONICAL_BODY_MEASUREMENTS_VERSION,
  heightMm: 1608,
  shoulderBreadthMm: 374,
  chestCircumferenceMm: 850,
  waistCircumferenceMm: 768,
  hipCircumferenceMm: 975,
  armLengthMm: 537,
  inseamMm: 763,
});

const rank = (result: MeasurementOpenReferenceBetaShapeRuntimeResultV1, key: string) =>
  result.representedVisualControls.includes(key as never)
    ? 2
    : (result.limitedVisualControls ?? []).includes(key as never)
      ? 1
      : 0;

describe('beta shape runtime with ANSUR II guesses for untyped fields', () => {
  it('shapes guessed fields without listing them as typed and without costing a typed field', async () => {
    const basis = parseMakeHumanOpenReferenceBasisV1(
      read(MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1.female.assetPath),
      'female',
    );
    const frame = createMeasurementBodyFrameV2({
      measurements: SUBJECT_18186,
      sourceRevision: 'ansur-estimates-test',
      pose: 'A',
    });
    const openReference = createMeasurementOpenReferenceUniformHeightDisplayV1({ basis, frame });
    const waistHipRuntime = await createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
      basis,
      measurements: SUBJECT_18186,
      openReference,
      loadBundle: async () => torsoBundle,
    });
    const options = {
      basis,
      measurements: SUBJECT_18186,
      waistHipRuntime,
      loadTorsoBundle: async () => torsoBundle,
      loadLimbBundle: async () => limbBundle,
      loadLengthPack: async () => lengthPack,
      loadPoseResources: async () => poseResources,
      createLimbRuntime: (
        limbOptions: Parameters<typeof createMeasurementOpenReferenceLimbSubsetRuntimeV1>[0],
      ) =>
        createMeasurementOpenReferenceLimbSubsetRuntimeV1({
          ...limbOptions,
          loadLimbBundle: async () => limbBundle,
          loadTorsoBundle: async () => torsoBundle,
        }),
    };
    const typedOnly = await createMeasurementOpenReferenceBetaShapeRuntimeV1(options);
    const guessed = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
      ...options,
      estimateUntypedFields: true,
    });

    expect(typedOnly.estimatedVisualControls).toBeUndefined();
    expect(guessed.status).not.toBe('error');
    expect(guessed.estimatedVisualControls?.length).toBeGreaterThan(0);
    expect(guessed.chestShoulderDiagnostics).toContain(
      `ansur-untyped-estimates:applied:${guessed.estimatedVisualControls!.join(',')}`,
    );
    expect(guessed.sourceRevisionSuffix).toContain('estimated=ansur-untyped-field-estimates/v1:');
    // Fed values are exactly the coefficient module's guesses for this subject.
    expect(guessed.untypedFieldEstimatesMm?.wristCircumferenceMm).toBe(151.6);
    expect(guessed.untypedFieldEstimatesMm?.thighCircumferenceMm).toBe(587.7);
    for (const key of ANSUR_UNTYPED_FIELD_ESTIMATE_KEYS_V1) {
      expect(guessed.representedVisualControls).not.toContain(key);
      expect(guessed.limitedVisualControls ?? []).not.toContain(key);
    }
    // A guess never lowers a typed field's status below the typed-only build.
    for (const key of new Set([
      ...typedOnly.representedVisualControls,
      ...(typedOnly.limitedVisualControls ?? []),
    ])) {
      expect(rank(guessed, key)).toBeGreaterThanOrEqual(rank(typedOnly, key));
    }
    expect(guessed.fkProxyRuntime.displayMesh.positions).not.toEqual(
      typedOnly.fkProxyRuntime.displayMesh.positions,
    );
  }, 240_000);
});
