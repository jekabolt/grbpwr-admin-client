import { describe, expect, it } from 'vitest';

import type { common_TechCardPiece } from 'api/proto-http/admin';

import {
  fusingBaseAttacher,
  fusingBaseFromWire,
  fusingBaseKeyOf,
  fusingBaseSizeOf,
  fusingMarkupStale,
  hasFusingMarkup,
} from './fusing-base';
import { fusingBaseRows } from './fusing-base-source';
import {
  currentFusingBases,
  fusingBaseResolver,
  fusingMarkupStaleByPiece,
  getFusingBases,
  publishFusingBases,
} from './fusing-base-store';

const square = (side: number, x0 = 0) => [
  { x: x0, y: 0 },
  { x: x0 + side, y: 0 },
  { x: x0 + side, y: side },
  { x: x0, y: side },
];
const BASE = square(200);
const KEY = fusingBaseKeyOf(4, BASE)!;

const zonePiece = {
  fused: true,
  fusingMode: 'TECH_CARD_PIECE_FUSING_MODE_ZONE',
  fusingEdges: [],
  fusingZone: { rect: [10, 10, 50, 50] as [number, number, number, number] },
};

describe('fusing markup stale', () => {
  it('a piece with no markup is never stale', () => {
    expect(fusingMarkupStale({ fused: false }, BASE, 4)).toEqual({ stale: false });
    expect(
      fusingMarkupStale({ fused: true, fusingMode: 'TECH_CARD_PIECE_FUSING_MODE_FULL' }, BASE, 4),
    ).toEqual({ stale: false });
  });

  it('markup without a key → no_key', () => {
    expect(fusingMarkupStale(zonePiece, BASE, 4)).toEqual({ stale: true, reason: 'no_key' });
    expect(fusingMarkupStale({ ...zonePiece, fusingBase: null }, null, null).reason).toBe('no_key');
  });

  it('same base → fresh, also after re-saving with jitter', () => {
    const piece = { ...zonePiece, fusingBase: KEY };
    expect(fusingMarkupStale(piece, BASE, 4)).toEqual({ stale: false });
    const resaved = BASE.map((p, i) => ({ x: p.x + (i % 2 ? 0.04 : -0.03), y: p.y + 0.02 }));
    expect(fusingMarkupStale(piece, resaved, 4)).toEqual({ stale: false });
  });

  it('another base size → base_size_changed', () => {
    expect(fusingMarkupStale({ ...zonePiece, fusingBase: KEY }, BASE, 5)).toEqual({
      stale: true,
      reason: 'base_size_changed',
    });
  });

  it('a changed contour → contour_changed; an unknown one → cannot tell', () => {
    const piece = { ...zonePiece, fusingBase: KEY };
    expect(fusingMarkupStale(piece, square(203), 4)).toEqual({
      stale: true,
      reason: 'contour_changed',
    });
    expect(fusingMarkupStale(piece, null, 4)).toEqual({ stale: false });
    expect(fusingMarkupStale(piece, null, null)).toEqual({ stale: false });
  });

  it('strip edges count as markup only on a strip piece', () => {
    const edges = [{ edge: 1, startMm: 0, endMm: 10 }];
    expect(
      hasFusingMarkup({
        fused: true,
        fusingMode: 'TECH_CARD_PIECE_FUSING_MODE_STRIP',
        fusingEdges: edges,
      }),
    ).toBe(true);
    expect(
      hasFusingMarkup({
        fused: true,
        fusingMode: 'TECH_CARD_PIECE_FUSING_MODE_ZONE',
        fusingEdges: edges,
      }),
    ).toBe(false);
  });
});

describe('fusing base key', () => {
  it('reads only a whole key off the wire', () => {
    expect(fusingBaseFromWire({ baseSizeId: 4, contourSignature: KEY.contourSignature })).toEqual(
      KEY,
    );
    expect(fusingBaseFromWire({ baseSizeId: 4, contourSignature: '' })).toBeNull();
    expect(fusingBaseFromWire({ baseSizeId: 0, contourSignature: 'v1:x' })).toBeNull();
    expect(fusingBaseFromWire(undefined)).toBeNull();
  });

  it('picks the base size the generator picks', () => {
    const sizes = [{ sizeId: 3 }, { sizeId: 4 }, { sizeId: 5 }];
    expect(fusingBaseSizeOf(sizes, 4)?.sizeId).toBe(4);
    expect(fusingBaseSizeOf(sizes, 9)?.sizeId).toBe(3);
    expect(fusingBaseSizeOf(sizes, 0)?.sizeId).toBe(3);
    expect(fusingBaseSizeOf([], 4)).toBeNull();
  });
});

describe('fusing base attacher (save)', () => {
  const wireZone = {
    rect: {
      x0: { value: '10' },
      y0: { value: '10' },
      x1: { value: '50' },
      y1: { value: '50' },
    },
    holes: [],
    islands: [],
  };
  const out = (zone = wireZone) =>
    ({
      lineKey: 'FP',
      fused: true,
      fusingMode: 'TECH_CARD_PIECE_FUSING_MODE_ZONE',
      fusingEdges: { items: [] },
      fusingZone: zone,
    }) as unknown as common_TechCardPiece;
  const resolve = (k: string) => (k.toLowerCase() === 'fp' ? KEY : null);

  it('no resolver → nothing changes', () => {
    expect(fusingBaseAttacher(undefined, undefined)(out()).fusingBase).toBeUndefined();
  });

  it('a new piece with markup gets the key', () => {
    expect(fusingBaseAttacher(undefined, resolve)(out()).fusingBase).toEqual(KEY);
  });

  it('unchanged markup → omitted (the stored key stays)', () => {
    const stored = [
      { ...out(), fusingZone: { ...wireZone, rect: { ...wireZone.rect, x0: { value: '10.0' } } } },
    ];
    expect(fusingBaseAttacher(stored, resolve)(out()).fusingBase).toBeUndefined();
  });

  it('changed markup → key; contour unknown → omitted, never empty', () => {
    const moved = { ...wireZone, rect: { ...wireZone.rect, x1: { value: '60' } } };
    const stored = [out()];
    expect(fusingBaseAttacher(stored, resolve)(out(moved)).fusingBase).toEqual(KEY);
    expect(fusingBaseAttacher(stored, () => null)(out(moved)).fusingBase).toBeUndefined();
  });

  it('no markup → omitted', () => {
    const plain = { lineKey: 'FP', fused: false } as unknown as common_TechCardPiece;
    expect(fusingBaseAttacher(undefined, resolve)(plain).fusingBase).toBeUndefined();
  });
});

describe('current bases (source + store + selector)', () => {
  const poly = (side: number) => square(side / 10).map((p) => ({ x: p.x, y: p.y }));
  const ref = {
    pieceLineKey: 'FP',
    entry: {
      sizes: ['m', 's', 'l'],
      bySize: new Map([
        ['s', { poly: poly(180) }],
        ['m', { poly: poly(200) }],
        ['l', { poly: poly(220) }],
      ]),
    },
  };
  const card = new Map([
    ['s', { sizeId: 3, rank: 0 }],
    ['m', { sizeId: 4, rank: 1 }],
    ['l', { sizeId: 5, rank: 2 }],
  ]);
  const sizeOf = (t: string) => card.get(t);

  it('takes the sample size, else the first in grade order, in mm', () => {
    const [row] = fusingBaseRows([ref], sizeOf, 4);
    expect(row.baseSizeId).toBe(4);
    expect(row.contour[2]).toEqual({ x: 200, y: 200 });
    expect(fusingBaseRows([ref], sizeOf, 0)[0].baseSizeId).toBe(3);
  });

  it('an unsized single block stands for the sample size', () => {
    const uni = {
      pieceLineKey: 'P',
      entry: { sizes: [''], bySize: new Map([['', { poly: poly(100) }]]) },
    };
    expect(fusingBaseRows([uni], sizeOf, 4)[0].baseSizeId).toBe(4);
    expect(fusingBaseRows([uni], sizeOf, 0)).toEqual([]);
  });

  it('publishes per card; the resolver and the selector read it', () => {
    const bases = currentFusingBases(fusingBaseRows([ref], sizeOf, 4));
    publishFusingBases(77, bases);
    expect(getFusingBases(77).get('fp')?.key).toEqual(KEY);
    expect(fusingBaseResolver(77)('FP')).toEqual(KEY);
    expect(fusingBaseResolver(78)('FP')).toBeNull();
    const flags = fusingMarkupStaleByPiece(
      [
        { lineKey: 'FP', ...zonePiece, fusingBase: KEY },
        { lineKey: 'BP', ...zonePiece },
        { lineKey: 'XP', fused: false },
      ],
      getFusingBases(77),
    );
    expect(flags.get('fp')).toEqual({ stale: false });
    expect(flags.get('bp')).toEqual({ stale: true, reason: 'no_key' });
    expect(flags.get('xp')).toEqual({ stale: false });
  });
});
