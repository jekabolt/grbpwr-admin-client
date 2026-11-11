import type { common_TechCard } from 'api/proto-http/admin';
import type { FoundPiece } from 'components/managers/tech-card/components/nesting/dxf-geometry';
import { segmentPiece } from 'lib/assembly-skeleton/geometry/segment';
import { anchorOfRunId, fromWire, type StoredSeam, type TechCardSeamWire } from 'lib/seams';
import { describe, expect, it } from 'vitest';

import {
  lengthsBySizeId,
  seamLengthsOf,
  seamLengthsReader,
  seamSideOf,
  sideAnchorLengthsOf,
  type FindPiece,
} from './seam-side-length';
import { stripKeysOf } from './strip-pieces';
import {
  foundRectangle,
  fromSeamStrip,
  SEAM,
  STRIP,
  STRIP_SIZE_NAMES,
  WAISTBAND,
  waistbandCard,
} from './strip.fixture';

const STRIP_KEYS = stripKeysOf([fromSeamStrip()]);
const SIZES = [1, 2, 3, 4];
const BAND_CM: Record<string, number> = { S: 75, M: 79, L: 83, XL: 87 };

const gradedBand =
  (key: string, cm: Record<string, number> = BAND_CM): FindPiece =>
  (pieceKey, atSize) => {
    if (pieceKey !== key) return null;
    const size = atSize ?? 'M';
    const w = cm[size];
    if (!w) return null;
    return {
      ...foundRectangle(w, 8, 'waistband'),
      size,
      sizes: Object.keys(cm),
    };
  };

const rowOfCard = (card: common_TechCard): StoredSeam => {
  const wire = (card as { seams?: TechCardSeamWire[] }).seams?.[0];
  const row = wire && fromWire(wire);
  if (!row) throw new Error('the fixture stores its seam');
  return row;
};

const storedRow = () => rowOfCard(waistbandCard(fromSeamStrip()).techCard);

const geom = (key: string, found: FoundPiece) =>
  segmentPiece({
    pieceKey: key,
    name: key,
    piece: found.piece,
    piecesPerGarment: 1,
    cutSymmetry: null,
    cloth: null,
    fused: false,
  });

const longEdge = (g: ReturnType<typeof geom>) =>
  [...g.edges].sort((a, b) => b.lenMm - a.lenMm)[0].id;

describe('seam length per size', () => {
  it('reads the cloth side on every size, the strip`s fixed rectangle in no way shortening it', () => {
    const lengths = seamLengthsOf(storedRow(), STRIP_KEYS, gradedBand(WAISTBAND));
    expect(Object.fromEntries(lengths)).toEqual({ S: 750, M: 790, L: 830, XL: 870 });
  });

  it('does not care what the strip has become since the seam was placed', () => {
    const row = storedRow();
    expect(row.sideB.some((anchor) => anchor.piece === STRIP)).toBe(true);
    const shorter = seamLengthsOf(
      { ...row, sideB: row.sideB.map((anchor) => ({ ...anchor, lenMm: 300 })) },
      STRIP_KEYS,
      gradedBand(WAISTBAND),
    );
    expect(shorter.get('XL')).toBe(870);
  });

  it('a seam of two real pieces reads its first side, across two parts when it has them', () => {
    const left = geom('left', foundRectangle(40, 8, 'left'));
    const right = geom('right', foundRectangle(39, 8, 'right'));
    const a = [left, right].map((g) => anchorOfRunId([g], longEdge(g))!);
    const row = {
      ...storedRow(),
      anchoredSize: 'M',
      sideA: a,
      sideB: [anchorOfRunId([left], longEdge(left))!],
    } as StoredSeam;
    const find: FindPiece = (key, atSize) => {
      const size = atSize ?? 'M';
      const w = { left: { M: 40, L: 42 }, right: { M: 39, L: 41 } }[key]?.[size as 'M' | 'L'];
      return w ? { ...foundRectangle(w, 8, key), size, sizes: ['M', 'L'] } : null;
    };
    const lengths = seamLengthsOf(row, new Set(), find);
    expect(lengths.get('M')).toBe(790);
    expect(lengths.get('L')).toBe(830);
  });

  it('a pattern drawn in one size gives every size of the card that one length', () => {
    const find: FindPiece = () => ({
      ...foundRectangle(79, 8, 'waistband'),
      size: '',
      sizes: [''],
    });
    const byToken = seamLengthsOf(storedRow(), STRIP_KEYS, find);
    expect(Object.fromEntries(byToken)).toEqual({ '': 790 });
    expect([...lengthsBySizeId(byToken, SIZES, STRIP_SIZE_NAMES).values()]).toEqual([
      790, 790, 790, 790,
    ]);
  });

  it('a size the piece is not drawn in is absent, never zero', () => {
    const lengths = seamLengthsOf(storedRow(), STRIP_KEYS, gradedBand(WAISTBAND, { M: 79, L: 83 }));
    expect(Object.fromEntries(lengths)).toEqual({ M: 790, L: 830 });
  });

  it('measures one persisted side and keeps its partial range across sizes', () => {
    const row = storedRow();
    const side = row.sideA.map((anchor) => ({
      ...anchor,
      range: [0.25, 0.75] as [number, number],
    }));
    const lengths = sideAnchorLengthsOf(
      { anchoredSize: row.anchoredSize, kind: 'partial' },
      side,
      gradedBand(WAISTBAND),
    );
    expect(Object.fromEntries(lengths)).toEqual({ S: 375, M: 395, L: 415, XL: 435 });
  });

  it('a surface seam, or a seam of strips alone, has no length', () => {
    const row = storedRow();
    expect(seamSideOf({ ...row, kind: 'surface' }, STRIP_KEYS)).toBeNull();
    expect(seamSideOf({ ...row, sideA: row.sideB }, STRIP_KEYS)).toBeNull();
    expect(seamSideOf(row, STRIP_KEYS)).toEqual(row.sideA);
    expect(seamSideOf({ ...row, sideA: row.sideB, sideB: row.sideA }, STRIP_KEYS)).toEqual(
      row.sideA,
    );
  });
});

describe('the reader the panel takes', () => {
  const reader = (find = gradedBand(WAISTBAND)) =>
    seamLengthsReader({
      rows: [storedRow()],
      stripKeys: STRIP_KEYS,
      find,
      sizeIds: SIZES,
      sizeNames: STRIP_SIZE_NAMES,
    });

  it('measures nothing on a stale or rejected seam, so the stored length stands', () => {
    for (const row of [
      { ...storedRow(), stale: true },
      { ...storedRow(), status: 'rejected' as const },
    ]) {
      const read = seamLengthsReader({
        rows: [row],
        stripKeys: STRIP_KEYS,
        find: gradedBand(WAISTBAND),
        sizeIds: SIZES,
        sizeNames: STRIP_SIZE_NAMES,
      });
      expect(read(SEAM)).toBeUndefined();
    }
  });

  it('names the sizes by the card`s ids, and hands back the same Map', () => {
    const read = reader();
    const lengths = read(SEAM)!;
    expect(Object.fromEntries(lengths)).toEqual({ 1: 750, 2: 790, 3: 830, 4: 870 });
    expect(read(SEAM)).toBe(lengths);
  });

  it('knows nothing rather than nothing long: an unknown seam or a piece with no pattern', () => {
    expect(reader()('another seam')).toBeUndefined();
    expect(reader(() => null)(SEAM)).toBeUndefined();
  });
});
