// STEP FOLDS — what a step knows about the piece folds. A step sees every fold event at or before it;
// before its event, and with no event at all, the piece is flat.
import { activeFoldRows, type FoldStep, type StoredFold } from 'lib/folds';

/** The one read of `operations[].foldKeys`. No key on any op: flat everywhere. */
export const foldStepsOf = (ops: readonly unknown[]): readonly FoldStep[] =>
  ops as readonly FoldStep[]; // foldKeys: typed once the T19 client lands

const sameKey = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

/** The pieces whose fold closes on this very step, each with every fold it holds by then. */
export function closingFoldsOf(
  ops: readonly unknown[],
  index: number,
  rows: readonly StoredFold[],
): { pieceKey: string; rows: StoredFold[] }[] {
  const steps = foldStepsOf(ops);
  const closing = new Set(steps[index]?.foldKeys ?? []);
  if (!closing.size) return [];
  const active = activeFoldRows(steps, index, rows);
  const out: { pieceKey: string; rows: StoredFold[] }[] = [];
  for (const row of active) {
    if (!closing.has(row.foldKey) || out.some((hit) => sameKey(hit.pieceKey, row.pieceKey)))
      continue;
    out.push({
      pieceKey: row.pieceKey,
      rows: active.filter((other) => sameKey(other.pieceKey, row.pieceKey)),
    });
  }
  return out;
}
