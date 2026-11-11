import { describe, expect, it, vi } from 'vitest';
import type { EdgeAnchor, StoredPose, StoredSeam } from 'lib/seams';

import {
  relinkRestoredStep,
  removalRows,
  restoredKeyMap,
  restorableSeamKeys,
  runSeamRestore,
  seamWritesInFlight,
  seamRestorePlan,
  seamsOnlyOfStep,
} from './step-removal-seams';

const anchor = (piece: string, edgeHint: string): EdgeAnchor =>
  ({ piece, edgeHint, range: [0, 1] }) as unknown as EdgeAnchor;

const seam = (seamKey: string, a = 'A0', b = 'B0'): StoredSeam =>
  ({
    seamKey,
    status: 'confirmed',
    kind: 'edge',
    direction: 'unknown',
    source: 'manual',
    sideA: [anchor('FRONT', a)],
    sideB: [anchor('BACK', b)],
    anchoredSize: '',
    note: '',
  }) as unknown as StoredSeam;

const pose = (seamKey: string): StoredPose => ({ ...seam(seamKey), kind: 'pose' }) as StoredPose;

describe('seamsOnlyOfStep', () => {
  const seams = [seam('mine'), seam('shared', 'A1'), seam('strip', 'A2'), seam('other', 'A3')];
  const poses = [pose('p-mine'), pose('p-shared')];
  const card = {
    operations: [
      { seamKeys: ['mine', 'shared', 'strip'], poseKeys: ['p-mine', 'p-shared'] },
      { seamKeys: ['shared', 'other'], poseKeys: ['p-shared'] },
    ],
    cutStrips: [{ seamKey: ' strip ' }],
    seams,
    poses,
  };

  it('deletes seams and poses only the removed step links; shared ones stay', () => {
    const got = seamsOnlyOfStep(card, 0);
    expect(got.seams.map((r) => r.seamKey)).toEqual(['mine']);
    expect(got.poses.map((r) => r.seamKey)).toEqual(['p-mine']);
    expect(removalRows(got).map((r) => r.seamKey)).toEqual(['mine', 'p-mine']);
  });

  it('judges by the links the undo record keeps, not the row before the binding teardown', () => {
    const got = seamsOnlyOfStep(card, 0, { seamKeys: ['shared'], poseKeys: [] });
    expect(got).toEqual({ seams: [], poses: [] });
  });

  it('names nothing for a step without links or a key the store does not hold', () => {
    expect(seamsOnlyOfStep({ ...card, operations: [{}, ...card.operations] }, 0)).toEqual({
      seams: [],
      poses: [],
    });
    expect(seamsOnlyOfStep(card, 0, { seamKeys: ['ghost'] })).toEqual({ seams: [], poses: [] });
  });
});

describe('seam restore on undo', () => {
  it('writes back only the rows that are gone and lets the refusal count them', () => {
    const saved = { seams: [seam('mine'), seam('kept', 'A9')], poses: [pose('p-mine')] };
    const plan = seamRestorePlan(saved, { seams: [seam('kept', 'A9')], poses: [] });
    expect(plan.seams.map((r) => r.seamKey)).toEqual(['mine']);
    expect(plan.poses.map((r) => r.seamKey)).toEqual(['p-mine']);
    expect([...restorableSeamKeys(new Set(['kept']), saved)].sort()).toEqual([
      'kept',
      'mine',
      'p-mine',
    ]);
  });

  it('a pair stored again under another key is not written twice; the step links that key', () => {
    const plan = seamRestorePlan(
      { seams: [seam('old')], poses: [] },
      { seams: [seam('new')], poses: [] },
    );
    expect(plan.seams).toEqual([]);
    const keyMap = restoredKeyMap(plan.saved, [seam('new')]);
    expect(keyMap).toEqual({ old: 'new' });
    expect(relinkRestoredStep({ seamKeys: ['old', 'new', 'x'] }, keyMap!).seamKeys).toEqual([
      'new',
      'x',
    ]);
  });

  it('two saved rows of one pair are written once', () => {
    const plan = seamRestorePlan(
      { seams: [seam('a'), seam('b')], poses: [] },
      { seams: [], poses: [] },
    );
    expect(plan.seams.map((r) => r.seamKey)).toEqual(['a']);
    expect(restoredKeyMap(plan.saved, plan.seams)).toEqual({ b: 'a' });
  });

  it('puts rows back before the step, links read after the write', async () => {
    const order: string[] = [];
    const plan = seamRestorePlan(
      { seams: [seam('mine')], poses: [pose('p-mine')] },
      { seams: [], poses: [] },
    );
    let now: StoredSeam[] = [];
    const io = {
      upsert: vi.fn(async () => {
        order.push('rows');
        // another tab stored the same pair meanwhile: upsert landed the row on that key
        now = [seam('theirs')];
        return true;
      }),
      upsertPoses: vi.fn(async () => (order.push('poses'), true)),
      seamsNow: () => now,
      restoreStep: vi.fn(() => void order.push('step')),
    };
    await expect(runSeamRestore(plan, io)).resolves.toBe(true);
    expect(order).toEqual(['rows', 'poses', 'step']);
    expect(io.restoreStep).toHaveBeenCalledWith({ mine: 'theirs' });
  });

  it('no step when a write is refused or a row is not on the card after it', async () => {
    const plan = seamRestorePlan({ seams: [seam('mine')], poses: [] }, { seams: [], poses: [] });
    const refused = {
      upsert: vi.fn(async () => false),
      upsertPoses: vi.fn(),
      seamsNow: () => [],
      restoreStep: vi.fn(),
    };
    await expect(runSeamRestore(plan, refused)).resolves.toBe(false);
    const lost = { ...refused, upsert: vi.fn(async () => true) };
    await expect(runSeamRestore(plan, lost)).resolves.toBe(false);
    expect(refused.restoreStep).not.toHaveBeenCalled();
  });

  it('nothing to write still puts the step back', async () => {
    const io = { upsert: vi.fn(), upsertPoses: vi.fn(), seamsNow: () => [], restoreStep: vi.fn() };
    await expect(runSeamRestore({ seams: [], poses: [], saved: [] }, io)).resolves.toBe(true);
    expect(io.upsert).not.toHaveBeenCalled();
    expect(io.restoreStep).toHaveBeenCalledWith({});
  });
});

describe('seamWritesInFlight', () => {
  it('holds the undo while a seam or pose write is in flight', () => {
    expect(seamWritesInFlight({ pending: {}, posePending: {} })).toBe(false);
    expect(seamWritesInFlight({ pending: { k: {} }, posePending: {} })).toBe(true);
    expect(seamWritesInFlight({ pending: {}, posePending: { p: {} } })).toBe(true);
  });
});
