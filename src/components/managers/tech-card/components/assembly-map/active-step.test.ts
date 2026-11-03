import { describe, expect, it, vi } from 'vitest';
import { activeOf, createActiveStepStore, followOpenStep, shownStep } from './active-step';

const FIRST_MACHINE = 2;

describe('shownStep', () => {
  it('shows the open step, not the first machine step', () => {
    expect(shownStep({ hover: null, open: 32 }, 65, FIRST_MACHINE)).toBe(32);
  });

  it('lets a hovered row win only while it is hovered', () => {
    const snap = { hover: 5, open: 32 };
    expect(shownStep(snap, 65, FIRST_MACHINE)).toBe(5);
    expect(shownStep({ ...snap, hover: null }, 65, FIRST_MACHINE)).toBe(32);
  });

  it('falls back to the first machine step only when nothing is open', () => {
    expect(shownStep({ hover: null, open: null }, 65, FIRST_MACHINE)).toBe(FIRST_MACHINE);
  });

  it('ignores a hover past the end of the list', () => {
    expect(shownStep({ hover: 70, open: 32 }, 65, FIRST_MACHINE)).toBe(32);
  });

  it('clamps an open step past the end instead of swapping in another one', () => {
    expect(shownStep({ hover: null, open: 65 }, 65, FIRST_MACHINE)).toBe(64);
  });

  it('shows nothing on an empty list', () => {
    expect(shownStep({ hover: null, open: null }, 0, null)).toBeNull();
    expect(shownStep({ hover: null, open: 0 }, 0, null)).toBeNull();
  });
});

describe('followOpenStep', () => {
  it('follows the row by historyKey when a step lands before it', () => {
    expect(followOpenStep(['a', 'b', 'c'], 1, ['a', 'fuse', 'b', 'c'])).toBe(2);
  });

  it('follows the row when a step before it goes away', () => {
    expect(followOpenStep(['a', 'b', 'c'], 2, ['b', 'c'])).toBe(1);
  });

  it('keeps the index when the row is gone or its key was minted anew', () => {
    expect(followOpenStep(['a', 'b'], 1, ['a'])).toBeNull();
    expect(followOpenStep(['a', 'b'], 1, ['x', 'y'])).toBeNull();
  });

  it('does not match a row without a key', () => {
    expect(followOpenStep(['a', ''], 1, ['', 'a'])).toBeNull();
    expect(followOpenStep([], -1, ['a'])).toBeNull();
  });
});

describe('active step store', () => {
  it('keeps the open step through hover in and out', () => {
    const store = createActiveStepStore();
    store.setOpen(32);
    store.hover(5);
    expect(activeOf(store.get())).toBe(5);
    store.hover(null);
    expect(activeOf(store.get())).toBe(32);
  });

  it('drops a parked hover when another step opens', () => {
    const store = createActiveStepStore();
    store.setOpen(32);
    store.hover(32);
    store.setOpen(33);
    expect(activeOf(store.get())).toBe(33);
    store.hover(5);
    store.setOpen(33);
    expect(activeOf(store.get())).toBe(5);
  });

  it('routes a map pick to the owner of the selection and moves nothing itself', () => {
    const store = createActiveStepStore();
    const open = vi.fn();
    store.setOpener(open);
    store.setOpen(1);
    store.pick(3);
    expect(open).toHaveBeenCalledWith(3);
    expect(store.get().open).toBe(1);
  });

  it('does not wake subscribers when nothing changed', () => {
    const store = createActiveStepStore();
    const sub = vi.fn();
    store.subscribe(sub);
    store.setOpen(3);
    store.setOpen(3);
    expect(sub).toHaveBeenCalledTimes(1);
  });
});
