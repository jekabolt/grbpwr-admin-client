import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearStepRemovalOwed,
  hasStepRemovalOwed,
  markFuseOwed,
  fuseOwed,
  markStepRemovalOwed,
} from './card-owed';

// Storage that refuses (private mode, quota, a blocked origin): the debt lives in memory for the
// page's lifetime instead of vanishing on the next read.

const g = globalThis as Record<string, unknown>;
const real = g.localStorage;

const refusing = (reads: boolean) => ({
  getItem: vi.fn(() => {
    if (reads) throw new Error('blocked');
    return null;
  }),
  setItem: vi.fn(() => {
    throw new Error('quota');
  }),
  removeItem: vi.fn(() => {
    throw new Error('quota');
  }),
});

afterEach(() => {
  g.localStorage = real;
});

describe('card debt without storage', () => {
  it('a debt written while storage refuses every call is still owed on the next read', () => {
    g.localStorage = refusing(true);
    markStepRemovalOwed(901, { historyKey: 'h', operationNumber: 20, candidateKeys: ['s'], at: 1 });
    expect(hasStepRemovalOwed(901, 'h', 20)).toBe(true);
    clearStepRemovalOwed(901, 'h', 20);
    expect(hasStepRemovalOwed(901, 'h', 20)).toBe(false);
  });

  it('a write that fails while reads still work is not lost behind an older stored value', () => {
    g.localStorage = refusing(false);
    markFuseOwed(902);
    expect(fuseOwed(902)).toBe(true);
  });
});
