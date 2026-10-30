import { describe, expect, it } from 'vitest';

import { seamFocus } from './seam-focus';

const collar = [
  { name: 'Main collar', pieces: ['MAIN'] },
  { name: 'Second collar', pieces: ['SECOND'] },
];

describe('seamFocus', () => {
  it('a pair on the table keeps only its pieces', () => {
    const groups = [...collar, { name: 'Band', pieces: ['BAND'] }];
    expect(seamFocus(groups, new Set(['MAIN', 'SECOND']), [])).toEqual(collar);
  });

  it('a lone pick with no partner keeps the other input on the canvas', () => {
    // The collar after «place»: the second collar's edge picked alone hid the main collar, so
    // nothing on it could be picked and accept stayed grey.
    expect(seamFocus(collar, new Set(['SECOND']), [])).toBeNull();
  });

  it('one input: a lone pick keeps the rest of its pieces', () => {
    const one = [{ name: 'Front', pieces: ['F', 'P'] }];
    expect(seamFocus(one, new Set(['F']), [])).toBeNull();
    expect(seamFocus(one, new Set(['F', 'P']), [])).toEqual(one);
  });

  it('a seam between two later inputs still hides an input it does not touch', () => {
    const groups = [{ name: 'Body', pieces: ['BODY'] }, ...collar];
    expect(seamFocus(groups, new Set(['MAIN', 'SECOND']), [])).toEqual(collar);
  });

  it('nothing on the table: no focus', () => {
    expect(seamFocus(collar, new Set(), [])).toBeNull();
  });
});
