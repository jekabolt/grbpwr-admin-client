import { describe, expect, it } from 'vitest';
import { pickHistorySide } from './undo-history-core';

describe('pickHistorySide', () => {
  it('a step removed in the list reaches the card UNDO with an empty page stack', () => {
    expect(pickHistorySide('page', 0, 1)).toBe('owner');
  });
  it('the side that acted last goes first', () => {
    expect(pickHistorySide('owner', 2, 1)).toBe('owner');
    expect(pickHistorySide('page', 2, 1)).toBe('page');
  });
  it('falls to the other side when the last one is empty', () => {
    expect(pickHistorySide('owner', 2, 0)).toBe('page');
  });
  it('nothing on either side is no side', () => {
    expect(pickHistorySide('page', 0, 0)).toBeNull();
    expect(pickHistorySide('owner', 0, 0)).toBeNull();
  });
});
