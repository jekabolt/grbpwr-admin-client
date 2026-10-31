import { describe, expect, it } from 'vitest';

import { isGuess, pickTarget } from './seam-focus';
import { DOOR_SPAN_MM, spanMm } from './step-picture-view';

describe('isGuess', () => {
  it('only a proposal flagged not confident is a guess', () => {
    expect(isGuess({ confident: false })).toBe(true);
    expect(isGuess({ confident: true })).toBe(false);
    expect(isGuess({})).toBe(false);
    expect(isGuess(null)).toBe(false);
  });
});

describe('pickTarget', () => {
  const isInner = (id: string) => /:i\d+$/.test(id);
  const pieceOf = (id: string) => id.split(':')[0];
  const pick = (sel: { a: string[]; b: string[] }, side: 'a' | 'b', id: string) =>
    pickTarget(sel, side, id, isInner, pieceOf);

  it('takes the base fabric slit under a patch already sewn on (fabric + two patches)', () => {
    // Block A: FABRIC with PATCH_1 on it; B: PATCH_2 to go onto the fabric.
    const one = pick({ a: [], b: [] }, 'b', 'PATCH_2:0');
    const two = pick(one, 'a', 'FABRIC:i0');
    expect(two).toEqual({ a: ['FABRIC:i0'], b: ['PATCH_2:0'] });
  });

  it('takes the sleeve slit in a sleeve + first placket block (card 6, op 260)', () => {
    const sel = pick({ a: ['FLP_R_MAIN:2'], b: [] }, 'a', 'SLV_R:i0');
    expect(sel.a).toEqual(['SLV_R:i0']);
  });

  it('keeps the base edges a door next to the patch edges', () => {
    const sel = pick(pick({ a: [], b: [] }, 'a', 'PATCH_1:1'), 'a', 'FABRIC:3');
    expect(sel.a).toEqual(['PATCH_1:1', 'FABRIC:3']);
  });

  it('an edge after a line drops the line; a line twice clears it', () => {
    const lined = pick({ a: [], b: [] }, 'a', 'FABRIC:i0');
    expect(pick(lined, 'a', 'FABRIC:3').a).toEqual(['FABRIC:3']);
    expect(pick(lined, 'a', 'FABRIC:i0').a).toEqual([]);
  });

  it('a line drops the other side edges of its own piece', () => {
    expect(pick({ a: [], b: ['FABRIC:2', 'PATCH_2:0'] }, 'a', 'FABRIC:i0').b).toEqual([
      'PATCH_2:0',
    ]);
  });
});

describe('inner-line doors', () => {
  it('a sleeve slit is a door, a button circle and a buttonhole stroke are not', () => {
    const slit: [number, number][] = [
      [0, 0],
      [0, 159.5],
    ];
    const circle = Array.from({ length: 17 }, (_, i): [number, number] => [
      5 * Math.cos((i / 16) * 2 * Math.PI),
      5 * Math.sin((i / 16) * 2 * Math.PI),
    ]);
    const buttonhole: [number, number][] = [
      [0, 0],
      [25, 0],
    ];
    expect(spanMm(slit)).toBeGreaterThanOrEqual(DOOR_SPAN_MM);
    expect(spanMm(circle)).toBeLessThan(DOOR_SPAN_MM);
    expect(spanMm(buttonhole)).toBeLessThan(DOOR_SPAN_MM);
  });
});
