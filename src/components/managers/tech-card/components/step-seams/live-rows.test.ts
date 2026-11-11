import { describe, expect, it } from 'vitest';

import type { StoredSeam } from 'lib/seams';

import { dollOwnerSeamsOf } from '../assembly-doll/use-doll-card';
import {
  CARD6_OPS,
  CARD6_PIECE_KEYS,
  CARD6_SEAMS,
  card6Geoms,
  card6InnerLines,
  card6Step,
} from './card6.fixture';
import { stepResults, type StepResultsInput } from './step-result';
import { liveRow } from './live-row';
import { stepHandsOf } from './step-hand';
import type { SceneOp } from './step-picture-view';
import { storedRowsOfStep } from './step-rows';
import type { FormOpLike } from './step-seams-model';

// A row the server marked stale (its sheet was re-uploaded) or the owner rejected is not a decision
// any more: the picker still lists it to be fixed, but no step picture, PDF page or doll lays by it.

const geoms = card6Geoms();
const innerLines = card6InnerLines();
const KEY = 'left sleeve slit';
const STEP = 30;

const inputWith = (
  byKey: ReadonlyMap<string, StoredSeam>,
  ops: readonly FormOpLike[] = CARD6_OPS,
): StepResultsInput => ({
  ops: [...ops],
  byKey,
  poses: new Map(),
  geoms,
  innerLines,
  pieceKeys: CARD6_PIECE_KEYS,
});

const withRow = (patch: Partial<StoredSeam>) =>
  new Map([...CARD6_SEAMS].map(([key, row]) => [key, key === KEY ? { ...row, ...patch } : row]));

const withoutKey = CARD6_OPS.map((op) =>
  op.seamKeys?.includes(KEY) ? { ...op, seamKeys: op.seamKeys.filter((k) => k !== KEY) } : op,
);

const transformsAt = (input: StepResultsInput) =>
  [...stepResults(input)[card6Step(STEP)].transforms].map(([piece, T]) => [
    piece,
    T.map((v) => Math.round(v * 1000) / 1000),
  ]);

describe('live rows: a stale or rejected seam lays nothing', () => {
  it('a fresh confirmed row is live; stale or rejected is not', () => {
    const row = CARD6_SEAMS.get(KEY)!;
    expect(liveRow(row)).toBe(true);
    expect(liveRow({ ...row, stale: true })).toBe(false);
    expect(liveRow({ ...row, status: 'rejected' })).toBe(false);
  });

  it('the step reads only live rows', () => {
    const op = CARD6_OPS[card6Step(STEP)];
    const keysOf = (byKey: ReadonlyMap<string, StoredSeam>) =>
      storedRowsOfStep(op, byKey, geoms, innerLines).map(({ key }) => key);
    expect(keysOf(CARD6_SEAMS)).toContain(KEY);
    expect(keysOf(withRow({ stale: true }))).not.toContain(KEY);
    expect(keysOf(withRow({ status: 'rejected' }))).not.toContain(KEY);
  });

  it('the step picture with a stale row is the picture without it, and comes back on re-confirm', () => {
    const fresh = transformsAt(inputWith(CARD6_SEAMS));
    const none = transformsAt(inputWith(CARD6_SEAMS, withoutKey));
    // The row really places the pieces, so the check below proves something.
    expect(fresh).not.toEqual(none);
    expect(transformsAt(inputWith(withRow({ stale: true })))).toEqual(none);
    expect(transformsAt(inputWith(withRow({ status: 'rejected' })))).toEqual(none);
    expect(transformsAt(inputWith(withRow({ stale: false })))).toEqual(fresh);
  }, 60_000);

  it('the picker picture takes no hand from a stale row', () => {
    const at = card6Step(STEP);
    expect(stepHandsOf(CARD6_OPS, at, withRow({ stale: true }))).toEqual(
      stepHandsOf(withoutKey, at, CARD6_SEAMS),
    );
  });

  it('the doll sews only live rows a step names', () => {
    const selection = (byKey: ReadonlyMap<string, StoredSeam>) =>
      dollOwnerSeamsOf({
        rows: [...byKey.values()],
        poses: new Map(),
        operations: CARD6_OPS as SceneOp[],
        geoms,
        innerLines,
        stepResults: null,
        pieceKeys: CARD6_PIECE_KEYS,
      });
    expect(selection(CARD6_SEAMS)?.inStepKeys).toContain(KEY);
    const stale = selection(withRow({ stale: true }));
    expect(stale?.inStepKeys).not.toContain(KEY);
    expect(stale?.candidates.some((c) => c.seamKey === KEY)).toBe(false);
  });
});
