import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearFuseOwed,
  clearLinkOwed,
  fuseOwed,
  markFuseOwed,
  markLinkOwed,
  owedLinks,
  planOwedLinks,
  type OwedLink,
} from './card-owed';

const NOW = 1_000_000_000_000;
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

const link = (over: Partial<OwedLink> = {}): OwedLink => ({
  op: 460,
  field: 'seamKeys',
  key: 'seam-a',
  sig: 'pair-a',
  at: NOW - 1000,
  ...over,
});
const step = (operationNumber: number, seamKeys: string[] = []) => ({ operationNumber, seamKeys });
const rows = [{ seamKey: 'seam-a', sig: 'pair-a' }];

describe('planOwedLinks', () => {
  it('a reloaded page finishes the link: the row is stored, the step does not hold it', () => {
    const form = [step(450), step(460)];
    expect(planOwedLinks([link()], form, form, rows, NOW)).toEqual({
      attach: [{ index: 1, field: 'seamKeys', key: 'seam-a' }],
      drop: [],
    });
  });

  it('a link in the stored body is done', () => {
    const stored = [step(460, ['seam-a'])];
    const plan = planOwedLinks([link()], stored, stored, rows, NOW);
    expect(plan).toEqual({ attach: [], drop: [link()] });
  });

  it('a link in the form alone waits for its write', () => {
    const plan = planOwedLinks([link()], [step(460)], [step(460, ['seam-a'])], rows, NOW);
    expect(plan).toEqual({ attach: [], drop: [] });
  });

  it('the server answered with the key of the pair it already holds: that key goes on the step', () => {
    const stored = [{ seamKey: 'seam-held', sig: 'pair-a' }];
    const form = [step(460)];
    expect(planOwedLinks([link()], form, form, stored, NOW).attach).toEqual([
      { index: 0, field: 'seamKeys', key: 'seam-held' },
    ]);
  });

  it('no row yet: its write may still land, within the hour', () => {
    const form = [step(460)];
    expect(planOwedLinks([link()], form, form, [], NOW)).toEqual({ attach: [], drop: [] });
    const late = link({ at: NOW - 2 * HOUR });
    expect(planOwedLinks([late], form, form, [], NOW)).toEqual({ attach: [], drop: [late] });
  });

  it('a week later it is nobody’s work any more', () => {
    const old = link({ at: NOW - 8 * DAY });
    const form = [step(460)];
    expect(planOwedLinks([old], form, form, rows, NOW)).toEqual({ attach: [], drop: [old] });
  });

  it('the step is gone from a loaded form: dropped; a form not loaded yet: it waits', () => {
    const stored = [step(450)];
    expect(planOwedLinks([link()], stored, stored, rows, NOW)).toEqual({
      attach: [],
      drop: [link()],
    });
    expect(planOwedLinks([link()], stored, [], rows, NOW)).toEqual({ attach: [], drop: [] });
  });

  it('a pose link walks the same way, on its own field', () => {
    const pose = link({ field: 'poseKeys', key: 'pose-a', sig: undefined });
    const form = [{ operationNumber: 460, seamKeys: ['pose-a'] }];
    expect(planOwedLinks([pose], form, form, [{ seamKey: 'pose-a' }], NOW).attach).toEqual([
      { index: 0, field: 'poseKeys', key: 'pose-a' },
    ]);
  });
});

describe('the record', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fuse and links are separate debts of one card, and another card owes nothing', () => {
    markFuseOwed(100);
    markLinkOwed(100, link());
    expect(fuseOwed(100)).toBe(true);
    expect(fuseOwed(90)).toBe(false);
    expect(owedLinks(90)).toEqual([]);

    clearFuseOwed(100);
    expect(fuseOwed(100)).toBe(false);
    expect(owedLinks(100)).toEqual([link()]);

    clearLinkOwed(100, 'seam-a');
    expect(owedLinks(100)).toEqual([]);
    expect(localStorage.getItem('tech-card-owed:100')).toBeNull();
  });

  it('the same link marked twice is one debt', () => {
    markLinkOwed(100, link({ at: 1 }));
    markLinkOwed(100, link({ at: 2 }));
    expect(owedLinks(100)).toEqual([link({ at: 2 })]);
  });

  it('storage that throws keeps the debt in memory and does not crash', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => markFuseOwed(100)).not.toThrow();
    expect(fuseOwed(100)).toBe(true);
    clearFuseOwed(100);
    expect(fuseOwed(100)).toBe(false);
  });
});
