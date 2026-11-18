import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { describe, expect, it } from 'vitest';
import { anchorOf } from './anchor';
import { anchorToWire } from './wire';

describe('ordinary saved seam fingerprints', () => {
  it('encodes values that round to zero as canonical positive zero', () => {
    const piece: PieceGeom = {
      pieceKey: 'pattern-piece',
      name: 'Pattern piece',
      hand: null,
      cloth: null,
      rs: [
        [0, 0],
        [20, 0],
        [20, 20],
        [0, 20],
      ],
      perimMm: 80,
      areaMm2: 400,
      corners: [0, 1, 2, 3],
      notchIdx: [],
      edges: [],
      rect: true,
      twinOf: [],
    };
    const anchor = anchorOf(piece, {
      id: 'pattern-piece#0',
      edges: [],
      pts: [
        [-0.0001, 0],
        [20, 0],
      ],
      lenMm: 20,
      notches: 0,
      turnDeg: -0.001,
    });
    expect(anchor.samples[0]?.[0]).toBe(0);
    expect(anchor.turnDeg).toBe(0);
    expect(anchorToWire(anchor).turnDeg).toBe(0);
  });
});
