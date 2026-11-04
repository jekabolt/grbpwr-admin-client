// Which edge a hem step turns, read from geometry and stored rows alone: never a piece name or code.
//
// The step's own row naming an edge of its input wins and nothing else runs. Otherwise the hem is
// the free run at the bottom of each input piece: «bottom» in the piece's seam frame (lib/seams
// frame: grain-upright, the frame stored rows and the fold picker use), «free» after taking out every
// edge a seam or closure row of the card names and every edge a stored fold runs along. A free centre
// front loses by geometry: it runs along the grain, so it is no bottom at all. Nothing certain → no
// edge and a reason, never a guess.
//
// Plain data in, plain data out: techpack derive and the doll hand it the pieces of one size.

import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import type { Edge, EdgeId, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { resolveFolds } from 'lib/folds';
import { edgeAlong, fromUV } from 'lib/folds/geom';
import { FOLDS, isPleatKind, type StoredFold } from 'lib/folds/types';
import { frameOf, toUV, type PieceFrame } from 'lib/seams/frame';
import { resolveSeamDecisions } from 'lib/seams/resolve';
import { expandSidePart, type SidePart } from 'lib/seams/span';
import type { AnchorHit, EdgeAnchor, StoredSeam } from 'lib/seams/types';

export const HEM_EDGE = {
  /** An edge further than this from across the grain runs along the piece: never a bottom. */
  acrossGrainDeg: 45,
  /** Mean height of a bottom edge, as a share of the piece's height. */
  lowV: 0.15,
  /** A bottom reaches this low; a run that does not is above something lower. */
  reachV: 0.05,
  /** Two runs of the piece closer in mean height than this are the same level: ambiguous. */
  tieV: 0.05,
  /** The free stretch must carry at least this share of the bottom; less is a leftover corner. */
  minFreeShare: 0.5,
} as const;

export type HemEdgeInput = {
  /** Every piece of the card on ONE size: the seam rows resolve against these. */
  pieces: readonly PieceGeom[];
  /** The step's input as piece keys, a unit already expanded to its pieces. */
  inputKeys: readonly string[];
  /** Every seam row of the card, closures and rejected rows included (poses left out). */
  seams: readonly StoredSeam[];
  /** The rows the step itself names (`seamKeys`). */
  ownSeamKeys?: readonly string[];
  /** Every stored fold of the card. */
  folds?: readonly StoredFold[];
  /** Degrees that turn each piece upright by its grain (lib/seams grainDegOf), absent = as drawn. */
  grainDeg?: ReadonlyMap<string, number>;
};

/** One continuous hem line on one piece. */
export type HemEdgeRun = {
  pieceKey: string;
  /** Walk order. */
  edges: EdgeId[];
  lenMm: number;
  /** Millimetres, the piece's `rs` frame, walk order. */
  pts: Pt2[];
  /** Lowest and highest point of the run, shares of the piece's height, grain upright. */
  v: [number, number];
};

export type HemEdgeReason = 'no-input' | 'no-free-bottom' | 'ambiguous';

export type HemEdge =
  /** The step's own row names it: `parts` keep the row's real span, `runs` stay empty. */
  | { status: 'owner'; parts: SidePart[]; runs: [] }
  | { status: 'computed'; parts: SidePart[]; runs: HemEdgeRun[] }
  | { status: 'unknown'; reason: HemEdgeReason; parts: []; runs: [] };

const unknown = (reason: HemEdgeReason): HemEdge => ({
  status: 'unknown',
  reason,
  parts: [],
  runs: [],
});

/** The edges a row names on today's geometry, per side: resolved where it can be, else its hint. */
type RowEdges = { row: StoredSeam; a: EdgeId[]; b: EdgeId[] };

function edgesOfHits(hits: readonly AnchorHit[]): EdgeId[] {
  return hits.flatMap((hit) => hit.edges);
}

/** A hint names edges (`P#3`, `P#3+4`); `outline`, inner lines (`i2`) and `P#?` name none. */
function edgesOfHint(anchor: EdgeAnchor, known: ReadonlySet<EdgeId>): EdgeId[] {
  if (!anchor.edgeHint.includes('#')) return [];
  return edgeIdsOf(anchor.edgeHint).filter((id) => known.has(id));
}

function rowEdgesOf(input: HemEdgeInput): RowEdges[] {
  const known = new Set(input.pieces.flatMap((piece) => piece.edges.map((edge) => edge.id)));
  const resolved = resolveSeamDecisions(input.seams, input.pieces, { grainDeg: input.grainDeg });
  const applied = new Map(resolved.applied.map((row) => [row.seam.seamKey, row]));
  return input.seams
    .filter((row) => row.status === 'confirmed')
    .map((row) => {
      const hit = applied.get(row.seamKey);
      // Surface rows resolve to no hits, stale and orphan rows are not applied: the hint is the word
      // left of them. An edge it may wrongly hold back costs a gap; one it lets through, a wrong line.
      return hit && (hit.a.length || hit.b.length)
        ? { row, a: edgesOfHits(hit.a), b: edgesOfHits(hit.b) }
        : {
            row,
            a: row.sideA.flatMap((anchor) => edgesOfHint(anchor, known)),
            b: row.sideB.flatMap((anchor) => edgesOfHint(anchor, known)),
          };
    });
}

/** The real span an owner row sews of one anchor, in the parts' millimetres; whole = no range. */
function ownerParts(
  row: StoredSeam,
  input: ReadonlySet<string>,
  edges: RowEdges,
  geoms: ReadonlyMap<string, PieceGeom>,
): SidePart[] {
  const named = new Set([...edges.a, ...edges.b]);
  return [...row.sideA, ...row.sideB].flatMap((anchor) => {
    if (!input.has(anchor.piece.toUpperCase())) return [];
    const ids = anchor.edgeHint.includes('#') ? edgeIdsOf(anchor.edgeHint) : [];
    const here = ids.filter((id) => named.has(id));
    if (here.length) {
      const whole = row.kind === 'edge' || row.kind === 'closure' || row.kind === 'surface';
      const from = Math.max(0, Math.min(1, anchor.range[0])) * anchor.lenMm;
      const to = Math.max(0, Math.min(1, anchor.range[1])) * anchor.lenMm;
      if (!whole && (from > 0.05 || to < anchor.lenMm - 0.05))
        return expandSidePart({ target: anchor.edgeHint, range: [from, to] }, geoms);
      return here.map((target): SidePart => ({ target }));
    }
    // The row moved on today's piece: its resolved edges stand in for the stale hint.
    return [...named]
      .filter((id) => id.toUpperCase().startsWith(`${anchor.piece.toUpperCase()}#`))
      .map((target): SidePart => ({ target }));
  });
}

/** The edges of these pieces a stored fold runs along: turned already, so nothing left to hem. */
function foldedEdges(
  folds: readonly StoredFold[],
  pieces: readonly PieceGeom[],
  grainDeg: ReadonlyMap<string, number> | undefined,
): Set<EdgeId> {
  const out = new Set<EdgeId>();
  const rows = folds.filter((row) => !isPleatKind(row.kind));
  const { folds: laid } = resolveFolds(rows, pieces, { grainDeg });
  for (const piece of pieces) {
    const frame = frameOf(piece, grainDeg?.get(piece.pieceKey) ?? 0);
    const own = rows.filter((row) => row.pieceKey.toUpperCase() === piece.pieceKey.toUpperCase());
    for (const row of own) {
      const today = laid[piece.pieceKey]?.find((fold) => fold.seq === row.seq);
      // A row that cannot be laid today still says what the owner turned: read it where it was saved.
      const line: [Pt2, Pt2] = [
        fromUV(frame, today?.a ?? row.line[0]),
        fromUV(frame, today?.b ?? row.line[1]),
      ];
      const reach = Math.max(FOLDS.edgeReachMm, (row.edge?.offsetMm ?? 0) + 1);
      const run = edgeAlong(piece, line, { edgeReachMm: reach } as Partial<typeof FOLDS>);
      if (run) run.edges.forEach((edge) => out.add(edge.id));
    }
  }
  return out;
}

type Low = { edge: Edge; index: number; vMin: number; vMax: number; vMean: number };

function lowEdge(edge: Edge, index: number, frame: PieceFrame): Low | null {
  if (edge.pts.length < 2) return null;
  const uv = edge.pts.map((point) => toUV(frame, point));
  const first = uv[0];
  const last = uv[uv.length - 1];
  const across = Math.abs((last[0] - first[0]) * frame.w);
  const along = Math.abs((last[1] - first[1]) * frame.h);
  const tilt = (Math.atan2(along, across) * 180) / Math.PI;
  if (tilt > HEM_EDGE.acrossGrainDeg) return null;
  const vs = uv.map((point) => point[1]);
  const vMean = vs.reduce((sum, v) => sum + v, 0) / vs.length;
  if (vMean > HEM_EDGE.lowV) return null;
  return { edge, index, vMin: Math.min(...vs), vMax: Math.max(...vs), vMean };
}

/** Neighbouring items of the closed loop as runs, a run across the loop's start kept whole. */
function contiguous<T extends { index: number }>(items: readonly T[], count: number): T[][] {
  const runs: T[][] = [];
  for (const item of items) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1].index + 1 === item.index) run.push(item);
    else runs.push([item]);
  }
  if (runs.length > 1) {
    const head = runs[0];
    const tail = runs[runs.length - 1];
    if (head[0].index === 0 && tail[tail.length - 1].index === count - 1) {
      runs[0] = [...tail, ...head];
      runs.pop();
    }
  }
  return runs;
}

const lenOf = (run: readonly Low[]) => run.reduce((sum, low) => sum + low.edge.lenMm, 0);
const meanV = (run: readonly Low[]) =>
  run.reduce((sum, low) => sum + low.vMean * low.edge.lenMm, 0) / Math.max(lenOf(run), 1e-6);

type PieceRead = { run: HemEdgeRun } | { none: true } | { ambiguous: true };

function bottomOf(piece: PieceGeom, frame: PieceFrame, taken: ReadonlySet<EdgeId>): PieceRead {
  const lows = piece.edges.flatMap((edge, index) => lowEdge(edge, index, frame) ?? []);
  const runs = contiguous(lows, piece.edges.length);
  if (!runs.length) return { none: true };
  const isFree = (low: Low) => !taken.has(low.edge.id);
  const lowest = runs.reduce((best, run) => (meanV(run) < meanV(best) ? run : best));
  if (Math.min(...lowest.map((low) => low.vMin)) > HEM_EDGE.reachV) return { none: true };
  // A used bottom stays used: the hem never climbs to the next free edge.
  const stretches: Low[][] = [];
  for (const low of lowest) {
    if (!isFree(low)) continue;
    const last = stretches[stretches.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && (prev.index + 1) % piece.edges.length === low.index) last.push(low);
    else stretches.push([low]);
  }
  if (!stretches.length) return { none: true };
  if (stretches.length > 1) return { ambiguous: true };
  const free = stretches[0];
  if (lenOf(free) < HEM_EDGE.minFreeShare * lenOf(lowest)) return { none: true };
  const rival = runs.some(
    (run) =>
      run !== lowest && run.some(isFree) && Math.abs(meanV(run) - meanV(lowest)) <= HEM_EDGE.tieV,
  );
  if (rival) return { ambiguous: true };
  return {
    run: {
      pieceKey: piece.pieceKey,
      edges: free.map((low) => low.edge.id),
      lenMm: lenOf(free),
      pts: free.flatMap((low, at) => (at === 0 ? low.edge.pts : low.edge.pts.slice(1))),
      v: [Math.min(...free.map((low) => low.vMin)), Math.max(...free.map((low) => low.vMax))],
    },
  };
}

/** The edges either side of a run on its own loop. */
function endNeighbours(piece: PieceGeom, run: HemEdgeRun): EdgeId[] {
  const count = piece.edges.length;
  const at = (id: EdgeId) => piece.edges.findIndex((edge) => edge.id === id);
  const first = at(run.edges[0]);
  const last = at(run.edges[run.edges.length - 1]);
  return [piece.edges[(first - 1 + count) % count].id, piece.edges[(last + 1) % count].id];
}

/**
 * Runs on several pieces of a unit are one hem only when seams carry the line from run to run: a
 * body's hem across its side seams is, a body's hem and a sleeve's wrist are two lines, and which of
 * them the step means is not in the geometry.
 */
function oneLine(
  runs: readonly HemEdgeRun[],
  byKey: ReadonlyMap<string, PieceGeom>,
  rows: readonly RowEdges[],
): boolean {
  if (runs.length < 2) return true;
  const root = runs.map((_, index) => index);
  const find = (x: number): number => (root[x] === x ? x : (root[x] = find(root[x])));
  const ends = runs.map((run) => new Set(endNeighbours(byKey.get(run.pieceKey)!, run)));
  for (const { row, a, b } of rows) {
    if (row.kind === 'closure' || row.kind === 'surface') continue;
    const touchedBy = (ids: readonly EdgeId[]) =>
      ends.flatMap((set, index) => (ids.some((id) => set.has(id)) ? [index] : []));
    for (const x of touchedBy(a))
      for (const y of touchedBy(b)) if (x !== y) root[find(x)] = find(y);
  }
  return new Set(runs.map((_, index) => find(index))).size === 1;
}

/** The hem edge of one step. See the head of this file for the rule. */
export function hemEdgeOf(input: HemEdgeInput): HemEdge {
  const keys = new Set(input.inputKeys.map((key) => key.trim().toUpperCase()).filter(Boolean));
  const pieces = input.pieces.filter(
    (piece) => keys.has(piece.pieceKey.toUpperCase()) && piece.edges.length > 0,
  );
  if (!pieces.length) return unknown('no-input');

  const rows = rowEdgesOf(input);
  const geoms = new Map(input.pieces.map((piece) => [piece.pieceKey, piece]));

  const own = new Set(input.ownSeamKeys ?? []);
  const seen = new Set<string>();
  const parts = rows
    .filter(({ row }) => own.has(row.seamKey))
    .flatMap((edges) => ownerParts(edges.row, keys, edges, geoms))
    .filter((part) => {
      const key = `${part.target}:${part.range?.[0] ?? ''}:${part.range?.[1] ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (parts.length) return { status: 'owner', parts, runs: [] };

  const taken = new Set(rows.flatMap(({ a, b }) => [...a, ...b]));
  foldedEdges(input.folds ?? [], pieces, input.grainDeg).forEach((id) => taken.add(id));

  const runs: HemEdgeRun[] = [];
  for (const piece of pieces) {
    const read = bottomOf(piece, frameOf(piece, input.grainDeg?.get(piece.pieceKey) ?? 0), taken);
    if ('ambiguous' in read) return unknown('ambiguous');
    if ('run' in read) runs.push(read.run);
  }
  if (!runs.length) return unknown('no-free-bottom');
  if (!oneLine(runs, geoms, rows)) return unknown('ambiguous');
  return {
    status: 'computed',
    parts: runs.flatMap((run) => run.edges.map((target): SidePart => ({ target }))),
    runs,
  };
}
