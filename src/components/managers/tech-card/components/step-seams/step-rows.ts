// STORED STEP ROWS, PURE. This is the non-view boundary between the owner's persisted anchors and
// the geometry engine. Result computation deliberately does not read the seam graph: a row either
// resolves against today's geometry here or contributes no placement.

import type { Affine, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import { orderSideAlongOutline } from 'lib/assembly-skeleton/union';
import { apply } from 'lib/assembly-skeleton/union/affine';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import {
  expandSidePart,
  resolveSeamDecisions,
  type EdgeAnchor,
  type SeamPlacement,
  type SidePart,
  type StoredSeam,
} from 'lib/seams';

import { handRow, type AnchorCtx, type HandRowRefusal } from '../assembly-seams/seam-actions';
import { laysRow } from './live-row';
import {
  innerId,
  parseInner,
  pieceOfTarget,
  polylineLenMm,
  type FormOpLike,
  type TargetId,
} from './step-seams-model';
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
  return edgeRowOfPick(sides, geoms, anchorCtx, parts).row;
}

/** `edgeRowFromPick` with the reason ACCEPT shows when it stores nothing. */
export function edgeRowOfPick(
  sides: SeamSides,
  geoms: ReadonlyMap<string, PieceGeom>,
  anchorCtx: AnchorCtx,
  parts?: { a: readonly SidePart[]; b: readonly SidePart[] },
): { row: StoredSeam | null; refusal: HandRowRefusal } {
  const ordered = orderedPickSides(sides, geoms);
  const a = parts?.a ?? ordered.a.map((target): SidePart => ({ target }));
  const b = parts?.b ?? ordered.b.map((target): SidePart => ({ target }));
  const o = { direction: 'reversed' as const };
  // What was picked is what is sewn: a pick the run rules refuse is stored edge by edge instead.
  // Only an edge that does not resolve, or too many parts, keeps ACCEPT from saving.
  const first = handRow(a, b, geoms, anchorCtx, o);
  if (first.row) return first;
  const second = handRow(edgeByEdge(a, geoms), edgeByEdge(b, geoms), geoms, anchorCtx, o);
  return second.row || second.refusal === 'too many parts' ? second : first;
}

/** A side as single edges: chains split into their members, stretches kept on the edge they lie on. */
const edgeByEdge = (parts: readonly SidePart[], geoms: ReadonlyMap<string, PieceGeom>) =>
  parts.flatMap((part): SidePart[] =>
    part.range ? expandSidePart(part, geoms) : edgeIdsOf(part.target).map((target) => ({ target })),
  );

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
  innerLines?: ReadonlyMap<string, readonly (readonly Pt2[])[]>,
): SeamSides & {
  parts: { a: SidePart[]; b: SidePart[] };
  placement?: SeamPlacement;
} {
  const sideParts = (anchors: readonly EdgeAnchor[]): SidePart[] =>
    anchors.flatMap((anchor) => {
      const targets = rowTargetsOfAnchor(anchor);
      const inner = targets.length === 1 && !!parseInner(targets[0]);
      if (
        row.kind === 'edge' ||
        (row.kind === 'surface' && !inner) ||
        row.kind === 'closure' ||
        targets.length === 0
      )
        return targets.map((target) => ({ target }));
      const mark = inner ? parseInner(targets[0]) : null;
      const currentLine = mark ? innerLines?.get(mark.piece)?.[mark.k] : undefined;
      const length = mark
        ? currentLine?.length
          ? polylineLenMm(currentLine)
          : anchor.lenMm
        : resolveEdge(anchor.edgeHint, geoms ?? new Map())?.len ?? anchor.lenMm;
      const from = Math.max(0, Math.min(length, anchor.range[0] * length));
      const to = Math.max(from, Math.min(length, anchor.range[1] * length));
      if (from <= 0.05 && to >= length - 0.05) return targets.map((target) => ({ target }));
      return [{ target: inner ? targets[0] : anchor.edgeHint, range: [from, to] }];
    });
  const parts = { a: sideParts(row.sideA), b: sideParts(row.sideB) };
  // Two stretches of one edge name it once: `parts` holds them both.
  const targets = (anchors: readonly EdgeAnchor[]) => [
    ...new Set(anchors.flatMap(rowTargetsOfAnchor)),
  ];
  return {
    a: targets(row.sideA),
    b: targets(row.sideB),
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
  const { a, b, parts, placement } = storedSeamSides(row, geoms, innerLines);
  if (row.kind === 'surface') {
    // The persisted surface contract is side A = host, side B = laid part. Old rows may have lost
    // their `iN` hint; their kind still makes them a surface, placed by the stored numbers (or a
    // deterministic centre) rather than misread as an edge join.
    const host = row.sideA[0]?.piece;
    const part = row.sideB[0]?.piece;
    if (!host || !part) return null;
    const mark = a.map(parseInner).find((target) => target?.piece === host);
    const edge = b.find((target) => !parseInner(target));
    return mark
      ? seamOfSides(parts, geoms, innerLines, placement)
      : surfaceSeam(host, part, [], geoms, placement, edge);
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

/** Half of a seam's shorter side within this of the other side: the seam is laid. */
const SEAM_LAID_MM = 50;
const SEAM_SAMPLE_MM = 10;

function sideSamples(
  side: readonly EdgeAnchor[],
  T: ReadonlyMap<string, Affine>,
  geoms: ReadonlyMap<string, PieceGeom>,
): Pt2[] {
  return side.flatMap((anchor) => {
    const edge = resolveEdge(anchor.edgeHint, geoms);
    const at = T.get(anchor.piece);
    if (!edge || !at) return [];
    const lengths = edge.pts
      .slice(1)
      .map((point, index) =>
        Math.hypot(point[0] - edge.pts[index][0], point[1] - edge.pts[index][1]),
      );
    const total = lengths.reduce((sum, length) => sum + length, 0);
    const [start, end] = anchor.range[1] > anchor.range[0] ? anchor.range : [0, 1];
    const out: Pt2[] = [];
    let walked = 0;
    lengths.forEach((length, index) => {
      const [x0, y0] = edge.pts[index];
      const [x1, y1] = edge.pts[index + 1];
      for (
        let along = Math.ceil(walked / SEAM_SAMPLE_MM) * SEAM_SAMPLE_MM;
        along <= walked + length;
        along += SEAM_SAMPLE_MM
      ) {
        if (along < start * total || along > end * total) continue;
        const share = length ? (along - walked) / length : 0;
        out.push(apply(at, [x0 + (x1 - x0) * share, y0 + (y1 - y0) * share]));
      }
      walked += length;
    });
    return out;
  });
}

/**
 * Does this row's seam lie where it is drawn? A surface row always does; an edge row when its two
 * sides meet in the picture. A row nobody placed is seated by translation only, so a sleeve cap can
 * touch its armhole at one point and hang across the body: those pieces collide, they do not lie on
 * each other. A side that cannot be measured counts as laid.
 */
export function seamIsLaid(
  row: Pick<StoredSeam, 'kind' | 'sideA' | 'sideB'>,
  T: ReadonlyMap<string, Affine>,
  geoms: ReadonlyMap<string, PieceGeom>,
): boolean {
  if (row.kind === 'surface') return true;
  const a = sideSamples(row.sideA, T, geoms);
  const b = sideSamples(row.sideB, T, geoms);
  if (!a.length || !b.length) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const gaps = short
    .map((point) =>
      Math.min(...long.map((other) => Math.hypot(point[0] - other[0], point[1] - other[1]))),
    )
    .sort((left, right) => left - right);
  return gaps[Math.floor(gaps.length / 2)] <= SEAM_LAID_MM;
}

export type StepStoredRow = {
  key: string;
  row: StoredSeam;
  candidate: SeamCandidate;
};

/**
 * Resolve only the live rows explicitly referenced by this operation, in operation key order. A
 * stale or rejected row, or a join kept on a press / fuse / button step, lays nothing: the step is
 * drawn as if it named no such row.
 */
export function storedRowsOfStep(
  op: FormOpLike | undefined,
  byKey: ReadonlyMap<string, StoredSeam>,
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLines: ReadonlyMap<string, Pt2[][]>,
): StepStoredRow[] {
  return (op?.seamKeys ?? []).flatMap((key) => {
    const row = byKey.get(key);
    const candidate =
      row && laysRow(op, row) ? candidateOfStoredSeam(row, geoms, innerLines) : null;
    return row && candidate ? [{ key, row, candidate }] : [];
  });
}
