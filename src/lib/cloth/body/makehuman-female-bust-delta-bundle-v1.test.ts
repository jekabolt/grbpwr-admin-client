import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import {
  MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1,
  parseMakeHumanFemaleBustDeltaBundleV1,
} from './makehuman-female-bust-delta-bundle-v1';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('MakeHuman female bust delta bundle v1', () => {
  const assetPath = resolve(process.cwd(), MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.assetPath);

  it('parses the authenticated sparse records and keeps every index within the visible basis', () => {
    const bytes = readFileSync(assetPath);
    const bundle = parseMakeHumanFemaleBustDeltaBundleV1(bytes);

    expect(bytes.byteLength).toBe(MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.assetByteLength);
    expect(sha256(bytes)).toBe(MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.assetSha256);
    expect(bundle.vertexIndices).toHaveLength(
      MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.packedRecordCount,
    );
    expect(bundle.deltasSourceUnits).toHaveLength(bundle.vertexIndices.length * 3);
    expect(Math.max(...bundle.vertexIndices)).toBe(
      MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.maximumVisibleVertexIndex,
    );
    expect(
      [...bundle.vertexIndices].every((vertex) => vertex < bundle.visibleBodyVertexCount),
    ).toBe(true);
    expect(bundle.claims).toMatchObject({
      positiveSideIsExtrapolation: true,
      circumferenceRangeCalibrated: false,
      fitClaimEligible: false,
    });
    expect(bundle.provenance.use).toBe(
      'signed; c < 0 is the MakeHuman min-cup field as authored; c > 0 reverses it (our extrapolation) and at runtime is faded to zero from the bust plane up to the armpit line and down to the under-bust station',
    );
  });

  it('rejects a record whose vertex index escapes the visible basis', () => {
    const bytes = Uint8Array.from(readFileSync(assetPath));
    new DataView(bytes.buffer).setUint32(64, 13_380, true);
    expect(() => parseMakeHumanFemaleBustDeltaBundleV1(bytes)).toThrow(/invalid record/u);
  });

  it('rebuilds byte-for-byte from the pinned source', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'grbpwr-female-bust-delta-'));
    const generatedPath = resolve(directory, 'bundle.bin');
    try {
      execFileSync(
        process.execPath,
        [
          resolve(process.cwd(), MAKEHUMAN_FEMALE_BUST_DELTA_PROVENANCE_V1.generator),
          generatedPath,
        ],
        { cwd: process.cwd(), stdio: 'pipe' },
      );
      expect(readFileSync(generatedPath)).toEqual(readFileSync(assetPath));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
