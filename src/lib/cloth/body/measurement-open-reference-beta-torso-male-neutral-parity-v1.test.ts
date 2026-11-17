import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { parseMakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
import { createMakeHumanUniformWaistHipModesV1 } from './makehuman-uniform-waist-hip-modes-v1';
import { parseMakeHumanWaistHipRigAnchorDeltaBundleV1 } from './makehuman-waist-hip-rig-anchor-research-v1';
import {
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1,
  parseMakeHuman2PoseCompatibleLengthPackV1,
} from './makehuman2-pose-compatible-length-pack-v1';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import { createMeasurementBodyFrameV2 } from './measurement-body-frame-v2';
import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from './measurement-body-synthetic-corpus';
import { createMeasurementOpenReferenceBetaShapeRuntimeV1 } from './measurement-open-reference-beta-shape-runtime-v1';
import { solveMeasurementOpenReferenceBetaTorsoV1 } from './measurement-open-reference-beta-torso-worker-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  parseMakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import { createMeasurementOpenReferenceUniformWaistHipRuntimeV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';

/**
 * The female bust wiring must leave male and neutral byte for byte as before. The expected hashes
 * were produced by this exact file run against the pre-bust tree (86a3b0659); a change here means
 * the male/neutral path moved, which the bust lane must never do.
 *
 * Re-baselined once by the ANSUR fix lane, on purpose: the male/neutral chest now solves at the
 * chest-point plane the guide draws (station Y moved, new `chest-station:chest-point-template`
 * diagnostic), and the worker result carries the solved `shoulderChordVertices` for the guide.
 * Female is untouched by that lane; any other drift here is still a regression.
 */
const EXPECTED_WORKER_SHA256 = {
  male: 'ce63667f697af486a35b359901308dd4c57d8a8160017d01834b34accf813051',
  neutral: '225eab424de16bb34e14e34a16d0b68534de5a89f28664eff7fad27da60b5109',
} as const;
const EXPECTED_RUNTIME_SHA256 = {
  male: 'a55a5aa2bf71cef88941f38c98bfd428f4972fad6d563c1657acb67a96bfaa73',
  neutral: 'c1da43ca2afa83be308e5f9446646bb4d0f274b83e294f1f9f65db6bfaa5dc28',
} as const;

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

const MEASUREMENTS: CanonicalBodyMeasurementsMm = Object.freeze({
  ...CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements,
  chestCircumferenceMm: 835,
  underBustCircumferenceMm: 720,
  chestDepthMm: 205,
  waistDepthMm: 195,
  hipDepthMm: 225,
});

/** Stable digest of any result: typed arrays by their bytes, everything else by JSON value. */
function digest(value: unknown): string {
  const json = JSON.stringify(value, (_key, entry: unknown) => {
    if (ArrayBuffer.isView(entry)) {
      return `sha256:${createHash('sha256')
        .update(new Uint8Array(entry.buffer, entry.byteOffset, entry.byteLength))
        .digest('hex')}`;
    }
    return entry;
  });
  return createHash('sha256').update(json).digest('hex');
}

function basisOf(kind: 'male' | 'neutral') {
  return parseMakeHumanOpenReferenceBasisV1(
    readFileSync(
      resolve(process.cwd(), MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
    ),
    kind,
  );
}

describe('beta torso: male and neutral unchanged by the female bust wiring', () => {
  it.each(['male', 'neutral'] as const)(
    '%s worker output is byte-identical to the pre-bust tree',
    (kind) => {
      const basis = basisOf(kind);
      const sourcePositionsM = createMakeHumanUniformWaistHipModesV1({
        basis,
        heightMm: MEASUREMENTS.heightMm,
        bundle: torsoBundle,
      }).uniformPositionsM;
      const result = solveMeasurementOpenReferenceBetaTorsoV1({
        basis,
        sourcePositionsM,
        triangleIndices: basis.indices,
        measurements: MEASUREMENTS,
        highHipCircumferenceMm: 900,
        torsoBundle,
      });
      // The fixed input really exercises chest, shoulder, depth and high hip on this base.
      expect(result.chestShoulderRepresentedMeasurements.length).toBeGreaterThan(0);
      expect(result.depthRepresentedMeasurements.length).toBeGreaterThan(0);
      expect(result).not.toHaveProperty('femaleBust');
      // Neck is unrequested here: its fields are the inert defaults and the rest is pinned.
      const {
        neckStatus,
        neckRepresented,
        neckLimited,
        neckDiagnostics,
        ...preNeckResult
      } = result;
      expect({ neckStatus, neckRepresented, neckLimited, neckDiagnostics }).toEqual({
        neckStatus: 'unrequested',
        neckRepresented: false,
        neckLimited: false,
        neckDiagnostics: [],
      });
      expect(result).not.toHaveProperty('positionsBeforeNeckM');
      expect(digest(preNeckResult)).toBe(EXPECTED_WORKER_SHA256[kind]);
    },
    120_000,
  );

  it.each(['male', 'neutral'] as const)(
    '%s whole beta runtime is byte-identical to the pre-bust tree',
    async (kind) => {
      const basis = basisOf(kind);
      const frame = createMeasurementBodyFrameV2({
        measurements: MEASUREMENTS,
        sourceRevision: `bust-parity:${kind}`,
        pose: 'A',
      });
      const openReference = createMeasurementOpenReferenceUniformHeightDisplayV1({ basis, frame });
      const waistHipRuntime = await createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
        basis,
        measurements: MEASUREMENTS,
        openReference,
        loadBundle: async () => torsoBundle,
      });
      const result = await createMeasurementOpenReferenceBetaShapeRuntimeV1({
        basis,
        measurements: MEASUREMENTS,
        waistHipRuntime,
        loadTorsoBundle: async () => torsoBundle,
        loadLengthPack: async () => lengthPack,
        loadPoseResources: async () => poseResources,
      });
      expect(result.status).not.toBe('error');
      // At 835 mm the male and neutral chest is a bounded endpoint today; it must stay that way.
      expect([
        ...result.representedVisualControls,
        ...(result.limitedVisualControls ?? []),
      ]).toContain('chestCircumferenceMm');
      // The neck claim is a new constant; the pinned digest covers every pre-neck field.
      const { neckRadialSectionProxyOnly, ...rest } = result.claims;
      expect(neckRadialSectionProxyOnly).toBe(true);
      // The under-bust claim was lowered to false (no proof of independence); only the claim
      // changed, so the digest pins the pre-bust value and the geometry stays byte-identical.
      expect(rest.underBustIndependentRibcageBand).toBe(false);
      const preNeckClaims = { ...rest, underBustIndependentRibcageBand: true as const };
      expect(
        digest({
          positions: result.fkProxyRuntime.displayMesh.positions,
          status: result.status,
          representedVisualControls: result.representedVisualControls,
          limitedVisualControls: result.limitedVisualControls,
          chestShoulderDiagnostics: result.chestShoulderDiagnostics,
          torsoSectionStations: result.torsoSectionStations,
          sourceRevisionSuffix: result.sourceRevisionSuffix,
          claims: preNeckClaims,
        }),
      ).toBe(EXPECTED_RUNTIME_SHA256[kind]);
    },
    180_000,
  );
});
