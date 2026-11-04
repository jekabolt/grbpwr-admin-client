import { describe, expect, it } from 'vitest';

import { dropPosition, slotBefore } from './board-drag';

describe('slotBefore', () => {
  const rows = [
    { id: 1, top: 100, height: 100 },
    { id: 2, top: 210, height: 300 },
  ];

  it('takes the slot above the first card whose middle is below the pointer', () => {
    expect(slotBefore(rows, 90)).toBe(1);
    expect(slotBefore(rows, 149)).toBe(1);
    expect(slotBefore(rows, 151)).toBe(2);
    expect(slotBefore(rows, 359)).toBe(2);
  });

  it('falls to the end of the column below the last middle and in an empty column', () => {
    expect(slotBefore(rows, 361)).toBeNull();
    expect(slotBefore([], 100)).toBeNull();
  });
});

describe('dropPosition', () => {
  const column = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];

  it('counts without the held card', () => {
    expect(dropPosition(column, 1, 3)).toBe(1);
    expect(dropPosition(column, 4, 1)).toBe(0);
    expect(dropPosition(column, 2, 3)).toBe(1);
  });

  it('counts cards a filter hides, and appends at the end', () => {
    expect(dropPosition(column, 9, 4)).toBe(3);
    expect(dropPosition(column, 9, null)).toBe(4);
    expect(dropPosition(column, 2, null)).toBe(3);
    expect(dropPosition([], 9, null)).toBe(0);
  });

  it('appends when the card it should go above has gone', () => {
    expect(dropPosition(column, 9, 77)).toBe(4);
  });
});
