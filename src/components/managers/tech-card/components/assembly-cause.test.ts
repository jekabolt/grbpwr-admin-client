import { describe, expect, it } from 'vitest';
import { dissolveNeedsConfirmation, dissolvePrice, type AssemblyPrice } from './assembly-cause';
import type { AssemblyPiece, AssemblyStep } from './assembly-frontier';

const emptyPrice = (patch: Partial<AssemblyPrice> = {}): AssemblyPrice => ({
  breaks: [],
  orphans: [],
  unitsLost: [],
  piecesDropped: [],
  heals: [],
  summary: 'unused',
  ...patch,
});

const pieces: AssemblyPiece[] = [
  { lineKey: 'FLAP_1_L', name: 'FLAP_1_L' },
  { lineKey: 'FLAP_L', name: 'FLAP_L' },
];
const join: AssemblyStep = {
  inputs: [
    { kind: 'piece', key: 'FLAP_1_L' },
    { kind: 'piece', key: 'FLAP_L' },
  ],
  outputUnitKey: 'LEFT_FLAP',
  outputUnitName: 'left flap',
};

describe('dissolveNeedsConfirmation', () => {
  it('asks only for destructive consequences', () => {
    expect(dissolveNeedsConfirmation(null)).toBe(false);
    expect(dissolveNeedsConfirmation(emptyPrice())).toBe(false);
    expect(dissolveNeedsConfirmation(emptyPrice({ heals: [2] }))).toBe(false);
    expect(dissolveNeedsConfirmation(emptyPrice({ breaks: [1] }))).toBe(true);
    expect(dissolveNeedsConfirmation(emptyPrice({ unitsLost: ['BODY'] }))).toBe(true);
    expect(dissolveNeedsConfirmation(emptyPrice({ piecesDropped: ['FLAP_L'] }))).toBe(true);
  });

  it('asks when a later operation consumes the unit', () => {
    const price = dissolvePrice(
      pieces,
      [
        join,
        {
          inputs: [{ kind: 'unit', key: 'LEFT_FLAP' }],
          outputUnitKey: '',
          outputUnitName: '',
        },
      ],
      0,
    );

    expect(price?.breaks).toEqual([1]);
    expect(dissolveNeedsConfirmation(price)).toBe(true);
  });

  it('does not ask when the unit has no consumer', () => {
    expect(dissolveNeedsConfirmation(dissolvePrice(pieces, [join], 0))).toBe(false);
  });
});
