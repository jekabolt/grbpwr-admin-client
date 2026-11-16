import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';

import { describe, expect, it } from 'vitest';

import { MAKEHUMAN_CORE_RIG_BUNDLE_METADATA_V1 } from './makehuman-core-rig-pose-research-v1';
import { MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1 } from './makehuman-female-bust-delta-bundle-v1';
import {
  MAKEHUMAN_LIMB_CIRCUMFERENCE_DELTA_PROVENANCE_V1,
  MAKEHUMAN_LIMB_CIRCUMFERENCE_MODE_METADATA_V1,
} from './makehuman-limb-circumference-delta-bundle-v1';
import {
  MAKEHUMAN_TORSO_SHAPE_DELTA_PROVENANCE_V1,
  MAKEHUMAN_TORSO_SHAPE_MODE_METADATA_V1,
} from './makehuman-torso-shape-delta-bundle-v1';
import { MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1 } from './makehuman2-pose-compatible-length-pack-v1';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1,
} from './measurement-open-reference-display-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';

const MANIFEST_PATH =
  'docs/cloth-simulation/mannequin/makehuman-third-party-asset-manifest-v1.json';

interface EvidenceReferenceV1 {
  readonly status: 'present' | 'missingEvidence';
  readonly expectedPath: string | null;
  readonly command: string | null;
  readonly reason: string;
}

interface LicenseEvidenceV1 {
  readonly identifier: string;
  readonly receiptStatus: 'present' | 'missingEvidence';
  readonly receiptId: string;
  readonly receiptPath: string | null;
  readonly reason: string;
}

interface SourceFileV1 {
  readonly path: string;
  readonly sha256: string;
}

interface LicenseReceiptV1 {
  readonly id: string;
  readonly repository: string;
  readonly commit: string;
  readonly files: readonly {
    readonly role: 'asset-scope-statement' | 'license-text';
    readonly upstreamPath: string;
    readonly upstreamUrl: string;
    readonly snapshotPath: string;
    readonly sha256: string;
  }[];
}

interface ManifestAssetV1 {
  readonly id: string;
  readonly derivedAsset: {
    readonly path: string;
    readonly byteLength: number;
    readonly sha256: string;
  };
  readonly upstream: {
    readonly repository: string;
    readonly repositoryUrl: string;
    readonly commit: string;
    readonly paths: readonly string[];
    readonly sourceFiles: readonly SourceFileV1[];
    readonly evidenceStatus: 'complete' | 'partial' | 'missingEvidence';
    readonly reason: string;
  };
  readonly generator: EvidenceReferenceV1;
  readonly license: LicenseEvidenceV1;
  readonly claimBoundary: {
    readonly runtimeAdmission: 'production-display' | 'bounded-visual-proxy' | 'research-only';
    readonly visualOnly: boolean;
    readonly canonicalMeasurementSemanticMatchClaimed: boolean;
    readonly anatomicalCalibrationClaimed: boolean;
    readonly tapeMeasurementEquivalent: boolean;
    readonly populationRepresentativenessClaimed: boolean;
    readonly garmentFitEligible: boolean;
  };
}

interface ManifestV1 {
  readonly schemaVersion: 'makehuman-third-party-asset-manifest/v1';
  readonly policy: {
    readonly licenseIdentifierIsNotReceipt: boolean;
    readonly missingEvidenceBlocksReproducibilityClaim: boolean;
    readonly missingEvidenceBlocksRedistributionAuditClosure: boolean;
    readonly packageLicenseIsNotThirdPartyEvidence: boolean;
  };
  readonly licenseReceipts: readonly LicenseReceiptV1[];
  readonly assets: readonly ManifestAssetV1[];
}

function readManifest(): ManifestV1 {
  return JSON.parse(readFileSync(resolve(cwd(), MANIFEST_PATH), 'utf8')) as ManifestV1;
}

function sha256(path: string): string {
  return createHash('sha256')
    .update(readFileSync(resolve(cwd(), path)))
    .digest('hex');
}

function committedMakeHumanAssetPaths(directory = 'src/assets/cloth'): readonly string[] {
  return readdirSync(resolve(cwd(), directory), { withFileTypes: true }).flatMap((entry) => {
    const entryPath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return committedMakeHumanAssetPaths(entryPath);
    return /^makehuman.*\.bin$/u.test(entry.name) ? [entryPath] : [];
  });
}

const expectedMetadata = new Map<string, Readonly<{ byteLength: number; sha256: string }>>([
  ...Object.values(MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1).map(
    (basis) =>
      [
        basis.assetPath,
        Object.freeze({ byteLength: 321_160, sha256: basis.derivedBasisSha256 }),
      ] as const,
  ),
  [
    MAKEHUMAN_TORSO_SHAPE_DELTA_PROVENANCE_V1.assetPath,
    Object.freeze({
      byteLength: MAKEHUMAN_TORSO_SHAPE_DELTA_PROVENANCE_V1.assetByteLength,
      sha256: MAKEHUMAN_TORSO_SHAPE_DELTA_PROVENANCE_V1.assetSha256,
    }),
  ],
  [
    MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.assetPath,
    Object.freeze({
      byteLength: MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.assetByteLength,
      sha256: MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.assetSha256,
    }),
  ],
  [
    MAKEHUMAN_LIMB_CIRCUMFERENCE_DELTA_PROVENANCE_V1.assetPath,
    Object.freeze({
      byteLength: MAKEHUMAN_LIMB_CIRCUMFERENCE_DELTA_PROVENANCE_V1.assetByteLength,
      sha256: MAKEHUMAN_LIMB_CIRCUMFERENCE_DELTA_PROVENANCE_V1.assetSha256,
    }),
  ],
  [
    MAKEHUMAN_CORE_RIG_BUNDLE_METADATA_V1.assetPath,
    Object.freeze({
      byteLength: MAKEHUMAN_CORE_RIG_BUNDLE_METADATA_V1.byteLength,
      sha256: MAKEHUMAN_CORE_RIG_BUNDLE_METADATA_V1.sha256,
    }),
  ],
  [
    MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1.rigAssetPath,
    Object.freeze({
      byteLength: MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1.rigByteLength,
      sha256: MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1.rigSha256,
    }),
  ],
  [
    MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1.anchorAssetPath,
    Object.freeze({
      byteLength: MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1.anchorByteLength,
      sha256: MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1.anchorSha256,
    }),
  ],
  [
    MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.assetPath,
    Object.freeze({
      byteLength: MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.byteLength,
      sha256: MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.sha256,
    }),
  ],
]);

describe('MakeHuman third-party asset manifest v1', () => {
  it('covers every committed MakeHuman binary and binds it to the exact bytes and code metadata', () => {
    const manifest = readManifest();
    const assetPaths = manifest.assets.map(({ derivedAsset }) => derivedAsset.path);
    const committedPaths = [...committedMakeHumanAssetPaths()].sort();

    expect(manifest.schemaVersion).toBe('makehuman-third-party-asset-manifest/v1');
    expect(new Set(manifest.assets.map(({ id }) => id)).size).toBe(manifest.assets.length);
    expect([...assetPaths].sort()).toEqual(committedPaths);
    expect([...expectedMetadata.keys()].sort()).toEqual(committedPaths);

    for (const asset of manifest.assets) {
      const metadata = expectedMetadata.get(asset.derivedAsset.path);
      expect(metadata, asset.derivedAsset.path).toBeDefined();
      expect(existsSync(resolve(cwd(), asset.derivedAsset.path))).toBe(true);
      expect(statSync(resolve(cwd(), asset.derivedAsset.path)).size).toBe(
        asset.derivedAsset.byteLength,
      );
      expect(sha256(asset.derivedAsset.path)).toBe(asset.derivedAsset.sha256);
      expect(asset.derivedAsset).toMatchObject(metadata!);
    }
  });

  it('binds source paths and stored license receipts while keeping generator gaps explicit', () => {
    const manifest = readManifest();
    const byId = new Map(manifest.assets.map((asset) => [asset.id, asset]));
    const receiptById = new Map(manifest.licenseReceipts.map((receipt) => [receipt.id, receipt]));

    expect(manifest.policy).toEqual({
      licenseIdentifierIsNotReceipt: true,
      missingEvidenceBlocksReproducibilityClaim: true,
      missingEvidenceBlocksRedistributionAuditClosure: true,
      packageLicenseIsNotThirdPartyEvidence: true,
    });

    expect(receiptById.size).toBe(manifest.licenseReceipts.length);
    for (const receipt of manifest.licenseReceipts) {
      expect(receipt.repository).toMatch(/^makehumancommunity\/makehuman2?$/u);
      expect(receipt.commit).toMatch(/^[0-9a-f]{40}$/u);
      expect(receipt.files.length).toBeGreaterThan(0);
      expect(receipt.files.some(({ role }) => role === 'asset-scope-statement')).toBe(true);

      for (const file of receipt.files) {
        expect(file.upstreamPath.length).toBeGreaterThan(0);
        expect(file.upstreamUrl).toBe(
          `https://raw.githubusercontent.com/${receipt.repository}/${receipt.commit}/${file.upstreamPath}`,
        );
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/u);
        expect(existsSync(resolve(cwd(), file.snapshotPath))).toBe(true);
        expect(sha256(file.snapshotPath)).toBe(file.sha256);
      }
    }

    for (const asset of manifest.assets) {
      expect(asset.upstream.repository).toMatch(/^makehumancommunity\/makehuman2?$/u);
      expect(asset.upstream.repositoryUrl).toBe(
        `https://github.com/${asset.upstream.repository}.git`,
      );
      expect(asset.upstream.commit).toMatch(/^[0-9a-f]{40}$/u);
      expect(asset.upstream.paths.length).toBeGreaterThan(0);
      expect(asset.upstream.paths).toEqual(asset.upstream.sourceFiles.map(({ path }) => path));
      expect(new Set(asset.upstream.paths).size).toBe(asset.upstream.paths.length);
      expect(asset.upstream.reason.length).toBeGreaterThan(0);
      for (const source of asset.upstream.sourceFiles) {
        expect(source.path.length).toBeGreaterThan(0);
        expect(source.sha256).toMatch(/^[0-9a-f]{64}$/u);
      }

      expect(asset.license.identifier).toBe('CC0-1.0');
      expect(asset.license.reason.length).toBeGreaterThan(0);
      expect(asset.license.receiptStatus).toBe('present');
      expect(asset.license.receiptPath).not.toBeNull();
      const receipt = receiptById.get(asset.license.receiptId);
      expect(receipt, asset.license.receiptId).toBeDefined();
      expect(receipt?.repository).toBe(asset.upstream.repository);
      expect(receipt?.commit).toBe(asset.upstream.commit);
      expect(receipt?.files.map(({ snapshotPath }) => snapshotPath)).toContain(
        asset.license.receiptPath,
      );

      expect(asset.generator.reason.length).toBeGreaterThan(0);
      if (asset.generator.status === 'present') {
        expect(asset.generator.expectedPath).not.toBeNull();
        expect(asset.generator.command).not.toBeNull();
        expect(existsSync(resolve(cwd(), asset.generator.expectedPath!))).toBe(true);
      } else {
        expect(asset.generator.command).toBeNull();
        if (asset.generator.expectedPath) {
          expect(existsSync(resolve(cwd(), asset.generator.expectedPath))).toBe(false);
        }
      }
    }

    expect(manifest.assets.every(({ license }) => license.receiptStatus === 'present')).toBe(true);
    expect(
      manifest.assets
        .filter(({ id }) => id !== 'makehuman-female-bust-deltas-v1')
        .every(({ generator }) => generator.status === 'missingEvidence'),
    ).toBe(true);
    expect(byId.get('makehuman-female-bust-deltas-v1')?.generator.status).toBe('present');

    for (const basisId of [
      'makehuman-visible-base-v1',
      'makehuman-visible-neutral-v1',
      'makehuman-visible-male-v1',
      'makehuman-visible-female-v1',
    ]) {
      const basis = byId.get(basisId);
      expect(
        basis?.upstream.sourceFiles.find(
          ({ path }) => path === MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1.sourceAssetPath,
        )?.sha256,
      ).toBe(MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1.sourceAssetSha256);
      expect(byId.get(basisId)?.generator.expectedPath).toBe(
        MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1.generator,
      );
    }

    const maleSourceHashes = new Set(
      byId.get('makehuman-visible-male-v1')?.upstream.sourceFiles.map(({ sha256 }) => sha256),
    );
    const femaleSourceHashes = new Set(
      byId.get('makehuman-visible-female-v1')?.upstream.sourceFiles.map(({ sha256 }) => sha256),
    );
    expect(
      MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1.sourceTargets.male.every((hash) =>
        maleSourceHashes.has(hash),
      ),
    ).toBe(true);
    expect(
      MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1.sourceTargets.female.every((hash) =>
        femaleSourceHashes.has(hash),
      ),
    ).toBe(true);

    expect(byId.get('makehuman-torso-shape-deltas-v1')?.upstream.paths).toEqual(
      MAKEHUMAN_TORSO_SHAPE_MODE_METADATA_V1.map(({ sourcePath }) => sourcePath),
    );
    expect(byId.get('makehuman-torso-shape-deltas-v1')?.upstream.sourceFiles).toEqual(
      MAKEHUMAN_TORSO_SHAPE_MODE_METADATA_V1.map(({ sourcePath, sourceSha256 }) => ({
        path: sourcePath,
        sha256: sourceSha256,
      })),
    );
    expect(byId.get('makehuman-torso-shape-deltas-v1')?.generator.expectedPath).toBe(
      MAKEHUMAN_TORSO_SHAPE_DELTA_PROVENANCE_V1.generator,
    );
    expect(byId.get('makehuman-female-bust-deltas-v1')?.upstream.paths).toEqual([
      MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.sourcePath,
    ]);
    expect(byId.get('makehuman-female-bust-deltas-v1')?.upstream.sourceFiles).toEqual([
      {
        path: MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.sourcePath,
        sha256: MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.sourceSha256,
      },
    ]);
    expect(byId.get('makehuman-female-bust-deltas-v1')?.generator.expectedPath).toBe(
      MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.generator,
    );
    expect(byId.get('makehuman-limb-circumference-deltas-v1')?.upstream.paths).toEqual(
      MAKEHUMAN_LIMB_CIRCUMFERENCE_MODE_METADATA_V1.map(({ sourcePath }) => sourcePath),
    );
    expect(byId.get('makehuman-limb-circumference-deltas-v1')?.upstream.sourceFiles).toEqual(
      MAKEHUMAN_LIMB_CIRCUMFERENCE_MODE_METADATA_V1.map(({ sourcePath, sourceSha256 }) => ({
        path: sourcePath,
        sha256: sourceSha256,
      })),
    );
    expect(byId.get('makehuman-limb-circumference-deltas-v1')?.generator.expectedPath).toBe(
      MAKEHUMAN_LIMB_CIRCUMFERENCE_DELTA_PROVENANCE_V1.generator,
    );
    expect(byId.get('makehuman2-pose-compatible-length-v1')?.upstream.evidenceStatus).toBe(
      'complete',
    );
    expect(byId.get('makehuman2-pose-compatible-length-v1')?.upstream.sourceFiles).toHaveLength(10);
    expect(byId.get('makehuman2-pose-compatible-length-v1')?.generator.expectedPath).toBe(
      MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.generator,
    );
  });

  it('preserves the visual-proxy claim boundary for every asset', () => {
    const manifest = readManifest();

    for (const { claimBoundary } of manifest.assets) {
      expect(claimBoundary.visualOnly).toBe(true);
      expect(claimBoundary.canonicalMeasurementSemanticMatchClaimed).toBe(false);
      expect(claimBoundary.anatomicalCalibrationClaimed).toBe(false);
      expect(claimBoundary.tapeMeasurementEquivalent).toBe(false);
      expect(claimBoundary.populationRepresentativenessClaimed).toBe(false);
      expect(claimBoundary.garmentFitEligible).toBe(false);
    }

    const manifestRepositories = new Set(
      manifest.assets.map(({ upstream }) => `${upstream.repository}@${upstream.commit}`),
    );
    expect(manifestRepositories).toEqual(
      new Set([
        `${MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1.repository}@${MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1.commit}`,
        `${MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.upstreamRepository}@${MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.upstreamCommit}`,
      ]),
    );
  });
});
