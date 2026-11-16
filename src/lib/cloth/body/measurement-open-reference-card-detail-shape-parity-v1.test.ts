import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import { createMeasurementBodyFrameV2 } from './measurement-body-frame-v2';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from './measurement-body-synthetic-corpus';
import {
  createMeasurementOpenReferenceBetaShapeRuntimeV1,
  MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1,
} from './measurement-open-reference-beta-shape-runtime-v1';
import { createMeasurementOpenReferenceDisplaySnapshotOwnerV2 } from './measurement-open-reference-display-snapshot-owner-v2';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import { createMeasurementOpenReferenceUniformWaistHipRuntimeV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';

const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
  readFileSync(resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin')),
);

const measurements = CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements;
const basis = parseMakeHumanOpenReferenceBasisV1(
  readFileSync(resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1.female.assetPath)),
  'female',
);

async function buildDetailV9Shape() {
  const frame = createMeasurementBodyFrameV2({
    measurements,
    sourceRevision: 'detail-v9-shape-parity-fixture',
    pose: 'A',
  });
  const openReference = createMeasurementOpenReferenceUniformHeightDisplayV1({ basis, frame });
  const waistHipRuntime = await createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
    basis,
    measurements,
    openReference,
    loadBundle: async () => torsoBundle,
  });
  return createMeasurementOpenReferenceBetaShapeRuntimeV1({
    basis,
    measurements,
    waistHipRuntime,
    loadTorsoBundle: async () => torsoBundle,
  });
}

async function buildCardShape() {
  const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2({
    loadBasis: async () => basis,
    createUniformHeightDisplay: createMeasurementOpenReferenceUniformHeightDisplayV1,
    createWaistHipRuntime: (options) =>
      createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
        ...options,
        loadBundle: async () => torsoBundle,
      }),
    createBetaShapeRuntime: (options) =>
      createMeasurementOpenReferenceBetaShapeRuntimeV1({
        ...options,
        loadTorsoBundle: async () => torsoBundle,
      }),
  });
  const result = await owner.build({
    modelId: 'saved-model-17',
    modelContentRevision: 'saved-model-17:shape-parity',
    inputFingerprint: 'saved-model-17:canonical-measurements',
    basisKind: 'female',
    measurements,
    poseSelection: Object.freeze({ lane: 'relax' as const, degrees: 0 as const }),
  });
  if (result.status !== 'committed') {
    throw new Error(result.status === 'blocked' ? result.message : result.reason);
  }
  return result.snapshot;
}

function torsoRegionSignature(positions: Float32Array, lower: number, upper: number) {
  const heightM = measurements.heightMm / 1000;
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (let offset = 0; offset < positions.length; offset += 3) {
    const normalizedHeight = positions[offset + 1] / heightM;
    if (normalizedHeight < lower || normalizedHeight > upper) continue;
    minimumX = Math.min(minimumX, positions[offset]);
    maximumX = Math.max(maximumX, positions[offset]);
    minimumZ = Math.min(minimumZ, positions[offset + 2]);
    maximumZ = Math.max(maximumZ, positions[offset + 2]);
    count += 1;
  }
  return Object.freeze({
    count,
    widthM: maximumX - minimumX,
    depthM: maximumZ - minimumZ,
  });
}

describe('model card/detail personalized shape parity v1', () => {
  it('uses the detail V9 beta owner for matching chest, shoulder, waist and hip geometry', async () => {
    const [card, detail] = await Promise.all([buildCardShape(), buildDetailV9Shape()]);

    expect(card.shape).toMatchObject({
      runtimeRevision: MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1,
      sourceRevisionSuffix: detail.sourceRevisionSuffix,
      representedVisualControls: expect.arrayContaining([
        'shoulderBreadthMm',
        'chestCircumferenceMm',
        'waistCircumferenceMm',
        'hipCircumferenceMm',
      ]),
    });
    expect(card.binding.sourceRevision).toContain(
      `shapeRuntimeRevision=${MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1}`,
    );
    expect(card.displayMesh.indices).toEqual(detail.fkProxyRuntime.displayMesh.indices);
    expect(card.displayMesh.positions).toEqual(detail.fkProxyRuntime.displayMesh.positions);

    // Exact mesh equality is the owner contract; these regional signatures make the torso parity
    // explicit and catch a future card-only fallback to height/waist/hip geometry.
    for (const [lower, upper] of [
      [0.76, 0.88], // shoulder
      [0.62, 0.76], // chest
      [0.48, 0.62], // waist
      [0.38, 0.52], // hip
    ] as const) {
      const cardRegion = torsoRegionSignature(card.displayMesh.positions, lower, upper);
      const detailRegion = torsoRegionSignature(
        detail.fkProxyRuntime.displayMesh.positions,
        lower,
        upper,
      );
      expect(cardRegion.count).toBeGreaterThan(0);
      expect(cardRegion).toEqual(detailRegion);
      expect(cardRegion.widthM).toBeGreaterThan(0);
      expect(cardRegion.depthM).toBeGreaterThan(0);
    }
    expect(card.claims).toMatchObject({
      garmentFitClaimed: false,
      fitClaimEligible: false,
      runtimeCollisionEligible: false,
      productionAuthority: false,
    });
  }, 30_000);
});
