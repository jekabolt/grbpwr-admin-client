// WHERE NEW FOLDS GO IN A PIECE'S ORDER. The server keeps `seq` in 1..16 per piece and refuses a
// write after which a later fold closes on an earlier step than a smaller one. Deleting never closes
// the holes, so `max + 1` runs out after sixteen creations however few folds are left, and a fold
// whose kind changes from one row to two must keep its place, not jump to the end of the piece.
//
// One placement for every writer: the new rows' seqs and the rows that have to move to make room,
// all sent in ONE upsert (the server checks seq uniqueness and step order after the whole call).

/** The most folds one piece holds (`TechCardPieceFoldMaxSeq` on the server). */
export const FOLD_MAX_SEQ = 16;

type SeqRow = { foldKey: string; seq: number; stale?: boolean };

export type FoldPlace<R extends SeqRow> =
  | {
      /** The seqs of the new rows, in order. */
      seqs: number[];
      /** Kept rows with a new seq, to send in the same write. */
      moved: R[];
    }
  | {
      /** `full`: no room on the piece. `stale`: making room would silently re-confirm a stale row. */
      refused: 'full' | 'stale';
    };

/**
 * Seqs for `count` new rows on one piece.
 * - `replaced`: rows the new ones take the place of (a kind change); they go where the first was.
 * - else `step`: the step the new rows close on; they go after every fold closing on that step or
 *   earlier and before every fold closing on a later one, so linking them is never out of order.
 * - else the end of the piece.
 * Kept seqs stay when the room is there; only the rows that must move are moved, order kept.
 */
export function placeFolds<R extends SeqRow>(
  own: readonly R[],
  opts: {
    count: number;
    replaced?: readonly string[];
    step?: number | null;
    stepOf?: (foldKey: string) => number | null;
  },
): FoldPlace<R> {
  const gone = new Set(opts.replaced ?? []);
  const kept = own.filter((row) => !gone.has(row.foldKey)).sort((a, b) => a.seq - b.seq);
  if (kept.length + opts.count > FOLD_MAX_SEQ) return { refused: 'full' };

  let at = kept.length;
  const replacedSeqs = own.filter((row) => gone.has(row.foldKey)).map((row) => row.seq);
  if (replacedSeqs.length) {
    const first = Math.min(...replacedSeqs);
    at = kept.filter((row) => row.seq < first).length;
  } else if (opts.step !== null && opts.step !== undefined && opts.stepOf) {
    const step = opts.step;
    const stepOf = opts.stepOf;
    const fits = (index: number) =>
      kept.every((row, k) => {
        const s = stepOf(row.foldKey);
        if (s === null) return true;
        return k < index ? s <= step : s >= step;
      });
    // The latest place that keeps the order, the end when the piece is already out of order.
    for (let index = kept.length; index >= 0; index--) {
      if (fits(index)) {
        at = index;
        break;
      }
    }
  }

  const lo = at > 0 ? kept[at - 1].seq : 0;
  const seqs = Array.from({ length: opts.count }, (_, i) => lo + 1 + i);

  // Push the following rows up only as far as they must go.
  const next = new Map<string, number>();
  let free = lo + opts.count + 1;
  for (const row of kept.slice(at)) {
    const seq = Math.max(row.seq, free);
    next.set(row.foldKey, seq);
    free = seq + 1;
  }
  let place: { seqs: number[]; seqOf: Map<string, number> } = { seqs, seqOf: next };
  if (free - 1 > FOLD_MAX_SEQ) {
    // No room after: renumber the whole piece 1..n, the new rows at their place.
    const seqOf = new Map<string, number>();
    kept.forEach((row, k) => seqOf.set(row.foldKey, k < at ? k + 1 : k + 1 + opts.count));
    place = { seqs: Array.from({ length: opts.count }, (_, i) => at + 1 + i), seqOf };
  }
  const moved = kept.flatMap((row) => {
    const seq = place.seqOf.get(row.foldKey);
    return seq !== undefined && seq !== row.seq ? [{ ...row, seq }] : [];
  });
  // A write re-fingerprints every row it names: moving a stale row would confirm it unseen.
  if (moved.some((row) => row.stale)) return { refused: 'stale' };
  return { seqs: place.seqs, moved };
}

/** The inbox words for a refused placement. */
export const FOLD_PLACE_REFUSAL: Record<'full' | 'stale', [string, string]> = {
  full: ['16 folds max', 'remove a fold first'],
  stale: ['stale folds', 'confirm stale folds first'],
};
