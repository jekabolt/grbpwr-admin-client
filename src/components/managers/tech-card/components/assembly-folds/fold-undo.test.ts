import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoredFold } from 'lib/folds';
import { markLinkOwed, owedLinks } from '../card-owed';
import { planFoldReplay } from './fold-links-keep';
import {
  dropFoldUndo,
  emptyFoldUndo,
  foldUndoBaseline,
  foldUndoMoved,
  foldUndoScrub,
  loadFoldUndo,
  planFoldUndo,
  saveFoldUndo,
  undoLinkWrites,
  type FoldUndoState,
} from './fold-undo';

const NOW = 1_000_000_000_000;
const CARD = 7;

const fold = (foldKey: string, pieceKey: string, seq = 1) =>
  ({ foldKey, pieceKey, seq, kind: 'inward' }) as StoredFold;
const piece = (lineKey: string) => ({ lineKey });
type Op = { historyKey: string; operationNumber: number; foldKeys: string[] };
const op = (historyKey: string, operationNumber: number, foldKeys: string[] = []): Op => ({
  historyKey,
  operationNumber,
  foldKeys,
});

const P = '01HPIECEP';
const Q = '01HPIECEQ';
const fP1 = fold('fold-p1', P);
const fQ1 = fold('fold-q1', Q);

/** The card before the delete: two pieces, P's fold closed on the first step. */
function start(): FoldUndoState {
  return foldUndoBaseline(
    emptyFoldUndo(CARD),
    [piece(P), piece(Q)],
    [op('s1', 10, ['fold-p1']), op('s2', 20, ['fold-q1'])],
  );
}

const world = (over: Partial<Parameters<typeof planFoldUndo>[1]> = {}) => ({
  formPieces: [piece(P), piece(Q)],
  readPieces: [piece(P), piece(Q)],
  rows: [fP1, fQ1],
  pending: {},
  saving: false,
  settled: true,
  now: NOW,
  ...over,
});

describe('D7: undo of a piece delete brings its folds back', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('remove → autosave deleted the rows → undo: the fold row and its step link come back', () => {
    // The piece leaves the form; its fold and the step that closes it are captured.
    let s = foldUndoMoved(
      start(),
      [piece(Q)],
      [op('s1', 10, ['fold-p1']), op('s2', 20, ['fold-q1'])],
      [fP1, fQ1],
      NOW,
    );
    // The save lands: the server deleted P's rows and took the key off the step.
    const stripped = [op('s1', 10), op('s2', 20, ['fold-q1'])];
    s = foldUndoMoved(s, [piece(Q)], stripped, [fQ1], NOW);
    // Undo puts the piece back in the form.
    s = foldUndoMoved(s, [piece(P), piece(Q)], stripped, [fQ1], NOW);

    // Right after the undo the read on screen may still be the one from before the delete's save; the
    // undo's own unsaved change keeps it from passing for «never deleted».
    expect(planFoldUndo(s, world({ settled: false }))).toEqual({
      upsert: [],
      writing: [],
      done: [],
      drop: [],
    });
    // The save that carries the piece has not landed: the server would refuse its fold.
    expect(planFoldUndo(s, world({ rows: [fQ1], readPieces: [piece(Q)] })).upsert).toEqual([]);
    expect(planFoldUndo(s, world({ rows: [fQ1], saving: true })).upsert).toEqual([]);

    // The read holds the piece again, without its fold: the row is written back.
    const plan = planFoldUndo(s, world({ rows: [fQ1] }));
    expect(plan.upsert).toEqual([fP1]);
    expect(plan.writing).toEqual([P.toUpperCase()]);

    // The row is stored again: its link goes back on the same step, and is owed until a read shows it.
    const writes = undoLinkWrites(
      plan.writing.map((k) => s.entries[k]),
      stripped,
      [fQ1, fP1],
      NOW,
    );
    expect(writes.attach).toEqual([{ index: 0, key: 'fold-p1' }]);
    expect(writes.owed).toEqual([{ op: 10, field: 'foldKeys', key: 'fold-p1', at: NOW }]);

    // A reload before the card save carries the link: the D5 replay puts it back.
    for (const link of writes.owed) markLinkOwed(CARD, link);
    const replay = planFoldReplay(
      owedLinks(CARD, ['foldKeys']),
      stripped,
      stripped,
      [fQ1, fP1],
      NOW,
    );
    expect(replay.attach).toEqual([{ index: 0, key: 'fold-p1' }]);
  });

  it('undo before the autosave: the folds were never deleted, nothing is written', () => {
    const ops = [op('s1', 10, ['fold-p1']), op('s2', 20, ['fold-q1'])];
    let s = foldUndoMoved(start(), [piece(Q)], ops, [fP1, fQ1], NOW);
    s = foldUndoMoved(s, [piece(P), piece(Q)], ops, [fP1, fQ1], NOW);
    const plan = planFoldUndo(s, world());
    expect(plan.upsert).toEqual([]);
    expect(plan.done).toEqual([P.toUpperCase()]);
    expect(
      undoLinkWrites(
        plan.done.map((k) => s.entries[k]),
        ops,
        [fP1, fQ1],
        NOW,
      ).attach,
    ).toEqual([]);
    expect(foldUndoScrub(s, ops, [fP1, fQ1])).toEqual([]);
  });

  it('the step is gone by the undo: the row comes back, the link is dropped', () => {
    let s = foldUndoMoved(
      start(),
      [piece(Q)],
      [op('s1', 10, ['fold-p1']), op('s2', 20)],
      [fP1, fQ1],
      NOW,
    );
    const later = [op('s2', 10)];
    s = foldUndoMoved(s, [piece(Q)], later, [fQ1], NOW);
    s = foldUndoMoved(s, [piece(P), piece(Q)], later, [fQ1], NOW);
    const plan = planFoldUndo(s, world({ rows: [fQ1] }));
    expect(plan.upsert).toEqual([fP1]);
    const writes = undoLinkWrites(
      plan.writing.map((k) => s.entries[k]),
      later,
      [fQ1, fP1],
      NOW,
    );
    expect(writes).toEqual({ attach: [], owed: [] });
  });

  it('a link that would break the fold order is dropped, the others come back', () => {
    const f1 = fold('fold-p1', P, 1);
    const f2 = fold('fold-p2', P, 2);
    let s = foldUndoBaseline(
      emptyFoldUndo(CARD),
      [piece(P)],
      [op('s1', 10, ['fold-p1']), op('s2', 20, ['fold-p2'])],
    );
    s = foldUndoMoved(s, [], [op('s1', 10, ['fold-p1']), op('s2', 20, ['fold-p2'])], [f1, f2], NOW);
    // The steps were reordered meanwhile: the second fold's step now comes first.
    const reordered = [op('s2', 10), op('s1', 20)];
    s = foldUndoMoved(s, [], reordered, [], NOW);
    s = foldUndoMoved(s, [piece(P)], reordered, [], NOW);
    const plan = planFoldUndo(
      s,
      world({ formPieces: [piece(P)], readPieces: [piece(P)], rows: [] }),
    );
    expect(plan.upsert).toEqual([f1, f2]);
    const writes = undoLinkWrites(
      plan.writing.map((k) => s.entries[k]),
      reordered,
      [f1, f2],
      NOW,
    );
    expect(writes.attach).toEqual([{ index: 1, key: 'fold-p1' }]);
  });

  it('a captured row still in flight waits', () => {
    let s = foldUndoMoved(start(), [piece(Q)], [op('s1', 10, ['fold-p1'])], [fP1, fQ1], NOW);
    s = foldUndoMoved(s, [piece(P), piece(Q)], [op('s1', 10)], [fQ1], NOW);
    const plan = planFoldUndo(
      s,
      world({ rows: [fQ1], pending: { 'fold-p1': { kind: 'delete' } } }),
    );
    expect(plan).toEqual({ upsert: [], writing: [], done: [], drop: [] });
  });

  it('a refused write drops the capture: the piece stays, nothing is retried', () => {
    let s = foldUndoMoved(start(), [piece(Q)], [op('s1', 10, ['fold-p1'])], [fP1, fQ1], NOW);
    s = foldUndoMoved(s, [piece(P), piece(Q)], [op('s1', 10)], [fQ1], NOW);
    const plan = planFoldUndo(s, world({ rows: [fQ1] }));
    s = dropFoldUndo(s, plan.writing);
    expect(s.entries).toEqual({});
    expect(planFoldUndo(s, world({ rows: [fQ1] })).upsert).toEqual([]);
  });

  it('redo while the undo waits keeps the capture; the next undo still brings the fold back', () => {
    let s = foldUndoMoved(start(), [piece(Q)], [op('s1', 10, ['fold-p1'])], [fP1, fQ1], NOW);
    s = foldUndoMoved(s, [piece(Q)], [op('s1', 10)], [fQ1], NOW);
    s = foldUndoMoved(s, [piece(P), piece(Q)], [op('s1', 10)], [fQ1], NOW);
    // Redo before the piece's save landed: the store has no row to capture any more.
    s = foldUndoMoved(s, [piece(Q)], [op('s1', 10)], [fQ1], NOW);
    expect(planFoldUndo(s, world({ formPieces: [piece(Q)], rows: [fQ1] })).upsert).toEqual([]);
    s = foldUndoMoved(s, [piece(P), piece(Q)], [op('s1', 10)], [fQ1], NOW);
    const plan = planFoldUndo(s, world({ rows: [fQ1] }));
    expect(plan.upsert).toEqual([fP1]);
    expect(
      undoLinkWrites(
        plan.writing.map((k) => s.entries[k]),
        [op('s1', 10)],
        [fQ1, fP1],
        NOW,
      ).attach,
    ).toEqual([{ index: 0, key: 'fold-p1' }]);
  });

  it('a piece without folds captures nothing; a reset re-baselines without capturing', () => {
    let s = foldUndoMoved(start(), [piece(P)], [], [fP1, fQ1], NOW);
    expect(Object.keys(s.entries)).toEqual([Q.toUpperCase()]);
    s = foldUndoBaseline(start(), [piece(Q)], []);
    expect(s.entries).toEqual({});
    s = foldUndoMoved(start(), [piece(Q), piece('01HNEW')], [], [fP1, fQ1], NOW);
    s = foldUndoMoved(s, [piece(Q)], [], [fP1, fQ1], NOW);
    expect(Object.keys(s.entries)).toEqual([P.toUpperCase()]);
  });

  it('a step the undo brought back naming a deleted fold is cleaned before the save', () => {
    let s = foldUndoMoved(start(), [piece(Q)], [op('s1', 10, ['fold-p1'])], [fP1, fQ1], NOW);
    s = foldUndoMoved(s, [piece(P), piece(Q)], [op('s1', 10, ['fold-p1', 'x'])], [fQ1], NOW);
    expect(foldUndoScrub(s, [op('s1', 10, ['fold-p1', 'x'])], [fQ1])).toEqual([
      { index: 0, foldKeys: ['x'] },
    ]);
  });

  // A reloaded page has no step identity of the old one: the wire carries none, and historyKey is minted
  // per page. A link finds its step by what the step is (kind, inputs, output, zone), and only when
  // exactly one step is that.
  const sew = (key: string, n: number, folds: string[] = []) => ({
    ...op(key, n, folds),
    operationType: 'SEW',
    zone: 'BODY',
    inputKeys: [P, Q],
    outputUnitKey: 'BODY',
  });
  const hem = (key: string, n: number, folds: string[] = []) => ({
    ...op(key, n, folds),
    operationType: 'HEM',
    zone: 'BODY',
    inputKeys: ['BODY'],
    outputUnitKey: 'BODY',
  });
  const fuse = (key: string, n: number) => ({
    ...op(key, n),
    operationType: 'FUSING',
    zone: 'BODY',
    inputKeys: [P],
    outputUnitKey: '',
  });

  /** Remove P (its fold on the sewing step) → the save deleted it → undo; then the page reloads. */
  function reloadMidUndo(): FoldUndoState {
    let s = foldUndoBaseline(
      emptyFoldUndo(CARD),
      [piece(P), piece(Q)],
      [sew('s1', 10, ['fold-p1']), hem('s2', 20)],
    );
    s = foldUndoMoved(s, [piece(Q)], [sew('s1', 10, ['fold-p1']), hem('s2', 20)], [fP1, fQ1], NOW);
    s = foldUndoMoved(s, [piece(Q)], [sew('s1', 10), hem('s2', 20)], [fQ1], NOW);
    s = foldUndoMoved(s, [piece(P), piece(Q)], [sew('s1', 10), hem('s2', 20)], [fQ1], NOW);
    saveFoldUndo(CARD, s.entries);
    return { ...emptyFoldUndo(CARD), entries: loadFoldUndo(CARD, NOW + 1000) };
  }

  it('a reload mid-undo resumes from this browser: the row and the link on the same step come back', () => {
    const ops = [sew('n1', 10), hem('n2', 20)];
    const reloaded = foldUndoBaseline(reloadMidUndo(), [piece(P), piece(Q)], ops);
    // No read yet: wait.
    expect(planFoldUndo(reloaded, world({ readPieces: null, rows: [fQ1] })).upsert).toEqual([]);
    const plan = planFoldUndo(reloaded, world({ rows: [fQ1] }));
    expect(plan.upsert).toEqual([fP1]);
    const writes = undoLinkWrites(
      plan.writing.map((k) => reloaded.entries[k]),
      ops,
      [fQ1, fP1],
      NOW,
    );
    expect(writes.attach).toEqual([{ index: 0, key: 'fold-p1' }]);
    expect(writes.owed).toEqual([{ op: 10, field: 'foldKeys', key: 'fold-p1', at: NOW }]);
  });

  it('a step renumbered after the reload: the link lands on the same step or is dropped, never on the neighbour', () => {
    // A generated step took number 10; the sewing step is 20 now.
    const renumbered = [fuse('n0', 10), sew('n1', 20), hem('n2', 30)];
    const reloaded = foldUndoBaseline(reloadMidUndo(), [piece(P), piece(Q)], renumbered);
    const plan = planFoldUndo(reloaded, world({ rows: [fQ1] }));
    const entries = plan.writing.map((k) => reloaded.entries[k]);
    expect(undoLinkWrites(entries, renumbered, [fQ1, fP1], NOW)).toEqual({
      attach: [{ index: 1, key: 'fold-p1' }],
      owed: [{ op: 20, field: 'foldKeys', key: 'fold-p1', at: NOW }],
    });
    // Two steps are that step now: no way to tell which, the link is dropped (the row still came back).
    const twins = [sew('n1', 10), sew('n3', 20), hem('n2', 30)];
    expect(undoLinkWrites(entries, twins, [fQ1, fP1], NOW)).toEqual({ attach: [], owed: [] });
    // The step changed what it is: dropped too.
    const changed = [{ ...sew('n1', 10), inputKeys: [Q] }, hem('n2', 20)];
    expect(undoLinkWrites(entries, changed, [fQ1, fP1], NOW)).toEqual({ attach: [], owed: [] });
  });

  it('a resumed capture outlives a read without the piece: the piece landing later brings the rows back', () => {
    const resumed = reloadMidUndo();
    // The reloaded page read the card before the undo's save committed.
    const early = foldUndoBaseline(resumed, [piece(Q)], [sew('n1', 10), hem('n2', 20)]);
    expect(
      planFoldUndo(early, world({ formPieces: [piece(Q)], readPieces: [piece(Q)], rows: [fQ1] })),
    ).toEqual({ upsert: [], writing: [], done: [], drop: [] });
    // That save lands; a later read holds the piece.
    const later = foldUndoMoved(
      early,
      [piece(P), piece(Q)],
      [sew('n1', 10), hem('n2', 20)],
      [fQ1],
      NOW,
    );
    expect(planFoldUndo(later, world({ rows: [fQ1] })).upsert).toEqual([fP1]);

    // An hour on, nobody's undo any more.
    expect(
      planFoldUndo(
        early,
        world({
          formPieces: [piece(Q)],
          readPieces: [piece(Q)],
          rows: [fQ1],
          now: NOW + 2 * 60 * 60_000,
        }),
      ).drop,
    ).toEqual([P.toUpperCase()]);

    // Only armed captures are kept in storage, and only for a while.
    saveFoldUndo(CARD, {});
    expect(loadFoldUndo(CARD, NOW)).toEqual({});
    saveFoldUndo(CARD, resumed.entries);
    expect(loadFoldUndo(CARD, NOW + 2 * 60 * 60_000)).toEqual({});
  });
});
