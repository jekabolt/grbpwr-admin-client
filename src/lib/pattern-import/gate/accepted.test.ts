import { describe, expect, it } from 'vitest';

import type { PieceDTO } from 'lib/nesting/types';
import { acceptedGateFindings, type AcceptedGateEntry } from './accepted';

const piece = (over: Partial<PieceDTO> = {}): PieceDTO => ({
  id: 1,
  name: 'P_M',
  blockName: 'P_M',
  layer: '1',
  source: 'current.dxf',
  poly: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ],
  bboxW: 10,
  bboxH: 10,
  areaCm2: 100,
  originX: 0,
  originY: 0,
  inner: [],
  grain: [],
  ...over,
});

const entry = (identity: string, sample: PieceDTO): AcceptedGateEntry => ({
  identity,
  pieces: [sample],
  bySize: new Map([['m', sample]]),
});

describe('accepted gate findings on the current card sheet', () => {
  it('records grain, drill and glyph findings per piece', () => {
    const strokes = Array.from({ length: 12 }, (_, index) => ({
      layer: '8',
      closed: false,
      pts: [
        { x: 1 + (index % 4), y: 1 + Math.floor(index / 4) },
        { x: 1.4 + (index % 4), y: 1.2 + Math.floor(index / 4) },
      ],
    }));
    const sample = piece({
      grain: [
        {
          layer: '7',
          angleDeg: 90,
          lengthCm: 18,
          a: { x: 20, y: 0 },
          b: { x: 20, y: 18 },
        },
      ],
      inner: [
        ...strokes,
        {
          layer: '8',
          closed: true,
          pts: [
            { x: 5, y: 5 },
            { x: 6, y: 5 },
            { x: 6, y: 6 },
            { x: 5, y: 6 },
          ],
        },
      ],
    });
    expect(acceptedGateFindings([entry('P', sample)]).get('p')).toEqual([
      'G16-glyphs',
      'G5-features',
    ]);
  });

  it('records a grain-angle pair finding on both bound identities', () => {
    const left = piece({
      grain: [{ layer: '7', angleDeg: 0, lengthCm: 10, a: { x: 0, y: 5 }, b: { x: 10, y: 5 } }],
    });
    const right = piece({
      id: 2,
      grain: [{ layer: '7', angleDeg: 9, lengthCm: 10, a: { x: 0, y: 5 }, b: { x: 10, y: 6.6 } }],
    });
    const found = acceptedGateFindings([entry('SL_LIN_L', left), entry('SL_LIN_R', right)]);
    expect(found.get('sl_lin_l')).toContain('G12-pair');
    expect(found.get('sl_lin_r')).toContain('G12-pair');
  });

  it('keeps a clean piece unmarked', () => {
    const clean = piece({
      grain: [{ layer: '7', angleDeg: 90, lengthCm: 8, a: { x: 5, y: 1 }, b: { x: 5, y: 9 } }],
    });
    expect(acceptedGateFindings([entry('P', clean)]).size).toBe(0);
  });
});
