import { describe, expect, it } from 'vitest';

import { bomLineHold } from './bom-line-hold';

describe('bomLineHold', () => {
  const strips = [{ bomLineKey: 'bias' }, { bomLineKey: ' bias ' }, { bomLineKey: 'other' }];
  const operations = [{ topstitchLines: [{ bomLineKey: 'thread' }] }, { topstitchLines: [] }, {}];

  it('holds a line its cut strips are cut from, and counts them', () => {
    expect(bomLineHold('bias', strips, operations)).toEqual({ held: true, strips: 2 });
  });

  it('holds a line used only by a topstitch line, with no strips', () => {
    expect(bomLineHold('thread', strips, operations)).toEqual({ held: true, strips: 0 });
  });

  it('does not hold a line with neither', () => {
    expect(bomLineHold('shell', strips, operations)).toEqual({ held: false, strips: 0 });
    expect(bomLineHold('shell', undefined, undefined)).toEqual({ held: false, strips: 0 });
  });

  it('never matches blank or whitespace keys', () => {
    const blank = [{ bomLineKey: '' }, { bomLineKey: '  ' }, {}];
    const blankOps = [{ topstitchLines: [{ bomLineKey: ' ' }, {}] }];
    expect(bomLineHold('', blank, blankOps)).toEqual({ held: false, strips: 0 });
    expect(bomLineHold('  ', blank, blankOps)).toEqual({ held: false, strips: 0 });
    expect(bomLineHold(undefined, blank, blankOps)).toEqual({ held: false, strips: 0 });
  });
});
