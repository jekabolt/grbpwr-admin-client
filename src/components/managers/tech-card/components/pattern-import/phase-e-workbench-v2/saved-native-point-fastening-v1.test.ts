import { describe, expect, it } from 'vitest';
import {
  bindSavedNativePointFasteningV1,
  savedNativeFasteningApertureV1,
} from './saved-native-point-fastening-v1';
import type { SavedNativePointClosureMarkV1 } from './saved-native-point-closure-mark-v1';

const sha256 = 'a'.repeat(64);
const row = {
  techCardId: 2,
  scopeKey: 'main',
  patternLineKey: 'main-line',
  revision: 2,
  cardLockVersion: 6,
  url: 'https://example.invalid/pattern.dxf',
  sizeBytes: 100,
  sha256,
};
const size = { sizeId: 58, sizeToken: 'M' };
const common = { patternLineKey: row.patternLineKey, dxfSha256: sha256, sizeId: size.sizeId };
const hole: SavedNativePointClosureMarkV1 = {
  ...common,
  pieceLineKey: 'hole-piece',
  aliasBlockName: 'HOLE',
  nativeBlockName: 'HOLE_M',
  sourceFileId: 'signed-source',
  sourceInstancePath: ['hole-instance'],
  sourceEntityOp: 1,
  nativePathId: 22,
  role: 'BUTTONHOLE_MIDPOINT',
  pointMm: [4, 13],
  markedSegmentMm: [
    [0, 13],
    [8, 13],
  ],
};
const mount: SavedNativePointClosureMarkV1 = {
  ...common,
  pieceLineKey: 'mount-piece',
  aliasBlockName: 'MOUNT',
  nativeBlockName: 'MOUNT_M',
  sourceFileId: 'signed-source',
  sourceInstancePath: ['mount-instance'],
  sourceEntityOp: 2,
  nativePathId: 23,
  role: 'BUTTON_MARK_CENTER',
  pointMm: [18, 4],
};
const binding = {
  key: 'fastening',
  buttonholeOperation: 130,
  buttonOperation: 700,
  stale: false,
  hole: { ...hole, savedRowRevision: row.revision },
  button: { ...mount, savedRowRevision: row.revision },
} as const;

describe('saved fastening geometry', () => {
  it('preserves the same signed aperture and mount in either intent', () => {
    const open = bindSavedNativePointFasteningV1(
      { ...binding, intent: 'open' },
      size,
      { row, mark: hole },
      { row, mark: mount },
    );
    const closed = bindSavedNativePointFasteningV1(
      { ...binding, intent: 'closed' },
      size,
      { row, mark: hole },
      { row, mark: mount },
    );
    expect(open.seamKey).toBe('fastening');
    expect(open.buttonholeOperationNumber).toBe(130);
    expect(open.buttonOperationNumber).toBe(700);
    expect(open.mount.mark.pointMm).toEqual([18, 4]);
    expect(open.hole.row).toEqual(row);
    expect(closed).toEqual({ ...open, intent: 'closed' });
    expect(savedNativeFasteningApertureV1(closed)).toEqual(savedNativeFasteningApertureV1(open));
  });

  it('refuses stale, mixed size, moved revision and mismatched physical marks', () => {
    const current = { ...binding, intent: 'closed' as const };
    const attached = { row, mark: hole };
    const paired = { row, mark: mount };
    const otherRevision = { ...row, revision: 3 };
    const otherMount = { ...paired, mark: { ...mount, sourceEntityOp: mount.sourceEntityOp + 1 } };

    expect(() =>
      bindSavedNativePointFasteningV1({ ...current, stale: true }, size, attached, paired),
    ).toThrow();
    expect(() =>
      bindSavedNativePointFasteningV1(current, { ...size, sizeId: 57 }, attached, paired),
    ).toThrow();
    expect(() =>
      bindSavedNativePointFasteningV1(current, size, attached, { ...paired, row: otherRevision }),
    ).toThrow();
    expect(() => bindSavedNativePointFasteningV1(current, size, attached, otherMount)).toThrow();
    expect(() => bindSavedNativePointFasteningV1(current, size, paired, attached)).toThrow();
    expect(() => bindSavedNativePointFasteningV1(current, size, attached, undefined)).toThrow();
  });
});
