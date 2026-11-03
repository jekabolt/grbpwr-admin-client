import { describe, expect, it } from 'vitest';

import { dropPlace, moveRow, orderOfRows, windowRows } from './layers-window';

const blocks = [
  { key: 'a', pieces: ['A1', 'A2'] },
  { key: 'b', pieces: ['B'] },
  { key: 'c', pieces: ['C'] },
];
const keys = (rows: readonly { key: string }[]) => rows.map((row) => row.key);

describe('windowRows: the top row lies on top', () => {
  it('with no order, follows the picture as it is painted', () => {
    expect(keys(windowRows(blocks, ['B', 'A1', 'C', 'A2']))).toEqual(['a', 'c', 'b']);
    expect(keys(windowRows(blocks, ['A1', 'A2', 'B', 'C']))).toEqual(['c', 'b', 'a']);
  });

  it('with an order, reads it bottom to top', () => {
    expect(keys(windowRows(blocks, ['A1', 'A2', 'B', 'C'], ['c', 'a', 'b']))).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('a stale key is skipped and a new block goes on top', () => {
    expect(keys(windowRows(blocks, ['A1', 'A2', 'B', 'C'], ['gone', 'b', 'a']))).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('an order of stale keys only reads as no order', () => {
    expect(keys(windowRows(blocks, ['C', 'B', 'A1', 'A2'], ['gone']))).toEqual(['a', 'b', 'c']);
    expect(keys(windowRows(blocks, ['C', 'B', 'A1', 'A2'], []))).toEqual(['a', 'b', 'c']);
  });

  it('a block with nothing on the picture has no row', () => {
    const rows = windowRows([...blocks, { key: 'empty', pieces: [] }], ['A1', 'B']);
    expect(keys(rows)).toEqual(['b', 'a']);
    expect(windowRows([{ pieces: ['A'] }], ['A'])).toEqual([]);
  });
});

describe('moveRow', () => {
  const rows = windowRows(blocks, ['A1', 'A2', 'B', 'C']);

  it('an arrow moves a row one place', () => {
    expect(keys(moveRow(rows, 'a', 'up'))).toEqual(['c', 'a', 'b']);
    expect(keys(moveRow(rows, 'c', 'down'))).toEqual(['b', 'c', 'a']);
  });

  it('front and back go to the ends', () => {
    expect(keys(moveRow(rows, 'a', 'front'))).toEqual(['a', 'c', 'b']);
    expect(keys(moveRow(rows, 'c', 'back'))).toEqual(['b', 'a', 'c']);
  });

  it('a number is the new place', () => {
    expect(keys(moveRow(rows, 'c', 1))).toEqual(['b', 'c', 'a']);
    expect(keys(moveRow(rows, 'c', 9))).toEqual(['b', 'a', 'c']);
  });

  it('at the end already, or a block that is not here, gives the same rows', () => {
    expect(moveRow(rows, 'c', 'up')).toBe(rows);
    expect(moveRow(rows, 'c', 'front')).toBe(rows);
    expect(moveRow(rows, 'a', 'down')).toBe(rows);
    expect(moveRow(rows, 'a', 'back')).toBe(rows);
    expect(moveRow(rows, 'c', 0)).toBe(rows);
    expect(moveRow(rows, 'gone', 'up')).toBe(rows);
  });
});

it('orderOfRows stores the rows bottom to top, and reads back as the same rows', () => {
  const rows = moveRow(windowRows(blocks, ['A1', 'A2', 'B', 'C']), 'a', 'front');
  const order = orderOfRows(rows);
  expect(order).toEqual(['b', 'c', 'a']);
  expect(keys(windowRows(blocks, ['A1', 'A2', 'B', 'C'], order))).toEqual(keys(rows));
});

it('dropPlace reads the middles of the other rows', () => {
  expect(dropPlace([10, 30], 5)).toBe(0);
  expect(dropPlace([10, 30], 20)).toBe(1);
  expect(dropPlace([10, 30], 40)).toBe(2);
});
