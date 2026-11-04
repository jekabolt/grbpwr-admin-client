import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { IDENTITY, translate } from 'lib/assembly-skeleton/union/affine';
import { describe, expect, it } from 'vitest';

import { stripHostUnder } from './strip-place';

const rect = (w: number, h: number): Pt2[] => [
  [0, 0],
  [w, 0],
  [w, h],
  [0, h],
];
const geoms = new Map([
  ['band', { rs: rect(500, 60) }],
  ['lining', { rs: rect(500, 60) }],
  ['strip', { rs: rect(480, 30), cutStrip: { sewnMm: 480, widthMm: 30 } }],
]) as unknown as ReadonlyMap<string, PieceGeom>;

describe('a strip placed by hand', () => {
  it('lies on the topmost piece under its middle', () => {
    const T = new Map([
      ['band', IDENTITY],
      ['lining', IDENTITY],
      ['strip', translate(10, 15)],
    ]);
    expect(stripHostUnder('strip', T, geoms)).toBe('lining');
  });

  it('has no host when put down beside the cloth', () => {
    const T = new Map([
      ['band', IDENTITY],
      ['strip', translate(0, 200)],
    ]);
    expect(stripHostUnder('strip', T, geoms)).toBeNull();
  });
});
