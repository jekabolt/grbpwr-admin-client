import { describe, expect, it } from 'vitest';
import { foldsClosingOn } from './assembly-folds/fold-step';
import {
  priceNeedsConfirmation,
  removeGate,
  removePrice,
  savedSeamsOnStep,
  type AssemblyPrice,
} from './assembly-cause';
import type { AssemblyPiece, AssemblyStep } from './assembly-frontier';

const emptyPrice = (patch: Partial<AssemblyPrice> = {}): AssemblyPrice => ({
  breaks: [],
  orphans: [],
  unitsLost: [],
  piecesDropped: [],
  heals: [],
  seamsLost: 0,
  summary: 'unused',
  ...patch,
});

const keys = ['FRONT', 'BACK', 'SLEEVE', 'COLLAR', 'POCKET', 'CUFF'];
const pieces: AssemblyPiece[] = keys.map((lineKey) => ({ lineKey, name: lineKey.toLowerCase() }));

const step = (inputs: string[], outputUnitKey = ''): AssemblyStep => ({
  inputs: inputs.map((key) => ({ kind: keys.includes(key) ? 'piece' : 'unit', key })),
  outputUnitKey,
  outputUnitName: '',
});

const chain = [
  step(['FRONT', 'BACK'], 'SHELL'),
  step(['SHELL', 'SLEEVE'], 'BODY'),
  step(['BODY', 'POCKET'], 'GARMENT'),
];

describe('priceNeedsConfirmation', () => {
  it('asks only for destructive consequences', () => {
    expect(priceNeedsConfirmation(null)).toBe(false);
    expect(priceNeedsConfirmation(emptyPrice())).toBe(false);
    expect(priceNeedsConfirmation(emptyPrice({ heals: [2] }))).toBe(false);
    expect(priceNeedsConfirmation(emptyPrice({ breaks: [1] }))).toBe(true);
    expect(priceNeedsConfirmation(emptyPrice({ unitsLost: ['BODY'] }))).toBe(true);
    expect(priceNeedsConfirmation(emptyPrice({ piecesDropped: ['FRONT'] }))).toBe(true);
    expect(priceNeedsConfirmation(emptyPrice({ seamsLost: 1 }))).toBe(true);
  });
});

describe('removePrice', () => {
  it('does not ask for a step nothing depends on', () => {
    const steps = [
      step(['FRONT', 'BACK'], 'SHELL'),
      step(['SHELL']),
      step(['SLEEVE', 'COLLAR'], 'TRIM'),
    ];
    for (const at of [1, 2]) {
      const price = removePrice(pieces, steps, at);
      expect(price?.breaks).toEqual([]);
      expect(price?.unitsLost).toEqual([]);
      expect(price?.piecesDropped).toEqual([]);
      expect(priceNeedsConfirmation(price)).toBe(false);
    }
  });

  it('names consumers by their number on the card before the removal', () => {
    const steps = [step(['CUFF']), ...chain];
    const price = removePrice(pieces, steps, 1);

    expect(price?.breaks).toEqual([2, 3]);
    expect(price?.orphans).toEqual([3]);
    expect(price?.unitsLost).toEqual(['BODY', 'GARMENT']);
    expect(price?.summary).toBe('removing step 20 will break steps 30 and 40');
    expect(priceNeedsConfirmation(price)).toBe(true);
  });

  it('keeps later numbers put when the removed step sits in the middle', () => {
    const steps = [
      step(['FRONT', 'BACK'], 'SHELL'),
      step(['SLEEVE', 'COLLAR'], 'TRIM'),
      step(['CUFF']),
      step(['TRIM', 'POCKET'], 'EDGE'),
    ];
    const price = removePrice(pieces, steps, 1);

    expect(price?.breaks).toEqual([3]);
    expect(price?.summary).toBe('removing step 20 will break step 40');
  });

  it('does not count the removed step, even when it was the broken one', () => {
    const steps = [
      step(['FRONT', 'BACK'], 'SHELL'),
      step(['TYPO', 'SLEEVE'], 'BODY'),
      step(['CUFF']),
    ];
    const price = removePrice(pieces, steps, 1);

    expect(price?.breaks).toEqual([]);
    expect(price?.heals).toEqual([]);
    expect(priceNeedsConfirmation(price)).toBe(false);
  });

  it('reports a heal in old numbering and does not ask for it alone', () => {
    const steps = [step(['CUFF']), step(['FRONT'], 'SHELL'), step(['BACK', 'SLEEVE'], 'BODY')];
    const lonely = removePrice(pieces, steps, 1);

    expect(lonely?.heals).toEqual([]);
    expect(priceNeedsConfirmation(lonely)).toBe(false);

    const twin = removePrice(
      pieces,
      [step(['CUFF']), step(['FRONT', 'BACK'], 'SHELL'), step(['SLEEVE', 'COLLAR'], 'SHELL')],
      1,
    );
    expect(twin?.heals).toEqual([2]);
  });

  it('asks when a surviving unit loses pieces', () => {
    const steps = [step(['FRONT', 'BACK'], 'SHELL'), step(['SHELL', 'SLEEVE', 'COLLAR'], 'BODY')];
    const price = removePrice(pieces, steps, 0);

    expect(price?.breaks).toEqual([1]);
    expect(price?.piecesDropped).toEqual(['FRONT', 'BACK']);
    expect(priceNeedsConfirmation(price)).toBe(true);
  });

  it('has nothing to say about a step that does not exist', () => {
    expect(removePrice(pieces, chain, 9)).toBeNull();
  });
});

describe('saved seams on REMOVE', () => {
  const rows = [
    { seamKey: 'a', status: 'confirmed' },
    { seamKey: 'b', status: 'confirmed' },
    { seamKey: 'no', status: 'rejected' },
  ];
  const lonely = [step(['FRONT', 'BACK'], 'SHELL'), step(['SHELL'])];

  it('counts only keys of this step that resolve to a confirmed row', () => {
    expect(savedSeamsOnStep(undefined, rows)).toBe(0);
    expect(savedSeamsOnStep([], rows)).toBe(0);
    expect(savedSeamsOnStep(['', '  ', 'no', 'ghost'], rows)).toBe(0);
    expect(savedSeamsOnStep(['a', 'a', ' b ', 'no', 'ghost'], rows)).toBe(2);
  });

  it('asks for a step with seams even when no other step depends on it', () => {
    const price = removePrice(pieces, lonely, 1, 2);

    expect(price?.breaks).toEqual([]);
    expect(price?.seamsLost).toBe(2);
    expect(price?.summary).toContain('2 saved seams lose the step');
    expect(removeGate([], price)).toBe('ask');
  });

  it('removes a step without seams at once', () => {
    const price = removePrice(pieces, lonely, 1, 0);

    expect(price?.seamsLost).toBe(0);
    expect(removeGate([], price)).toBe('remove');
  });

  it('refuses on a closing fold before the seams are mentioned', () => {
    expect(removeGate(['fold'], removePrice(pieces, lonely, 1, 2))).toBe('refuse');
  });
});

describe('removeGate', () => {
  it('refuses a fold-closing step before any warning', () => {
    const ops = [{ foldKeys: ['fold-1'] }, { foldKeys: [] }];
    const price = removePrice(pieces, chain, 0);

    expect(priceNeedsConfirmation(price)).toBe(true);
    expect(removeGate(foldsClosingOn(ops, 0), price)).toBe('refuse');
    expect(removeGate(foldsClosingOn(ops, 1), price)).toBe('ask');
    expect(removeGate(foldsClosingOn(ops, 1), emptyPrice({ heals: [1] }))).toBe('remove');
  });
});
