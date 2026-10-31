import { describe, expect, it } from 'vitest';

import { mergeSeamHints, seamHintsSchema } from 'lib/seam-hints';
import handFixture from 'lib/seam-hints/__fixtures__/card6-hand.json';

import { card6Geoms } from '../card6.fixture';
import { hintedEdgesFor } from './hinted-edges';

const geoms = card6Geoms();
const hints = mergeSeamHints(seamHintsSchema.parse(handFixture), []);

describe('hintedEdgesFor', () => {
  it('marks the card 6 placket and the centre front for step 720', () => {
    const marked = hintedEdgesFor({ operationNumber: 720 }, hints, geoms);
    expect(marked?.state).toBe('ai');
    expect(marked?.a.pieces).toEqual(['PLCK_L']);
    expect(marked?.b.edges.has('P_L_MAIN#2')).toBe(true);
    expect([...marked!.a.edges].every((id) => id.startsWith('PLCK_L#'))).toBe(true);
    expect(marked!.a.edges.size).toBeGreaterThan(0);
  });

  it('marks the yoke bottom and the front top for step 770', () => {
    const marked = hintedEdgesFor({ operationNumber: 770 }, hints, geoms);
    expect(marked?.a.edges.has('P_R_U#4')).toBe(true);
    expect(marked?.b.edges.has('P_R_MAIN#1')).toBe(true);
  });

  it('reads a sleeve slit only from the picker inner lines', () => {
    expect(hintedEdgesFor({ operationNumber: 260 }, hints, geoms)?.b.edges.size).toBe(0);
    const marked = hintedEdgesFor({ operationNumber: 260 }, hints, geoms, (piece) =>
      piece === 'SLV_R' ? ['SLV_R:i0'] : [],
    );
    expect([...marked!.b.edges]).toEqual(['SLV_R:i0']);
  });

  it('is silent without a row, without hints, or when the owner turned it off', () => {
    expect(hintedEdgesFor({ operationNumber: 10 }, hints, geoms)).toBeNull();
    expect(hintedEdgesFor({ operationNumber: 720 }, null, geoms)).toBeNull();
    const off = mergeSeamHints(seamHintsSchema.parse(handFixture), [
      { kind: 'join', hint_key: '720', value: null, state: 'off' },
    ]);
    expect(hintedEdgesFor({ operationNumber: 720 }, off, geoms)).toBeNull();
  });
});
