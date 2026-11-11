import type { StoredFold } from 'lib/folds';
import { describe, expect, it, vi } from 'vitest';
import { executeFoldPlan } from './fold-execute';

const row = (foldKey: string) => ({ foldKey }) as unknown as StoredFold;

const rig = (ok = true) => {
  const writes = {
    upsert: vi.fn(async () => ok),
    replace: vi.fn(async () => ok),
  };
  return { writes, assign: vi.fn(), refuse: vi.fn() };
};

describe('D1: a fold plan goes to the server', () => {
  it('a plan with remove goes out as one call', async () => {
    const r = rig();
    const keep = row('A');
    const drop = row('B');
    const ok = await executeFoldPlan(
      { upsert: [keep], remove: [drop], link: { keys: ['A'], step: 2 } },
      r.writes,
      r.assign,
      r.refuse,
    );
    expect(ok).toBe(true);
    expect(r.writes.replace).toHaveBeenCalledTimes(1);
    expect(r.writes.replace).toHaveBeenCalledWith([keep], [drop]);
    expect(r.writes.upsert).not.toHaveBeenCalled();
    expect(r.assign).toHaveBeenCalledWith(['A'], 2);
  });

  it('a plan without remove stays a plain upsert', async () => {
    const r = rig();
    await executeFoldPlan(
      { upsert: [row('A')], remove: [], link: null },
      r.writes,
      r.assign,
      r.refuse,
    );
    expect(r.writes.upsert).toHaveBeenCalledTimes(1);
    expect(r.writes.replace).not.toHaveBeenCalled();
    expect(r.assign).not.toHaveBeenCalled();
  });

  it('a refused replace links nothing', async () => {
    const r = rig(false);
    const ok = await executeFoldPlan(
      { upsert: [row('A')], remove: [row('B')], link: { keys: ['A'], step: 1 } },
      r.writes,
      r.assign,
      r.refuse,
    );
    expect(ok).toBe(false);
    expect(r.assign).not.toHaveBeenCalled();
  });

  it('a refused plan writes nothing', async () => {
    const r = rig();
    const ok = await executeFoldPlan(
      { refused: ['FOLD ORDER', 'move the fold first'] },
      r.writes,
      r.assign,
      r.refuse,
    );
    expect(ok).toBe(false);
    expect(r.refuse).toHaveBeenCalledWith('FOLD ORDER', 'move the fold first');
    expect(r.writes.upsert).not.toHaveBeenCalled();
    expect(r.writes.replace).not.toHaveBeenCalled();
  });
});
