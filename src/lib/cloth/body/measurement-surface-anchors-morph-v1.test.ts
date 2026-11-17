import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { parseMakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import { parseMakeHumanWaistHipRigAnchorDeltaBundleV1 } from './makehuman-waist-hip-rig-anchor-research-v1';
import {
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1,
  parseMakeHuman2PoseCompatibleLengthPackV1,
} from './makehuman2-pose-compatible-length-pack-v1';
import { createMeasurementBodyFrameV2 } from './measurement-body-frame-v2';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from './measurement-body-synthetic-corpus';
import { createMeasurementOpenReferenceBetaShapeRuntimeV1 } from './measurement-open-reference-beta-shape-runtime-v1';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';
import { createMeasurementOpenReferenceUniformWaistHipRuntimeV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';
import {
  checkSurfaceAnchorSubsetV1,
  checkSurfaceAnchorsV1,
  type SurfaceAnchorFailureCodeV1,
} from './measurement-surface-anchors-v1';
import { createMeshSurfaceTopologyV1 } from './mesh-surface-topology-v1';

const torsoBundle = parseMakeHumanTorsoShapeDeltaBundleV1(
  readFileSync(resolve(process.cwd(), 'src/assets/cloth/makehuman-hm08-torso-shape-deltas-v1.bin')),
);
const poseMetadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
const poseResources = Object.freeze({
  rig: parseMakeHumanCoreRigBundleV1(
    readFileSync(resolve(process.cwd(), poseMetadata.rigAssetPath)),
  ),
  anchors: parseMakeHumanWaistHipRigAnchorDeltaBundleV1(
    readFileSync(resolve(process.cwd(), poseMetadata.anchorAssetPath)),
    {
      byteLength: poseMetadata.anchorByteLength,
      sourceRigBundleSha256: poseMetadata.rigSha256,
      sourceTorsoBundleSha256: poseMetadata.torsoDirectionBundleSha256,
    },
  ),
});
const lengthPack = parseMakeHuman2PoseCompatibleLengthPackV1(
  readFileSync(
    resolve(process.cwd(), MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.assetPath),
  ),
);

/** Ends of the canonical size range the beta shape runtime is tested on (small 1550, large 1900). */
const RANGE_ENDS = Object.freeze([
  CANONICAL_MEASUREMENT_SIZE_RECORDS[0],
  CANONICAL_MEASUREMENT_SIZE_RECORDS[CANONICAL_MEASUREMENT_SIZE_RECORDS.length - 1],
]);

const HONEST_CODES: readonly SurfaceAnchorFailureCodeV1[] = Object.freeze([
  'anchor-check-failed',
  'anchor-rule-failed',
  'height-order-broken',
]);

/**
 * Pinned outcomes in both directions. Female "large" is a known honest failure of the 10 mm
 * underarm band (13.5 mm, coordinator decision 2026-11-17: keep the band, keep the failure). If it
 * starts passing, or any other end starts failing, this test must notice.
 */
const KNOWN_FAILURES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'female:canonical-size-large': Object.freeze(['underarm-l', 'underarm-r']),
});

async function shapedMesh(
  kind: 'female' | 'neutral' | 'male',
  record: (typeof CANONICAL_MEASUREMENT_SIZE_RECORDS)[number],
) {
  const { measurements } = record;
  const basis = parseMakeHumanOpenReferenceBasisV1(
    readFileSync(
      resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
    ),
    kind,
  );
  const frame = createMeasurementBodyFrameV2({
    measurements,
    sourceRevision: `surface-anchors-morph-test:${kind}:${record.id}`,
    pose: 'A',
  });
  const openReference = createMeasurementOpenReferenceUniformHeightDisplayV1({ basis, frame });
  const waistHipRuntime = await createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
    basis,
    measurements,
    openReference,
    loadBundle: async () => torsoBundle,
  });
  const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
    basis,
    measurements,
    waistHipRuntime,
    loadTorsoBundle: async () => torsoBundle,
    loadLengthPack: async () => lengthPack,
    loadPoseResources: async () => poseResources,
  });
  const mesh = result.fkProxyRuntime.displayMesh;
  const positionsM = Float32Array.from(mesh.positions);
  const built = createMeshSurfaceTopologyV1({
    positionsM,
    triangleIndices: Uint32Array.from(mesh.indices),
  });
  if (!built.ok) throw new Error(`${kind} ${record.id} topology failed: ${built.code}`);
  return { topology: built.topology, positionsM };
}

describe('measurement surface anchors v1 under the beta shape morph', () => {
  it.each(['female', 'neutral', 'male'] as const)(
    '%s anchors at both size-range ends are found inside their bands or fail honestly',
    async (kind) => {
      for (const record of RANGE_ENDS) {
        const shaped = await shapedMesh(kind, record);
        const full = checkSurfaceAnchorsV1(shaped);
        const neck = checkSurfaceAnchorSubsetV1({ ...shaped, ids: ['hps-l', 'hps-r'] });
        console.info(
          `surface-anchors morph ${kind} ${record.id}: ${JSON.stringify(
            full.ok
              ? Object.fromEntries(
                  Object.entries(full.anchors).map(([id, anchor]) => [
                    id,
                    Number(anchor.distanceMm.toFixed(1)),
                  ]),
                )
              : full.failures.map((failure) => [failure.id, failure.code, failure.distanceMm]),
          )}`,
        );

        const knownFailure = KNOWN_FAILURES[`${kind}:${record.id}`];
        expect(full.ok, `${kind} ${record.id}`).toBe(!knownFailure);
        if (knownFailure && !full.ok) {
          expect(full.code).toBe('anchor-check-failed');
          expect(full.failures.map((failure) => failure.id).sort()).toEqual([...knownFailure]);
          for (const failure of full.failures) expect(failure.distanceMm).toBeGreaterThan(10);
        }

        if (full.ok) {
          // Never ok on a broken order: re-check the order on the returned rule positions.
          const ssnY = full.anchors.ssn.rulePositionM[1];
          const c7Y = full.anchors.c7.rulePositionM[1];
          expect(ssnY).toBeLessThan(c7Y);
          for (const id of ['hps-l', 'hps-r'] as const) {
            expect(full.anchors[id].rulePositionM[1]).toBeGreaterThanOrEqual(ssnY - 0.01);
            expect(full.anchors[id].rulePositionM[1]).toBeLessThanOrEqual(c7Y + 0.01);
          }
          for (const anchor of Object.values(full.anchors)) {
            expect(anchor.distanceMm).toBeLessThanOrEqual(30);
          }
        } else {
          expect(HONEST_CODES).toContain(full.code);
          expect(full.failures.length).toBeGreaterThan(0);
        }

        // The neck subset G3 calls per shape agrees with the full check on its anchors.
        expect(neck.ok, JSON.stringify(neck.ok ? null : neck.failures)).toBe(true);
        if (!neck.ok) continue;
        expect(Object.keys(neck.anchors).sort()).toEqual(['c7', 'hps-l', 'hps-r', 'ssn']);
        if (full.ok) {
          for (const id of ['ssn', 'c7', 'hps-l', 'hps-r'] as const) {
            expect(neck.anchors[id]?.rulePositionM).toEqual(full.anchors[id].rulePositionM);
          }
        }
      }
    },
    180_000,
  );
});
