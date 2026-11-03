// STEP FOLDS — what a step knows about the piece folds. A step sees every fold event at or before it;
// before its event, and with no event at all, the piece is flat. T, placements and anchors stay on
// the flat geoms: folds change drawing, hit targets and lengths only, and the one drawing helper here
// is what canvas, tile, map and print draw through (`T ∘ foldMap`).
import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import {
  activeFoldRows,
  coincidentGroups,
  foldedOutline,
  foldMap,
  resolveFolds,
  type FlatFold,
  type FoldStep,
  type StoredFold,
} from 'lib/folds';
import { frameOf, fromUV } from 'lib/folds/geom';
import type { SidePart } from 'lib/seams';
import { pickTarget } from './seam-focus';
import type { SidePick, SpanRange, SpanSide } from './span-pick';

const sameKey = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

/** The pieces whose fold closes on this very step, each with every fold it holds by then. */
export function closingFoldsOf(
  steps: readonly FoldStep[],
  index: number,
  rows: readonly StoredFold[],
): { pieceKey: string; rows: StoredFold[] }[] {
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

/** The card's stored folds, as a result pass reads them. */
export type CardFolds = {
  rows: readonly StoredFold[];
  grainDeg: ReadonlyMap<string, number>;
};

/** Folds closed at or before a step, per piece, in order. */
export type FlatFolds = ReadonlyMap<string, readonly FlatFold[]>;

export type StepFolds = {
  flat: FlatFolds;
  /** The stored rows behind `flat`: what the length and the coincident edges read. */
  rows: readonly StoredFold[];
  /** Pieces whose fold closes on this very step. */
  closing: readonly string[];
};

type RunPart = { id: string; piece: string; pts: readonly Pt2[]; lenMm: number };

const frameOfPiece =
  (geoms: ReadonlyMap<string, PieceGeom>, grainDeg: ReadonlyMap<string, number> | undefined) =>
  (piece: string) => {
    const geom = geoms.get(piece);
    return geom ? frameOf(geom, grainDeg?.get(piece) ?? 0) : null;
  };

/** Rows laid on the flat pieces. A row that cannot be laid on this size stays flat. */
function layFolds(
  rows: readonly StoredFold[],
  geoms: ReadonlyMap<string, PieceGeom>,
  grainDeg: ReadonlyMap<string, number>,
  innerLines?: ReadonlyMap<string, readonly (readonly Pt2[])[]>,
) {
  const { folds, unresolved } = resolveFolds(rows, [...geoms.values()], { grainDeg, innerLines });
  const refused = new Set(unresolved.map((row) => row.foldKey));
  const laid = new Map<string, { piece: string; seq: number; flat: FlatFold }>();
  for (const [piece, list] of Object.entries(folds)) {
    const geom = geoms.get(piece);
    if (!geom) continue;
    const frame = frameOf(geom, grainDeg.get(piece) ?? 0);
    for (const fold of list) {
      const row = rows.find(
        (candidate) =>
          sameKey(candidate.pieceKey, piece) &&
          candidate.seq === fold.seq &&
          !refused.has(candidate.foldKey),
      );
      if (!row) continue;
      laid.set(row.foldKey, {
        piece,
        seq: fold.seq,
        flat: {
          a: fromUV(frame, fold.a),
          b: fromUV(frame, fold.b),
          flipAt: fromUV(frame, fold.flipAt),
          kind: fold.kind,
        },
      });
    }
  }
  return laid;
}

/**
 * What each step of a card sees, or null when no step names a fold. Steps with the same folds share
 * one `flat`, so the drawing is folded once per fold set.
 */
export function cardFoldsOf(
  steps: readonly FoldStep[],
  card: CardFolds | undefined,
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLines?: ReadonlyMap<string, readonly (readonly Pt2[])[]>,
): ((index: number) => StepFolds | null) | null {
  if (!card?.rows.length || !steps.some((step) => step.foldKeys?.length)) return null;
  const laid = layFolds(card.rows, geoms, card.grainDeg, innerLines);
  const shared = new Map<string, FlatFolds>();
  return (index) => {
    const rows = activeFoldRows(steps, index, card.rows).flatMap((row) => {
      const fold = laid.get(row.foldKey);
      return fold ? [{ ...row, pieceKey: fold.piece }] : [];
    });
    if (!rows.length) return null;
    const signature = rows
      .map((row) => row.foldKey)
      .sort()
      .join();
    let flat = shared.get(signature);
    if (!flat) {
      const perPiece = new Map<string, { seq: number; flat: FlatFold }[]>();
      for (const row of rows) {
        const fold = laid.get(row.foldKey)!;
        perPiece.set(fold.piece, [...(perPiece.get(fold.piece) ?? []), fold]);
      }
      flat = new Map(
        [...perPiece].map(([piece, list]) => [
          piece,
          [...list].sort((a, b) => a.seq - b.seq).map((fold) => fold.flat),
        ]),
      );
      shared.set(signature, flat);
    }
    const closes = new Set(steps[index]?.foldKeys ?? []);
    const closing = [
      ...new Set(rows.filter((row) => closes.has(row.foldKey)).map((row) => row.pieceKey)),
    ];
    return { flat, rows, closing };
  };
}

// ── drawing ────────────────────────────────────────────────────────────────────────────────

const samePoint = (p: Pt2, q: Pt2) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;

// `foldMap` reads the ring to tell a line reaching the contour from a short one, so it always gets it.

/** A polyline through the folds, one line still: arc length and direction along it are kept. */
const foldedLine = (line: readonly Pt2[], ring: readonly Pt2[], folds: readonly FlatFold[]) =>
  foldMap({ rings: [ring], edges: [line], marks: [], innerLines: [] }, folds).edges.reduce<Pt2[]>(
    (out, part) => {
      const last = out[out.length - 1];
      return [...out, ...(last && part[0] && samePoint(last, part[0]) ? part.slice(1) : part)];
    },
    [],
  );

const foldedPoint = (point: Pt2, ring: readonly Pt2[], folds: readonly FlatFold[]): Pt2 =>
  foldMap({ rings: [ring], edges: [], marks: [point], innerLines: [] }, folds).marks[0] as Pt2;

const ringArea = (ring: readonly Pt2[]) =>
  Math.abs(
    ring.reduce((sum, [x, y], i) => {
      const [nx, ny] = ring[(i + 1) % ring.length];
      return sum + x * ny - nx * y;
    }, 0) / 2,
  );

/** The plies a folded piece keeps apart from its ring. `under`: hidden by the face, drawn dashed. */
export type TurnedPly = { ring: readonly Pt2[]; under: boolean };

export type FoldedDrawing = {
  geoms: ReadonlyMap<string, PieceGeom>;
  innerLines: ReadonlyMap<string, Pt2[][]> | undefined;
  turned: ReadonlyMap<string, readonly TurnedPly[]>;
};

const NO_TURNED: ReadonlyMap<string, readonly TurnedPly[]> = new Map();
const drawings = new WeakMap<
  object,
  {
    geoms: ReadonlyMap<string, PieceGeom>;
    innerLines: ReadonlyMap<string, Pt2[][]> | undefined;
    drawing: FoldedDrawing;
  }
>();

/**
 * The one helper the step picture draws through. Hands back the very maps it got when nothing is
 * folded; otherwise copies of them with each folded piece's ring, edges and inner lines mapped, edge
 * ids and `k` untouched, in the same piece frame. The flat geoms are never written.
 */
export function foldedDrawing(
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLines: ReadonlyMap<string, Pt2[][]> | undefined,
  flat: FlatFolds | undefined,
): FoldedDrawing {
  if (!flat?.size) return { geoms, innerLines, turned: NO_TURNED };
  const hit = drawings.get(flat);
  if (hit?.geoms === geoms && hit.innerLines === innerLines) return hit.drawing;

  const foldedGeoms = new Map(geoms);
  const foldedInner = innerLines ? new Map(innerLines) : undefined;
  const turned = new Map<string, readonly TurnedPly[]>();
  for (const [key, folds] of flat) {
    const geom = geoms.get(key);
    if (!geom) continue;
    const ring = foldMap({ rings: [geom.rs], edges: [], marks: [], innerLines: [] }, folds)
      .rings[0] as Pt2[];
    foldedGeoms.set(key, {
      ...geom,
      rs: ring,
      // Both index the flat ring. Snap reads them through `breakPoints`: a folded piece offers its edge ends.
      notchIdx: [],
      vertexIdx: [],
      edges: geom.edges.map((edge) => ({
        ...edge,
        pts: foldedLine(resolveEdge(edge.id, geoms)?.pts ?? edge.pts, geom.rs, folds),
      })),
    });
    const lines = innerLines?.get(key);
    if (lines)
      foldedInner?.set(
        key,
        lines.map((line) => foldedLine(line, geom.rs, folds)),
      );

    const { outline, plies } = foldedOutline(geom.rs, folds);
    const firstKept = plies.findIndex((ply) => !ply.by);
    turned.set(key, [
      ...plies.flatMap((ply, index): TurnedPly[] =>
        ply.by ? [{ ring: ply.poly, under: index < firstKept }] : [],
      ),
      // The ring is a silhouette (the larger part turned): the kept part's own edge still shows.
      ...(outline.length && Math.abs(ringArea(ring) - ringArea(outline)) > 1
        ? [{ ring: outline, under: false }]
        : []),
    ]);
  }
  const drawing: FoldedDrawing = { geoms: foldedGeoms, innerLines: foldedInner, turned };
  drawings.set(flat, { geoms, innerLines, drawing });
  return drawing;
}

/** Action lines (piece frame) through the same folds. The same array when nothing is folded. */
export function foldedActionLines<L extends { piece: string; points: readonly Pt2[] }>(
  lines: readonly L[],
  flat: FlatFolds | undefined,
  geoms: ReadonlyMap<string, PieceGeom>,
): readonly L[] {
  if (!flat?.size) return lines;
  return lines.map((line) => {
    const folds = flat.get(line.piece);
    const geom = geoms.get(line.piece);
    return folds && geom ? { ...line, points: foldedLine(line.points, geom.rs, folds) } : line;
  });
}

const DIRECTION_STEP_MM = 1e-3;

/** Action glyphs (piece frame) through the same folds, pointing the way the fold turns them. */
export function foldedActionGlyphs<
  G extends {
    piece: string;
    point: Pt2;
    direction?: Pt2;
    markBox?: { cx: number; cy: number };
  },
>(
  glyphs: readonly G[],
  flat: FlatFolds | undefined,
  geoms: ReadonlyMap<string, PieceGeom>,
): readonly G[] {
  if (!flat?.size) return glyphs;
  return glyphs.map((glyph) => {
    const folds = flat.get(glyph.piece);
    const ring = geoms.get(glyph.piece)?.rs;
    if (!folds || !ring) return glyph;
    const point = foldedPoint(glyph.point, ring, folds);
    const out: G = { ...glyph, point };
    if (glyph.direction) {
      const [dx, dy] = glyph.direction;
      const toward = foldedPoint(
        [glyph.point[0] + dx * DIRECTION_STEP_MM, glyph.point[1] + dy * DIRECTION_STEP_MM],
        ring,
        folds,
      );
      out.direction = [
        (toward[0] - point[0]) / DIRECTION_STEP_MM,
        (toward[1] - point[1]) / DIRECTION_STEP_MM,
      ];
    }
    if (glyph.markBox) {
      const [cx, cy] = foldedPoint([glyph.markBox.cx, glyph.markBox.cy], ring, folds);
      out.markBox = { ...glyph.markBox, cx, cy };
    }
    return out;
  });
}

// ── coincident edges ───────────────────────────────────────────────────────────────────────

const neverMoved = (
  part: RunPart,
  ring: readonly Pt2[] | undefined,
  folds: readonly FlatFold[] | undefined,
) =>
  !folds?.length ||
  !ring ||
  part.pts.every((point) => {
    const [x, y] = foldedPoint(point, ring, folds);
    return Math.hypot(x - point[0], y - point[1]) < 1e-6;
  });

/**
 * Keeps one edge of each run folded onto itself: the never-moved one. Manual fit lays a seam by the
 * side's middle; across a closed fold that middle is on the kept edge, not between the two flat ones.
 */
export function foldOnceOf(
  step: StepFolds,
  geoms: ReadonlyMap<string, PieceGeom>,
  grainDeg: ReadonlyMap<string, number> | undefined,
): (parts: readonly RunPart[]) => readonly string[] {
  const frames = frameOfPiece(geoms, grainDeg);
  return (parts) => {
    const byId = new Map(parts.map((part) => [part.id, part]));
    return coincidentGroups(parts, step.rows, frames).map((group) =>
      group.length > 1
        ? group.find((id) => {
            const part = byId.get(id)!;
            return neverMoved(part, geoms.get(part.piece)?.rs, step.flat.get(part.piece));
          }) ?? group[0]
        : group[0],
    );
  };
}

/** A live pick as FIT reads it: a run folded onto itself is one span, its never-moved edge. */
export function foldedFitSides<S extends { a: readonly SidePart[]; b: readonly SidePart[] }>(
  sides: S,
  step: StepFolds | undefined,
  geoms: ReadonlyMap<string, PieceGeom>,
  grainDeg: ReadonlyMap<string, number> | undefined,
): S {
  if (!step) return sides;
  const once = foldOnceOf(step, geoms, grainDeg);
  const sideOnce = (side: readonly SidePart[]) => {
    // Whole edges: partners are whole edges too, each with its own stretch of the span.
    const parts = side.flatMap(({ target }): RunPart[] => {
      const edge = resolveEdge(target, geoms);
      return edge ? [{ id: target, piece: edge.pieceKey, pts: edge.pts, lenMm: edge.len }] : [];
    });
    if (parts.length < 2) return side;
    const kept = new Set(once(parts));
    return side.filter(
      ({ target }) => kept.has(target) || !parts.some((part) => part.id === target),
    );
  };
  return { ...sides, a: sideOnce(sides.a), b: sideOnce(sides.b) };
}

/** The flat edges a click on a folded edge stands for: itself and whatever lies on it, itself first. */
export function foldPartnersOf(
  id: string,
  step: StepFolds | undefined,
  geoms: ReadonlyMap<string, PieceGeom>,
  grainDeg: ReadonlyMap<string, number> | undefined,
): string[] {
  const edge = step ? resolveEdge(id, geoms) : null;
  const geom = edge ? geoms.get(edge.pieceKey) : undefined;
  if (!step || !edge || !geom || !step.flat.has(edge.pieceKey)) return [id];
  const parts = geom.edges
    .filter((candidate) => candidate.kind === 'edge' || candidate.id === id)
    .map(
      (candidate): RunPart => ({
        id: candidate.id,
        piece: edge.pieceKey,
        pts: candidate.pts,
        lenMm: candidate.lenMm,
      }),
    );
  const group = coincidentGroups(parts, step.rows, frameOfPiece(geoms, grainDeg)).find((ids) =>
    ids.includes(id),
  );
  return group ? [id, ...group.filter((other) => other !== id)] : [id];
}

/** The same stretch on an edge folded onto this one, in that edge's own mm. */
function partnerRange(
  id: string,
  partner: string,
  range: SpanRange,
  flat: ReadonlyMap<string, PieceGeom>,
  drawn: ReadonlyMap<string, PieceGeom>,
): SpanRange | null {
  const ptsOf = (target: string) =>
    drawn.get(target.slice(0, target.lastIndexOf('#')))?.edges.find((edge) => edge.id === target)
      ?.pts;
  const from = ptsOf(id);
  const onto = ptsOf(partner);
  const fromLen = resolveEdge(id, flat)?.len ?? 0;
  const ontoLen = resolveEdge(partner, flat)?.len ?? 0;
  if (!from?.length || !onto?.length || !(fromLen > 0)) return null;
  const k = ontoLen / fromLen;
  const [startX, startY] = from[0];
  const [ontoX, ontoY] = onto[0];
  const [endX, endY] = onto[onto.length - 1];
  return Math.hypot(startX - ontoX, startY - ontoY) <= Math.hypot(startX - endX, startY - endY)
    ? [range[0] * k, range[1] * k]
    : [ontoLen - range[1] * k, ontoLen - range[0] * k];
}

/** A pick after the hand touched a folded edge: whatever lies on that edge follows it, span and all. */
export function withFoldPartners(
  pick: SidePick,
  side: SpanSide,
  id: string,
  step: StepFolds | undefined,
  geoms: ReadonlyMap<string, PieceGeom>,
  grainDeg: ReadonlyMap<string, number> | undefined,
  rules: { isInner: (id: string) => boolean; pieceOf: (id: string) => string },
): SidePick {
  const partners = foldPartnersOf(id, step, geoms, grainDeg).slice(1);
  if (!step || !partners.length) return pick;
  const on = pick[side].includes(id);
  const range = pick.spans[side][id];
  const drawn = foldedDrawing(geoms, undefined, step.flat).geoms;
  return partners.reduce<SidePick>((next, partner) => {
    const turned =
      next[side].includes(partner) === on
        ? next
        : pickTarget(next, side, partner, rules.isInner, rules.pieceOf);
    const span = on && range ? partnerRange(id, partner, range, geoms, drawn) : null;
    const own = Object.entries(turned.spans[side]).filter(([key]) => key !== partner);
    return {
      ...turned,
      spans: {
        ...turned.spans,
        [side]: Object.fromEntries(span ? [...own, [partner, span]] : own),
      },
    };
  }, pick);
}
