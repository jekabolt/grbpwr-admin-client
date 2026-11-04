// The OPERATION column's fold lines: one per fold or pleat a step closes, in the piece's own upright
// view, whatever way the step picture lays the piece. Never a key: only the printed piece name.

import { foldedOutline, type StoredFold } from 'lib/folds';
import { foldGroupsOf, type FoldGroup } from '../components/assembly-folds/fold-model';
import { assemblyPieceCode } from './assembly-piece-code';
import { own, type PdfT } from './i18n';
import type { AsmPiece } from './derive-assembly';

const ARROW = { pleat: '', pleat_l: ' ←', pleat_r: ' →' } as const;

function lineOf(group: FoldGroup, piece: AsmPiece, name: string, t: PdfT): string {
  if (group.kind === 'in') return t('assembly.foldIn', { piece: name });
  if (group.kind === 'out') return t('assembly.foldOut', { piece: name });
  if (group.kind === 'double') return t('assembly.foldDouble', { piece: name });
  const pleat = group.complete ? foldedOutline(piece.geom.rs, group.flat).pleats[0] : undefined;
  if (!pleat) return t('assembly.pleatPlain', { piece: name });
  const mm = Math.round(pleat.openingMm);
  return `${t('assembly.pleat', { piece: name, mm })}${ARROW[pleat.kind]}`;
}

/** A row that cannot be laid on this size prints nothing: its picture stays flat too. */
export function foldLinesOf(
  foldKeys: readonly string[] | undefined,
  rows: readonly StoredFold[],
  pieces: ReadonlyMap<string, AsmPiece>,
  grainDeg: ReadonlyMap<string, number>,
  t: PdfT,
): string[] {
  const linked = new Set(foldKeys ?? []);
  if (!linked.size) return [];
  const ownRows = rows.filter((row) => linked.has(row.foldKey));
  return [...pieces].flatMap(([key, piece]) => {
    if (!ownRows.some((row) => row.pieceKey.toUpperCase() === key.toUpperCase())) return [];
    const inner = piece.inner.map((line) => line.map(([x, y]): [number, number] => [x, -y]));
    const name = assemblyPieceCode(piece.code, piece.name) || own(piece.name);
    return foldGroupsOf(piece.geom, rows, grainDeg.get(key) ?? 0, inner)
      .groups.filter((group) => group.rows.some((row) => linked.has(row.foldKey)))
      .sort((a, b) => a.rows[0].seq - b.rows[0].seq)
      .map((group) => lineOf(group, piece, name, t));
  });
}
