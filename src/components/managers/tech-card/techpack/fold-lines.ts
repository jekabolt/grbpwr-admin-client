// The OPERATION column's fold lines: one per fold or pleat a step closes, in the piece's own upright
// view, whatever way the step picture lays the piece. Never a key: only the printed piece name.

import type { Pt2 } from 'lib/assembly-skeleton/types';
import { foldedOutline, resolveFolds, type StoredFold } from 'lib/folds';
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

export type UnresolvedStepFold = { foldKey: string; piece: string; seq: number };

/**
 * The folds a step names that this size cannot lay (the piece is not in this size's pattern, the
 * row went stale, or its line no longer fits). Each one stays flat in the picture and prints no
 * line, so it goes to the card's gaps instead of vanishing. The piece is its printed code, or the
 * card's name for a piece this pattern does not hold (`nameOf`); never a key.
 */
export function unresolvedFoldsOf(
  foldKeys: readonly string[] | undefined,
  rows: readonly StoredFold[],
  pieces: ReadonlyMap<string, AsmPiece>,
  grainDeg: ReadonlyMap<string, number>,
  nameOf: (pieceKey: string) => string = () => '',
): UnresolvedStepFold[] {
  const linked = new Set(foldKeys ?? []);
  const linkedRows = rows.filter((row) => linked.has(row.foldKey));
  if (!linkedRows.length) return [];
  const byKey = new Map([...pieces].map(([key, piece]) => [key.toUpperCase(), piece]));
  const innerLines = new Map(
    [...pieces].map(([key, piece]) => [
      piece.geom.pieceKey ?? key,
      piece.inner.map((line) => line.map(([x, y]): Pt2 => [x, -y])),
    ]),
  );
  const { unresolved } = resolveFolds(
    linkedRows,
    [...pieces.values()].map((piece) => piece.geom),
    { grainDeg, innerLines },
  );
  return unresolved.map((row) => {
    const piece = byKey.get(row.pieceKey.toUpperCase());
    const code = piece ? assemblyPieceCode(piece.code, piece.name) : '';
    return { foldKey: row.foldKey, piece: code || nameOf(row.pieceKey), seq: row.seq };
  });
}
