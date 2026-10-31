// STORED STEP ROWS, PURE. This is the non-view boundary between the owner's persisted anchors and
// the geometry engine. Result computation deliberately does not read the seam graph: a row either
// resolves against today's geometry here or contributes no placement.

import type { PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import type { EdgeAnchor, SeamPlacement, StoredSeam } from 'lib/seams';

import { innerId, parseInner, type TargetId } from './step-seams-model';
import { seamOfSides, surfaceSeam, type SeamSides } from './step-picture';

/** The edge ids and inner targets an anchor names on today's drawing (by its persisted hint). */
export function rowTargetsOfAnchor(anchor: EdgeAnchor): TargetId[] {
  const inner = /^i(\d+)$/.exec(anchor.edgeHint);
  if (inner) return [innerId(anchor.piece, Number(inner[1]))];
  const at = anchor.edgeHint.lastIndexOf('#');
  if (at < 0) return [];
  return anchor.edgeHint
    .slice(at + 1)
    .split('+')
    .map((edge) => `${anchor.piece}#${edge}`);
}

/** The two target runs and optional placement persisted by one owner row. */
export function storedSeamSides(row: StoredSeam): SeamSides & { placement?: SeamPlacement } {
  return {
    a: row.sideA.flatMap(rowTargetsOfAnchor),
    b: row.sideB.flatMap(rowTargetsOfAnchor),
    placement: [...row.sideA, ...row.sideB].find((anchor) => anchor.placement)?.placement,
  };
}

/**
 * Convert one owner row to the candidate understood by `stepLayout`. Closure rows are not joins;
 * edge, partial and composite rows share the edge path, while a surface row containing an inner
 * target takes `seamOfSides`' `surfaceSeam → alongLine` path (or its stored placement).
 */
export function candidateOfStoredSeam(
  row: StoredSeam,
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLines: ReadonlyMap<string, Pt2[][]>,
): SeamCandidate | null {
  if (row.kind === 'closure') return null;
  const { a, b, placement } = storedSeamSides(row);
  if (row.kind === 'surface') {
    // The persisted surface contract is side A = host, side B = laid part. Old rows may have lost
    // their `iN` hint; their kind still makes them a surface, placed by the stored numbers (or a
    // deterministic centre) rather than misread as an edge join.
    const host = row.sideA[0]?.piece;
    const part = row.sideB[0]?.piece;
    if (!host || !part) return null;
    const mark = a.map(parseInner).find((target) => target?.piece === host);
    const line = mark ? innerLines.get(host)?.[mark.k] ?? [] : [];
    const edge = b.find((target) => !parseInner(target));
    return surfaceSeam(host, part, line, geoms, placement, edge);
  }
  return seamOfSides({ a, b }, geoms, innerLines, placement);
}

export type StepStoredRow = {
  key: string;
  row: StoredSeam;
  candidate: SeamCandidate;
};

/** Resolve only the rows explicitly referenced by this operation, in operation key order. */
export function storedRowsOfStep(
  op: { seamKeys?: readonly string[] } | undefined,
  byKey: ReadonlyMap<string, StoredSeam>,
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLines: ReadonlyMap<string, Pt2[][]>,
): StepStoredRow[] {
  return (op?.seamKeys ?? []).flatMap((key) => {
    const row = byKey.get(key);
    const candidate = row ? candidateOfStoredSeam(row, geoms, innerLines) : null;
    return row && candidate ? [{ key, row, candidate }] : [];
  });
}
