import { describe, expect, it } from 'vitest';

import type { StoredFold } from 'lib/folds';

import { dollFoldRowsOf } from './use-doll-card';

// The doll folds what the steps fold, like the step pictures and the PDF: a fold no step names is
// not folded. A card whose steps name no fold at all keeps every fold (older cards, nothing linked).

const fold = (foldKey: string) => ({ foldKey }) as StoredFold;
const rows = [fold('hem'), fold('cuff'), fold('loose')];

describe('doll folds follow the steps', () => {
  it('folds only the folds a step names', () => {
    const ops = [{ foldKeys: ['hem'] }, {}, { foldKeys: ['cuff'] }];
    expect(dollFoldRowsOf(ops, rows).rows.map((row) => row.foldKey)).toEqual(['hem', 'cuff']);
  });

  it('a card with no fold named by any step keeps every fold', () => {
    expect(dollFoldRowsOf([{}, { foldKeys: [] }], rows).rows).toEqual(rows);
  });

  it('linking or unlinking a fold changes the solve key', () => {
    const a = dollFoldRowsOf([{ foldKeys: ['hem'] }], rows).sig;
    const b = dollFoldRowsOf([{ foldKeys: ['hem', 'cuff'] }], rows).sig;
    const c = dollFoldRowsOf([{ foldKeys: ['cuff', 'hem'] }], rows).sig;
    expect(a).not.toBe(b);
    expect(b).toBe(c);
  });
});
