import { describe, expect, it } from 'vitest';
import { serverKeepsFusingStep } from './fusing-override';
import {
  dropForm,
  dropStale,
  emptyHistory,
  moveLabel,
  peekUndo,
  record,
  removeLabel,
  removeRestoreIndex,
  removeUndoRefusal,
  undoStep,
  type HistoryEntry,
} from './last-mutation';

type Row = {
  historyKey: string;
  note?: string;
  outputUnitKey?: string;
  seamKeys?: string[];
  poseKeys?: string[];
  foldKeys?: string[];
};
type RemoveEntry = Extract<HistoryEntry<Row>, { kind: 'remove' }>;

const rows = (...keys: string[]): Row[] => keys.map((historyKey) => ({ historyKey }));
const keysOf = (list: Row[]) => list.map((row) => row.historyKey);

const removal = (list: Row[], index: number, patch: Partial<RemoveEntry> = {}): RemoveEntry => ({
  kind: 'remove',
  historyKey: list[index].historyKey,
  row: structuredClone(list[index]),
  before: keysOf(list),
  issueIndexes: [],
  pieceKeys: [],
  seamKeys: [],
  bomLineKeys: [],
  label: removeLabel(index),
  ...patch,
});

/** The gesture and its inverse as `operations-field.tsx` applies them to the row array. */
function remove(list: Row[], index: number) {
  const rec = removal(list, index);
  list.splice(index, 1);
  return rec;
}
function undo(list: Row[], rec: RemoveEntry) {
  const at = removeRestoreIndex(rec.before, rec.historyKey, keysOf(list));
  list.splice(at, 0, structuredClone(rec.row));
}

const noRefusalState = (list: Row[]) => ({
  rowKeys: keysOf(list),
  pieceKeys: new Set<string>(),
  seamKeys: new Set<string>(),
  bomLineKeys: new Set<string>(),
});

describe('undo of a removed step', () => {
  it.each([
    ['first', 0],
    ['middle', 2],
    ['last', 4],
  ])('returns the %s step to the same place', (_name, index) => {
    const list = rows('a', 'b', 'c', 'd', 'e');
    undo(list, remove(list, index));
    expect(keysOf(list)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('undoes two removals one at a time, in reverse order', () => {
    const list = rows('a', 'b', 'c', 'd');
    const first = remove(list, 1);
    const second = remove(list, 1);
    expect(keysOf(list)).toEqual(['a', 'd']);
    undo(list, second);
    expect(keysOf(list)).toEqual(['a', 'c', 'd']);
    undo(list, first);
    expect(keysOf(list)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns the row whole: unit, seams, poses and folds', () => {
    const step: Row = {
      historyKey: 'b',
      note: 'n',
      outputUnitKey: 'BLOCK',
      seamKeys: ['S1'],
      poseKeys: ['P1'],
      foldKeys: ['F1'],
    };
    const list = [...rows('a'), step, ...rows('c')];
    const rec = remove(list, 1);
    undo(list, rec);
    expect(list[1]).toEqual(step);
    list[1].seamKeys?.push('later');
    expect(rec.row.seamKeys).toEqual(['S1']);
  });

  it('keeps its place after another edit moved the rows', () => {
    const list = rows('a', 'b', 'c', 'd');
    const rec = remove(list, 2);
    const [moved] = list.splice(0, 1);
    list.push(moved);
    expect(keysOf(list)).toEqual(['b', 'd', 'a']);
    undo(list, rec);
    expect(keysOf(list)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('falls back over a neighbour that is gone', () => {
    const list = rows('a', 'b', 'c');
    const rec = remove(list, 2);
    list.splice(1, 1);
    undo(list, rec);
    expect(keysOf(list)).toEqual(['a', 'c']);
    const head = rows('x', 'y');
    const headRec = remove(head, 1);
    head.splice(0, 1);
    undo(head, headRec);
    expect(keysOf(head)).toEqual(['y']);
  });

  it('survives a field edit, and no record with a position survives with it', () => {
    const list = rows('a', 'b');
    const created: HistoryEntry<Row> = {
      kind: 'append',
      index: 1,
      fieldId: 'f',
      row: list[1],
      label: 'create step 20',
    };
    const move: HistoryEntry<Row> = { kind: 'move', back: [], forward: [], label: moveLabel(1) };
    const rec = removal(list, 0);
    const h = record(record(record(emptyHistory<Row>(), created), move), rec);
    expect(dropStale(h).undo).toEqual([move, rec]);
    expect(dropForm(h).undo).toEqual([move]);
    const once = dropStale(h);
    expect(dropStale(once)).toBe(once);
  });

  it('moves to redo and drops from redo on a new gesture', () => {
    const list = rows('a', 'b');
    const rec = removal(list, 0);
    const undone = undoStep(record(emptyHistory<Row>(), rec));
    expect(peekUndo(undone)).toBeNull();
    expect(undone.redo).toEqual([rec]);
    expect(dropStale(undone).redo).toEqual([]);
  });

  it('refuses instead of returning the step short of anything it named', () => {
    const list = rows('a');
    const rec = removal(list, 0, {
      pieceKeys: ['PIECE'],
      seamKeys: ['SEAM'],
      bomLineKeys: ['LINE'],
    });
    const whole = {
      rowKeys: [],
      pieceKeys: new Set(['PIECE']),
      seamKeys: new Set(['SEAM']),
      bomLineKeys: new Set(['LINE']),
    };
    expect(removeUndoRefusal(rec, whole)).toBeNull();
    expect(removeUndoRefusal(rec, { ...whole, rowKeys: ['a'] })).toBe('step is back');
    expect(removeUndoRefusal(rec, { ...whole, pieceKeys: new Set() })).toBe('piece deleted');
    expect(removeUndoRefusal(rec, { ...whole, seamKeys: new Set() })).toBe('seam deleted');
    expect(removeUndoRefusal(rec, { ...whole, bomLineKeys: new Set() })).toBe('material deleted');
    expect(removeUndoRefusal(removal(list, 0), noRefusalState([]))).toBeNull();
  });
});

describe('the step the server puts back on save', () => {
  const fused = [
    { lineKey: 'CLR', fused: true },
    { lineKey: 'BODY', fused: false },
  ];
  const fuse = {
    operationType: 'TECH_CARD_OPERATION_TYPE_FUSING',
    inputKeys: ['CLR'],
    draft: true,
  };

  it('is the draft fuse step of a piece still fused', () => {
    expect(serverKeepsFusingStep(fuse, fused)).toBe(true);
    expect(serverKeepsFusingStep({ ...fuse, inputKeys: [], pieceLineKeys: ['CLR'] }, fused)).toBe(
      true,
    );
  });

  it('is not a reviewed fuse step, an unfused piece or another kind of step', () => {
    expect(serverKeepsFusingStep({ ...fuse, draft: false }, fused)).toBe(false);
    expect(serverKeepsFusingStep({ ...fuse, inputKeys: ['BODY'] }, fused)).toBe(false);
    expect(
      serverKeepsFusingStep({ ...fuse, operationType: 'TECH_CARD_OPERATION_TYPE_PRESS' }, fused),
    ).toBe(false);
    expect(serverKeepsFusingStep(undefined, fused)).toBe(false);
  });
});
