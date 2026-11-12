import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearStepLinksOwed,
  clearStepRemovalOwed,
  fuseOwed,
  markFuseOwed,
  markLinkOwed,
  markStepRemovalOwed,
  owedLinks,
  owedStepRemovals,
} from './card-owed';

describe('clearStepLinksOwed', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('drops seam and pose debts of only the removed step', () => {
    markFuseOwed(100);
    markLinkOwed(100, { op: 20, field: 'seamKeys', key: 'seam-20', at: 1 });
    markLinkOwed(100, { op: 20, field: 'poseKeys', key: 'pose-20', at: 2 });
    markLinkOwed(100, { op: 20, field: 'foldKeys', key: 'fold-20', at: 3 });
    markLinkOwed(100, { op: 30, field: 'seamKeys', key: 'seam-30', at: 4 });

    clearStepLinksOwed(100, 20);

    expect(owedLinks(100, ['seamKeys', 'poseKeys', 'foldKeys'])).toEqual([
      { op: 20, field: 'foldKeys', key: 'fold-20', at: 3 },
      { op: 30, field: 'seamKeys', key: 'seam-30', at: 4 },
    ]);
    expect(fuseOwed(100)).toBe(true);
  });

  it('keeps removal debt per card and clears only the named entry', () => {
    const first = {
      historyKey: 'h20',
      operationNumber: 20,
      candidateKeys: ['seam-20'],
      at: 1,
    };
    const second = {
      historyKey: 'h30',
      operationNumber: 30,
      candidateKeys: ['seam-30'],
      at: 2,
    };
    markStepRemovalOwed(100, first);
    markStepRemovalOwed(100, second);
    markStepRemovalOwed(200, { ...first, historyKey: 'other' });

    clearStepRemovalOwed(100, first.historyKey, first.operationNumber);

    expect(owedStepRemovals(100)).toEqual([second]);
    expect(owedStepRemovals(200)).toEqual([{ ...first, historyKey: 'other' }]);
  });

  it.each([
    'not json',
    '[]',
    '{"stepRemovals":"old"}',
    '{"stepRemovals":[{"historyKey":3,"candidateKeys":null}]}',
    '{"links":[null,{"op":"20"}]}',
  ])('ignores malformed or old storage without throwing: %s', (raw) => {
    localStorage.setItem('tech-card-owed:100', raw);
    expect(() => owedStepRemovals(100)).not.toThrow();
    expect(owedStepRemovals(100)).toEqual([]);
    expect(owedLinks(100)).toEqual([]);
    expect(owedStepRemovals(200)).toEqual([]);
  });
});
