import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { describe, expect, it, vi } from 'vitest';

import {
  createMakeHuman2PoseCompatibleLengthPackLoaderV1,
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_MODE_IDS_V1,
  MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1,
  parseMakeHuman2PoseCompatibleLengthPackV1,
} from './makehuman2-pose-compatible-length-pack-v1';

const ASSET = resolve(process.cwd(), MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.assetPath);

function bytes(): Uint8Array {
  return readFileSync(ASSET);
}

function digest(value: Uint8Array): Promise<string> {
  return Promise.resolve(createHash('sha256').update(value).digest('hex'));
}

function response(value: Uint8Array): Response {
  const body = new ArrayBuffer(value.byteLength);
  new Uint8Array(body).set(value);
  return new Response(body);
}

describe('MakeHuman2 pose-compatible length pack v1', () => {
  it('pins and parses the exact deterministic CC0 source pack', () => {
    const input = bytes();
    expect(input).toHaveLength(MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.byteLength);
    expect(createHash('sha256').update(input).digest('hex')).toBe(
      MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_PACK_METADATA_V1.sha256,
    );
    const pack = parseMakeHuman2PoseCompatibleLengthPackV1(input);
    expect(pack.modes.map(({ id }) => id)).toEqual(MAKEHUMAN2_POSE_COMPATIBLE_LENGTH_MODE_IDS_V1);
    expect(pack.modes.map(({ vertexIndices }) => vertexIndices.length)).toEqual([
      4_938, 4_944, 4_220, 4_086, 5_478, 5_329, 4_010, 3_915,
    ]);
    expect(pack.joints).toHaveLength(28);
    expect(pack.helperVertexIndices).toHaveLength(3_119);
    expect(pack.joints.every(({ vertexIndices }) => vertexIndices.length > 0)).toBe(true);
    expect(pack.provenance).toMatchObject({
      upstreamCommit: '13b7ff56b388826bee548bc18d78c8d492cf3512',
      assetLicense: 'CC0-1.0',
      canonicalSleeveOrInseamAdmitted: false,
    });
  });

  it('fails closed for corrupted headers, sparse records, joints and helper bases', () => {
    const truncated = bytes().subarray(0, 40);
    expect(() => parseMakeHuman2PoseCompatibleLengthPackV1(truncated)).toThrow(/truncated/);

    const badMagic = Uint8Array.from(bytes());
    badMagic[0] = 0;
    expect(() => parseMakeHuman2PoseCompatibleLengthPackV1(badMagic)).toThrow(/magic/);

    const badDelta = Uint8Array.from(bytes());
    const badDeltaView = new DataView(badDelta.buffer);
    badDeltaView.setFloat32(badDeltaView.getUint32(48, true) + 4, Number.NaN, true);
    expect(() => parseMakeHuman2PoseCompatibleLengthPackV1(badDelta)).toThrow(/invalid record/);

    const badJoint = Uint8Array.from(bytes());
    const badJointView = new DataView(badJoint.buffer);
    const jointReferenceTableOffset = badJointView.getUint32(56, true);
    badJointView.setUint32(jointReferenceTableOffset, 19_158, true);
    expect(() => parseMakeHuman2PoseCompatibleLengthPackV1(badJoint)).toThrow(/joint.*reference/);

    const badHelper = Uint8Array.from(bytes());
    const badHelperView = new DataView(badHelper.buffer);
    badHelperView.setFloat32(badHelperView.getUint32(60, true) + 4, Number.NaN, true);
    expect(() => parseMakeHuman2PoseCompatibleLengthPackV1(badHelper)).toThrow(/helper base/);
  });

  it('authenticates before parsing, owns returned arrays and retries after failure', async () => {
    const input = bytes();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(input.subarray(0, input.length - 1)))
      .mockResolvedValue(response(input));
    const loader = createMakeHuman2PoseCompatibleLengthPackLoaderV1({ fetchImpl, digest });
    await expect(loader()).rejects.toThrow(/byte length authentication/);
    const first = await loader();
    first.modes[0].deltasSourceUnits[0] = 123;
    const second = await loader();
    expect(second.modes[0].deltasSourceUnits[0]).not.toBe(123);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const digestFailure = createMakeHuman2PoseCompatibleLengthPackLoaderV1({
      fetchImpl: vi.fn().mockResolvedValue(response(input)),
      digest: () => Promise.resolve('0'.repeat(64)),
    });
    await expect(digestFailure()).rejects.toThrow(/SHA-256 authentication/);
  });
});
