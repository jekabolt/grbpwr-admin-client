import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { parseMakeHumanCoreRigBundleV1 } from './makehuman-core-rig-pose-research-v1';
import { parseMakeHumanLimbCircumferenceDeltaBundleV1 } from './makehuman-limb-circumference-delta-bundle-v1';
import { parseMakeHumanTorsoShapeDeltaBundleV1 } from './makehuman-torso-shape-delta-bundle-v1';
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
  type MakeHumanOpenReferenceBasisKindV1,
} from './measurement-open-reference-display-v1';
import { createMeasurementOpenReferenceLimbSubsetRuntimeV1 } from './measurement-open-reference-limb-subset-runtime-v1';
import {
  resolveMeasurementOpenReferenceNeckRigHeadsV1,
  resolveMeasurementOpenReferenceNeckSectionStationV1,
} from './measurement-open-reference-neck-proxy-v1';
import { createMeasurementOpenReferenceUniformWaistHipRuntimeV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';

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

const BASE_MEASUREMENTS = CANONICAL_MEASUREMENT_SIZE_RECORDS[1].measurements;
/** Two owner-style inputs: one inside the ±10 % proxy envelope, one beyond it. */
const NECK_INPUTS_MM = Object.freeze([310, 380] as const);
const KINDS = Object.freeze(['female', 'male', 'neutral'] as const);

async function fixture(
  kind: MakeHumanOpenReferenceBasisKindV1,
  measurements: CanonicalBodyMeasurementsMm = BASE_MEASUREMENTS,
) {
  const basis = parseMakeHumanOpenReferenceBasisV1(
    readAsset(MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind].assetPath),
    kind,
  );
  const frame = createMeasurementBodyFrameV2({
    measurements,
    sourceRevision: `beta-neck-wiring-test:${kind}`,
    pose: 'A',
  });
  const openReference = createMeasurementOpenReferenceUniformHeightDisplayV1({ basis, frame });
  const waistHipRuntime = await createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
    basis,
    measurements,
    openReference,
    loadBundle: async () => torsoBundle,
  });
  const neckRigHeads = resolveMeasurementOpenReferenceNeckRigHeadsV1({
    basis,
    heightMm: measurements.heightMm,
    rig: poseResources.rig,
  });
  return { basis, measurements, waistHipRuntime, neckRigHeads };
}

function runtime(current: Awaited<ReturnType<typeof fixture>>) {
  return createMeasurementOpenReferenceBetaShapeRuntimeV1({
    basis: current.basis,
    measurements: current.measurements,
    waistHipRuntime: current.waistHipRuntime,
    loadTorsoBundle: async () => torsoBundle,
    loadLengthPack: async () => lengthPack,
    loadPoseResources: async () => poseResources,
    loadLimbBundle: async () => limbBundle,
    createLimbRuntime: (options) =>
      createMeasurementOpenReferenceLimbSubsetRuntimeV1({
        ...options,
        loadLimbBundle: async () => limbBundle,
        loadTorsoBundle: async () => torsoBundle,
      }),
  });
}

describe('measurement open-reference beta neck wiring v1', () => {
  it('runs neck last in the torso worker: bounded on female/neutral, honest notApplied on male', async () => {
    const rows: string[] = [];
    for (const kind of KINDS) {
      const current = await fixture(kind);
      const common = {
        basis: current.basis,
        sourcePositionsM: current.waistHipRuntime.displayMesh.positions,
        triangleIndices: current.waistHipRuntime.displayMesh.indices,
        measurements: current.measurements,
        torsoBundle,
      };
      const unrequested = solveMeasurementOpenReferenceBetaTorsoV1(common);
      expect(unrequested.neckStatus).toBe('unrequested');
      expect(unrequested.neckDiagnostics).toEqual([]);
      expect(unrequested.positionsBeforeNeckM).toBeUndefined();

      for (const targetMm of NECK_INPUTS_MM) {
        const result = solveMeasurementOpenReferenceBetaTorsoV1({
          ...common,
          neckCircumferenceMm: targetMm,
          neckRigHeads: current.neckRigHeads,
          neckPose: current.waistHipRuntime.openReference.pose,
        });
        // Neck never changes what the earlier torso stages report.
        expect(result.chestShoulderRepresentedMeasurements).toEqual(
          unrequested.chestShoulderRepresentedMeasurements,
        );
        expect(result.ribcageRepresentedMeasurements).toEqual(
          unrequested.ribcageRepresentedMeasurements,
        );
        rows.push(
          `| ${kind} | ${targetMm} | ${result.neckStatus} | ${result.neckBaselineCircumferenceMm?.toFixed(1) ?? '—'} | ${result.neckAchievedCircumferenceMm?.toFixed(1) ?? '—'} | ${result.neckDiagnostics.map(({ code }) => code).join(',') || '—'} |`,
        );

        if (kind === 'male') {
          expect(result.neckStatus).toBe('notApplied');
          expect(result.neckDiagnostics.map(({ code }) => code)).toContain('station-too-close');
          expect(result.positionsBeforeNeckM).toBeUndefined();
          expect(result.positionsM).toEqual(unrequested.positionsM);
          continue;
        }

        expect(['represented', 'limited']).toContain(result.neckStatus);
        expect(result.neckRepresented).toBe(result.neckStatus === 'represented');
        expect(result.neckLimited).toBe(result.neckStatus === 'limited');
        expect(result.positionsBeforeNeckM).toEqual(unrequested.positionsM);
        expect(result.positionsM).not.toEqual(unrequested.positionsM);
        const baseline = result.neckBaselineCircumferenceMm!;
        const achieved = result.neckAchievedCircumferenceMm!;
        if (result.neckStatus === 'represented') {
          expect(Math.abs(achieved - targetMm)).toBeLessThanOrEqual(0.5);
        } else {
          // Limited: the ±10 % envelope endpoint, never the requested value.
          expect(Math.abs(achieved - targetMm)).toBeGreaterThan(0.5);
          expect(achieved).toBeLessThanOrEqual(baseline * 1.1 + 0.5);
          expect(result.neckDiagnostics.map(({ code }) => code)).toContain('target-limited');
        }
      }
    }
    console.log(
      [
        '',
        '| base | input mm | neck status | girth before mm | girth after mm | diagnostics |',
        '|---|---:|---|---:|---:|---|',
        ...rows,
      ].join('\n'),
    );
  }, 120_000);

  it.each(KINDS)(
    '%s beta runtime reports neck honestly and exposes the proxy station to the guide',
    async (kind) => {
      const current = await fixture(kind, {
        ...BASE_MEASUREMENTS,
        neckCircumferenceMm: NECK_INPUTS_MM[0],
      });
      const result = await runtime(current);
      const station = resolveMeasurementOpenReferenceNeckSectionStationV1(current.neckRigHeads);

      // Same helper as the solver, so the guide ring sits on the proxy's own plane.
      expect(result.neckSectionStation).toEqual(station);
      expect(result.claims.neckRadialSectionProxyOnly).toBe(true);
      expect(result.claims.fitClaimEligible).toBe(false);
      const applied = [
        ...result.representedVisualControls,
        ...(result.limitedVisualControls ?? []),
      ];
      if (kind === 'male') {
        expect(applied).not.toContain('neckCircumferenceMm');
        expect(result.chestShoulderDiagnostics).toContain('neckCircumferenceMm:station-too-close');
        expect(result.status).toBe('partial');
      } else {
        expect(applied).toContain('neckCircumferenceMm');
        expect(result.chestShoulderDiagnostics).not.toContain(
          'neckCircumferenceMm:beta-final-quality-rollback',
        );
        expect(result.fkProxyRuntime.qualityGate?.safe).toBe(true);
      }
      expect(result.chestShoulderDiagnostics).not.toContain('beta-final-global-quality-rollback');
    },
    90_000,
  );
});
