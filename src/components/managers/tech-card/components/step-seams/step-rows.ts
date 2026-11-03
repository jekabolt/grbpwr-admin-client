// STORED STEP ROWS, PURE. This is the non-view boundary between the owner's persisted anchors and
// the geometry engine. Result computation deliberately does not read the seam graph: a row either
// resolves against today's geometry here or contributes no placement.

import type { PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import { orderSideAlongOutline } from 'lib/assembly-skeleton/union';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import {
  resolveSeamDecisions,
  type EdgeAnchor,
  type SeamPlacement,
  type SidePart,
  type StoredSeam,
} from 'lib/seams';

import { rowFromHand, type AnchorCtx } from '../assembly-seams/seam-actions';
import { innerId, parseInner, pieceOfTarget, type TargetId } from './step-seams-model';
import { seamOfSides, surfaceSeam, type SeamSides } from './step-picture';

/** A suggestion tile opens with its unit pair selected; every other picker entry stays empty. */
export function initialPickerPick(
  proposal: SeamSides | null | undefined,
  fromSuggestionTile: boolean,
  unitStep: boolean,
): { a: TargetId[]; b: TargetId[] } | null {
  return proposal && fromSuggestionTile && unitStep
    ? { a: [...proposal.a], b: [...proposal.b] }
    : null;
}

/** Edges clicked out of order still run along each piece's outline. */
export function orderedPickSides(sides: SeamSides, geoms: ReadonlyMap<string, PieceGeom>) {
  const along = (ids: readonly string[]) => {
    const byPiece = new Map<string, string[]>();
    ids.forEach((id) => {
      const piece = pieceOfTarget(id);
      byPiece.set(piece, [...(byPiece.get(piece) ?? []), id]);
    });
    return [...byPiece.values()].flatMap((run) => orderSideAlongOutline(run, geoms));
  };
  return { a: along(sides.a), b: along(sides.b) };
}

/** Build the edge row written by ACCEPT, independent of how the step's inputs are grouped. */
export function edgeRowFromPick(
  sides: SeamSides,
  geoms: ReadonlyMap<string, PieceGeom>,
  anchorCtx: AnchorCtx,
  parts?: { a: readonly SidePart[]; b: readonly SidePart[] },
): StoredSeam | null {
  const ordered = orderedPickSides(sides, geoms);
  return rowFromHand(parts?.a ?? ordered.a, parts?.b ?? ordered.b, geoms, anchorCtx, {
    direction: 'reversed',
  });
}

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
export function storedSeamSides(
  row: StoredSeam,
  geoms?: ReadonlyMap<string, PieceGeom>,
): SeamSides & {
  parts: { a: SidePart[]; b: SidePart[] };
  placement?: SeamPlacement;
} {
  const sideParts = (anchors: readonly EdgeAnchor[]): SidePart[] =>
    anchors.flatMap((anchor) => {
      const targets = rowTargetsOfAnchor(anchor);
      if (
        row.kind === 'edge' ||
        row.kind === 'surface' ||
        row.kind === 'closure' ||
        targets.length === 0
      )
        return targets.map((target) => ({ target }));
      const length = resolveEdge(anchor.edgeHint, geoms ?? new Map())?.len ?? anchor.lenMm;
      const from = Math.max(0, Math.min(length, anchor.range[0] * length));
      const to = Math.max(from, Math.min(length, anchor.range[1] * length));
      if (from <= 0.05 && to >= length - 0.05) return targets.map((target) => ({ target }));
      return [{ target: anchor.edgeHint, range: [from, to] }];
    });
  const parts = { a: sideParts(row.sideA), b: sideParts(row.sideB) };
  return {
    a: row.sideA.flatMap(rowTargetsOfAnchor),
    b: row.sideB.flatMap(rowTargetsOfAnchor),
    parts,
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
  const { a, b, parts, placement } = storedSeamSides(row, geoms);
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
  const hasRealRange =
    (row.kind === 'partial' || row.kind === 'composite') &&
    [...row.sideA, ...row.sideB].some(
      (anchor) =>
        anchor.range[1] > anchor.range[0] && (anchor.range[0] > 0.0001 || anchor.range[1] < 0.9999),
    );
  if (hasRealRange) {
    const resolved = resolveSeamDecisions([row], [...geoms.values()]).applied[0]?.candidate;
    return resolved ? { ...resolved, sewn: true } : null;
  }
  return seamOfSides(parts, geoms, innerLines, placement);
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
