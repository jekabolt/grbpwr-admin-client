import { describe, expect, it } from 'vitest';

import { repeatClickTarget } from './span-pick';

describe('repeatClickTarget', () => {
  const hits = ['TOP', 'UNDER'];
  const last = { x: 100, y: 80, id: 'TOP' };

  it('takes the edge under the pointer on a first click', () => {
    expect(repeatClickTarget(hits, 'TOP', null, [100, 80], new Set())).toBe('TOP');
  });

  it('keeps a repeat click on the edge in hand, so a stacked edge cannot wipe the pick', () => {
    expect(repeatClickTarget(hits, 'TOP', last, [100, 80], new Set(['TOP']))).toBe('TOP');
    expect(repeatClickTarget(hits, 'TOP', last, [103, 82], new Set(['TOP']))).toBe('TOP');
  });

  it('walks down the stack once the edge is out of hand', () => {
    expect(repeatClickTarget(hits, 'TOP', last, [100, 80], new Set())).toBe('UNDER');
    expect(repeatClickTarget(hits, 'TOP', { ...last, id: 'UNDER' }, [100, 80], new Set())).toBe(
      'TOP',
    );
  });

  it('starts over away from the last click', () => {
    expect(repeatClickTarget(hits, 'TOP', last, [120, 80], new Set(['TOP']))).toBe('TOP');
    expect(repeatClickTarget(hits, 'TOP', last, [120, 80], new Set())).toBe('TOP');
  });
});
