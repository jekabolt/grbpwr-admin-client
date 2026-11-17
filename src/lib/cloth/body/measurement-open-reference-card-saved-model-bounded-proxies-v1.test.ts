import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import type { common_Model } from 'api/proto-http/admin';
import { resolveModelOpenReferencePreviewInputV1 } from 'components/managers/model/components/model-open-reference-preview-input-v1';
import { modelCardMannequinInputV1 } from 'components/managers/models/components/model-card-mannequin-input-v1';

import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import { createMeasurementOpenReferenceBetaShapeRuntimeV1 } from './measurement-open-reference-beta-shape-runtime-v1';
import { createMeasurementOpenReferenceDisplaySnapshotOwnerV2 } from './measurement-open-reference-display-snapshot-owner-v2';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import { createMeasurementOpenReferenceUniformWaistHipRuntimeV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';

// Saved beta model #11 (19 measurements, male, no saved pose -> linked-v2 card path). It carries
// high_hip and knee, which the canonical adapter admits as bounded-proxy keys.
const SAVED_MODEL_11_ROWS: readonly (readonly [string, number])[] = [
  ['across_back', 590],
  ['across_shoulder', 520],
  ['ankle', 415],
  ['bicep', 365],
  ['calf', 390],
  ['cb_neck_to_waist', 380],
  ['chest', 1120],
  ['height', 1900],
  ['high_hip', 800],
  ['hip', 1060],
  ['hps_to_waist_front', 410],
  ['inseam', 815],
  ['knee', 450],
  ['neck_base', 455],
  ['sleeve_length', 700],
  ['thigh', 560],
  ['under_bust', 950],
  ['waist', 940],
  ['wrist', 180],
];

const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
  readFileSync(resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin')),
);
const basis = parseMakeHumanOpenReferenceBasisV1(
  readFileSync(resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1.male.assetPath)),
  'male',
);

function savedModel11(): common_Model {
  return {
    id: 11,
    model: {
      gender: 'GENDER_ENUM_MALE',
      measurements: SAVED_MODEL_11_ROWS.map(([name, valueMm]) => ({
        name: `BODY_MEASUREMENT_NAME_${name.toUpperCase()}`,
        valueMm,
      })),
    },
  } as unknown as common_Model;
}

/** Same runtime options as the product card defaults; only the asset loaders are local. */
function cardOwner() {
  return createMeasurementOpenReferenceDisplaySnapshotOwnerV2({
    loadBasis: async () => basis,
    createUniformHeightDisplay: createMeasurementOpenReferenceUniformHeightDisplayV1,
    createWaistHipRuntime: (options) =>
      createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
        ...options,
        widenSafeRange: true,
        loadBundle: async () => torsoBundle,
      }),
    createBetaShapeRuntime: (options) =>
      createMeasurementOpenReferenceBetaShapeRuntimeV1({
        ...options,
        estimateUntypedFields: true,
        loadTorsoBundle: async () => torsoBundle,
      }),
  });
}

function resolvedModel11() {
  const resolution = resolveModelOpenReferencePreviewInputV1(
    modelCardMannequinInputV1(savedModel11()),
  );
  if (!resolution.ok) throw new Error('saved model #11 must resolve');
  return resolution;
}

describe('model card mannequin with saved bounded-proxy measurements v1', () => {
  it('admits high-hip and knee through the card snapshot owner and commits A-rest', async () => {
    const resolution = resolvedModel11();
    expect(resolution.measurements).toMatchObject({
      highHipCircumferenceMm: 800,
      kneeCircumferenceMm: 450,
    });

    const result = await cardOwner().build({
      modelId: 'models-card:model:11',
      modelContentRevision: 'saved-model-11:card',
      inputFingerprint: 'saved-model-11:canonical-measurements',
      basisKind: 'male',
      measurements: resolution.measurements,
      poseSelection: Object.freeze({ lane: 'relax' as const, degrees: 0 as const }),
    });

    if (result.status !== 'committed') {
      throw new Error(result.status === 'blocked' ? result.message : result.reason);
    }
    expect(result.snapshot.pose.status).toBe('a-rest');
    expect(result.snapshot.displayMesh.positions.length).toBeGreaterThan(0);
    expect(result.snapshot.claims).toMatchObject({ garmentFitClaimed: false });
  }, 60_000);

  it('still blocks a measurement key outside the canonical set', async () => {
    const resolution = resolvedModel11();
    const result = await cardOwner().build({
      modelId: 'models-card:model:11',
      modelContentRevision: 'saved-model-11:card',
      inputFingerprint: 'saved-model-11:canonical-measurements',
      basisKind: 'male',
      measurements: { ...resolution.measurements, elbowCircumferenceMm: 280 } as never,
      poseSelection: Object.freeze({ lane: 'relax' as const, degrees: 0 as const }),
    });
    expect(result).toMatchObject({
      status: 'blocked',
      code: 'invalid-request',
      message: 'request.measurements contains missing or unknown fields.',
    });
  });
});
