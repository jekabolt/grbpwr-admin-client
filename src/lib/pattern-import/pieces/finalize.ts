import type { PieceEdit } from '../types';
import { applyPieceEdits } from './edits';
import { exceptNested } from './fill';
import { holeGuard } from './holes';
import { cleanNotchMarks } from './notch-marks';
import type { PieceSession } from './operator';

/** Geometry shown on the pieces step, including any family-wide cleanup after a refill. */
export function finalizePieces(session: PieceSession, edits: PieceEdit[] = []) {
  const { families, sheet, set, run, opts, walls } = session;
  const edited = edits.length
    ? applyPieceEdits(families, edits, { sheet, set, run, opts, walls })
    : families;
  return cleanNotchMarks(holeGuard(exceptNested(edited), set, sheet.holes), set);
}
