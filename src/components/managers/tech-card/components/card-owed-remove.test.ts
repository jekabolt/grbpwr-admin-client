import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearStepLinksOwed, fuseOwed, markFuseOwed, markLinkOwed, owedLinks } from './card-owed';

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
});
