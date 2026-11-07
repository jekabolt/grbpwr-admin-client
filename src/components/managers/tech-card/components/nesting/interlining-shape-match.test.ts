import { describe, expect, it } from 'vitest';
import { zoneRingMm } from 'lib/fusing-dxf/geometry';
import type { PieceDTO, Pt } from 'lib/nesting/types';
import {
  centredInterliningShape,
  interliningShapeFits,
  interliningShapeToZone,
  matchInterliningShapes,
} from './interlining-shape-match';

const area = (poly: readonly Pt[]) =>
  Math.abs(
    poly.reduce((sum, point, index) => {
      const next = poly[(index + 1) % poly.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2,
  );

const piece = (id: number, name: string, poly: Pt[]): PieceDTO => {
  const minX = Math.min(...poly.map((point) => point.x));
  const minY = Math.min(...poly.map((point) => point.y));
  const local = poly.map((point) => ({ x: point.x - minX, y: point.y - minY }));
  return {
    id,
    name,
    blockName: name,
    source: 'test.dxf',
    fileIndex: 0,
    poly: local,
    bboxW: Math.max(...local.map((point) => point.x)),
    bboxH: Math.max(...local.map((point) => point.y)),
    areaCm2: area(local),
  };
};

const rect = (w: number, h: number): Pt[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];

describe('interlining shape matching', () => {
  it('pairs a full-size copy (no notches, float jitter) and a named strip that fits its piece', () => {
    // The real card-110 file: a generated sheet is the piece contour itself, 0.002 cm² off, and it
    // carries no notches; the placket interlining is a narrow strip drawn for the front panel.
    const collar = piece(1, 'CLR', [
      { x: 0, y: 0 },
      { x: 45, y: 0 },
      { x: 43, y: 15 },
      { x: 2, y: 15 },
    ]);
    const front = piece(2, 'FL', rect(35, 69));
    const shapes = [
      piece(
        10,
        'CLR',
        collar.poly.map((q) => ({ x: q.x * 1.00002, y: q.y })),
      ),
      piece(11, 'FL', rect(7.9, 63)),
    ];
    const matches = matchInterliningShapes({
      shapes,
      mainBlocks: [collar, front],
      mainAliases: [],
      pieces: [
        { lineKey: 'CLR', name: 'CLR' },
        { lineKey: 'FL', name: 'FL' },
      ],
      sizeTokens: [],
    });
    const by = Object.fromEntries(
      matches.map((m) => [m.identity, m.pairs.map((p) => p.pieceName)]),
    );
    expect(by).toEqual({ CLR: ['CLR'], FL: ['FL'] });
  });

  it('matches by shape, fans one cuff shape to mirrored pieces, and leaves an odd shape open', () => {
    const collar = piece(1, 'CLR', [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 8, y: 4 },
      { x: 2, y: 4 },
    ]);
    const cuffLeft = piece(2, 'SLV_M_L', rect(8, 3));
    const cuffRight = piece(3, 'SLV_M_R', rect(8, 3));
    const shapes = [
      piece(
        10,
        'V1',
        collar.poly.map((point) => ({ x: point.x * 0.9, y: point.y * 0.9 })),
      ),
      piece(11, 'CUFF', rect(7.2, 2.7)),
      piece(12, 'ODD', [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 3, y: 7 },
      ]),
    ];
    const matches = matchInterliningShapes({
      shapes,
      mainBlocks: [collar, cuffLeft, cuffRight],
      mainAliases: [
        { blockName: 'CLR', pieceLineKey: 'piece-clr' },
        { blockName: 'SLV_M_R', pieceLineKey: 'piece-cuff-r' },
        { blockName: 'SLV_M_L', pieceLineKey: 'piece-cuff-l' },
      ],
      pieces: [
        { lineKey: 'piece-clr', name: 'collar' },
        { lineKey: 'piece-cuff-r', name: 'CUFF R' },
        { lineKey: 'piece-cuff-l', name: 'CUFF L' },
      ],
      sizeTokens: [],
    });

    expect(matches.find((match) => match.identity === 'V1')).toMatchObject({
      by: 'shape',
      pairs: [{ pieceLineKey: 'piece-clr' }],
    });
    expect(
      matches
        .find((match) => match.identity === 'CUFF')
        ?.pairs.map((pair) => pair.pieceLineKey)
        .sort(),
    ).toEqual(['piece-cuff-l', 'piece-cuff-r']);
    expect(matches.find((match) => match.identity === 'CUFF')?.by).toBe('name + shape');
    expect(matches.find((match) => match.identity === 'ODD')).toMatchObject({
      by: 'no pair',
      pairs: [],
    });
  });

  it('converts a centred imported outline to a valid spline zone with at most 64 points', () => {
    const target = piece(20, 'BODY', rect(20, 12));
    const circle = Array.from({ length: 96 }, (_, index) => {
      const angle = (index / 96) * Math.PI * 2;
      return { x: 4 + Math.cos(angle) * 4, y: 4 + Math.sin(angle) * 4 };
    });
    const shape = piece(21, 'FUSE', circle);
    const zone = interliningShapeToZone(shape, target);
    expect('spline' in zone).toBe(true);
    if (!('spline' in zone)) throw new Error('expected spline');
    expect(zone.spline.points.length).toBeLessThanOrEqual(64);
    expect(zone.spline.points.length).toBeGreaterThanOrEqual(3);
    expect(interliningShapeFits(shape, target)).toBe(true);
    const ring = zoneRingMm(zone);
    expect(ring.every((point) => point.x >= 0 && point.x <= 200)).toBe(true);
    expect(ring.every((point) => point.y >= 0 && point.y <= 120)).toBe(true);

    const centred = centredInterliningShape(shape, target);
    const bounds = (points: readonly Pt[]) => ({
      minX: Math.min(...points.map((point) => point.x)),
      maxX: Math.max(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y)),
      maxY: Math.max(...points.map((point) => point.y)),
    });
    const box = bounds(centred);
    expect((box.minX + box.maxX) / 2).toBeCloseTo(target.bboxW / 2);
    expect((box.minY + box.maxY) / 2).toBeCloseTo(target.bboxH / 2);
  });
});
