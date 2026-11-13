import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearStepRemovalOwed,
  hasStepRemovalOwed,
  markFuseOwed,
  fuseOwed,
  markStepRemovalOwed,
  owedStepRemovals,
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

describe('U1 #6: a page debt kept in memory meets another tab', () => {
  it("the next storage write keeps the other tab's cleanup debt", () => {
    const kept = new Map<string, string>();
    let refuse = true;
    g.localStorage = {
      getItem: vi.fn((k: string) => kept.get(k) ?? null),
      setItem: vi.fn((k: string, v: string) => {
        if (refuse) throw new Error('quota');
        kept.set(k, v);
      }),
      removeItem: vi.fn((k: string) => {
        if (refuse) throw new Error('quota');
        kept.delete(k);
      }),
    };
    markStepRemovalOwed(903, {
      historyKey: 'mine',
      operationNumber: 10,
      candidateKeys: ['a'],
      at: 1,
    });
    // Another tab of the same card writes its own debt while this page reads from memory.
    kept.set(
      'tech-card-owed:903',
      JSON.stringify({
        stepRemovals: [{ historyKey: 'theirs', operationNumber: 30, candidateKeys: ['b'], at: 2 }],
      }),
    );
    refuse = false;
    markStepRemovalOwed(903, {
      historyKey: 'mine2',
      operationNumber: 20,
      candidateKeys: ['c'],
      at: 3,
    });
    const stored = JSON.parse(kept.get('tech-card-owed:903') ?? '{}') as {
      stepRemovals?: { historyKey: string }[];
    };
    expect((stored.stepRemovals ?? []).map((e) => e.historyKey).sort()).toEqual([
      'mine',
      'mine2',
      'theirs',
    ]);
    expect(hasStepRemovalOwed(903, 'theirs', 30)).toBe(true);
    clearStepRemovalOwed(903, 'mine', 10);
    clearStepRemovalOwed(903, 'mine2', 20);
    expect(owedStepRemovals(903).map((e) => e.historyKey)).toEqual(['theirs']);
  });
});
