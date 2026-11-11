import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoredFold } from 'lib/folds';
import { markLinkOwed, owedLinks, planOwedLinks } from '../card-owed';
import { goneFoldKeys, owedFoldLinks, planFoldReplay } from './fold-links-keep';
import { stepsWithoutFolds } from './use-fold-writes';

const NOW = 1_000_000_000_000;
const row = (foldKey: string) => ({ foldKey, seq: 1 }) as StoredFold;

describe('D5: a fold-to-step link survives a reload', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('linking a fold to a step owes it by the step number; unlinking owes nothing', () => {
    const ops = [{ operationNumber: 450 }, { operationNumber: 460 }];
    expect(owedFoldLinks(ops, ['fold-a', 'fold-b'], 1, NOW)).toEqual([
      { op: 460, field: 'foldKeys', key: 'fold-a', at: NOW },
      { op: 460, field: 'foldKeys', key: 'fold-b', at: NOW },
    ]);
    expect(owedFoldLinks(ops, ['fold-a'], null, NOW)).toEqual([]);
    // A step not numbered yet has no identity a reloaded page could find.
    expect(owedFoldLinks([{ operationNumber: 0 }], ['fold-a'], 0, NOW)).toEqual([]);
  });

  it('fold debts are kept apart from the seam debts the seam replay reads', () => {
    markLinkOwed(7, { op: 460, field: 'seamKeys', key: 'seam-a', at: NOW });
    markLinkOwed(7, { op: 460, field: 'foldKeys', key: 'fold-a', at: NOW });
    expect(owedLinks(7).map((l) => l.key)).toEqual(['seam-a']);
    expect(owedLinks(7, ['foldKeys']).map((l) => l.key)).toEqual(['fold-a']);
  });

  it('the reloaded page puts the stored fold back on its step', () => {
    const link = { op: 460, field: 'foldKeys' as const, key: 'fold-a', at: NOW - 1000 };
    const form = [{ operationNumber: 450 }, { operationNumber: 460, foldKeys: [] }];
    const plan = planOwedLinks([link], form, form, [{ seamKey: 'fold-a' }], NOW);
    expect(plan.attach).toEqual([{ index: 1, field: 'foldKeys', key: 'fold-a' }]);
    const stored = [{ operationNumber: 450 }, { operationNumber: 460, foldKeys: ['fold-a'] }];
    expect(planOwedLinks([link], stored, stored, [{ seamKey: 'fold-a' }], NOW).drop).toEqual([
      link,
    ]);
  });
});

describe('D5: a reused fold moved to another step comes back on the new one', () => {
  it('the key still stored on its old step is moved, not taken as linked', () => {
    // A pleat reused folds of steps 450 and 460 and put them all on 450; the page reloaded first.
    const links = ['fold-a', 'fold-b'].map((key) => ({
      op: 450,
      field: 'foldKeys' as const,
      key,
      at: NOW - 1000,
    }));
    const stored = [
      { operationNumber: 450, foldKeys: ['fold-a'] },
      { operationNumber: 460, foldKeys: ['fold-b'] },
    ];
    const plan = planFoldReplay(links, stored, stored, [row('fold-a'), row('fold-b')], NOW);
    expect(plan.drop).toEqual([links[0]]);
    expect(plan.attach).toEqual([{ index: 0, key: 'fold-b' }]);
    expect(plan.detach).toEqual([{ index: 1, key: 'fold-b' }]);
  });
});

describe('D5: a fold removed in another tab leaves the steps', () => {
  it('a key the server list dropped is gone; a row in flight is not', () => {
    const prev = [row('fold-a'), row('fold-b'), row('fold-c')];
    const next = [row('fold-a')];
    expect(goneFoldKeys(prev, next, { 'fold-c': { kind: 'upsert', row: row('fold-c') } })).toEqual([
      'fold-b',
    ]);
    const ops = [{ foldKeys: ['fold-a', 'fold-b'] }, { foldKeys: ['fold-c'] }];
    expect(stepsWithoutFolds(ops, ['fold-b'])).toEqual([{ index: 0, foldKeys: ['fold-a'] }]);
  });
});
