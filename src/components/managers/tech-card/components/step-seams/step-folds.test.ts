import type { StoredFold } from 'lib/folds';
import { describe, expect, it } from 'vitest';
import { closingFoldsOf } from './step-folds';

const row = (foldKey: string, pieceKey: string, seq = 1): StoredFold =>
  ({ foldKey, pieceKey, seq }) as StoredFold;

describe('closingFoldsOf', () => {
  it('names the piece whose fold closes here, with every fold it holds by then', () => {
    const ops = [{ foldKeys: ['a'] }, {}, { foldKeys: ['b'] }];
    const rows = [row('a', 'FLAP_L', 1), row('b', 'flap_l', 2), row('c', 'FLAP_R')];
    expect(closingFoldsOf(ops, 0, rows)).toEqual([{ pieceKey: 'FLAP_L', rows: [rows[0]] }]);
    expect(closingFoldsOf(ops, 1, rows)).toEqual([]);
    expect(closingFoldsOf(ops, 2, rows)).toEqual([
      { pieceKey: 'flap_l', rows: [rows[0], rows[1]] },
    ]);
  });

  it('a fold no step names stays flat', () => {
    expect(closingFoldsOf([{}, {}], 1, [row('a', 'FLAP_L')])).toEqual([]);
  });
});
