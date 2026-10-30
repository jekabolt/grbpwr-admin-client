// THE STEP PICTURE, PURE (seam picker v2, owner OK 27.10): a step's inputs drawn as UNITS — each
// input's leaf pieces laid as assembled by the card's own placer (`unionLayout`, the one the unit
// pictograms and the assembly map use), the inputs laid along the step's seam and then pulled
// apart, like the map's PairShape. The picker, its RESULT panel and the SEAMS row tile share it.
//
// Frames. A piece's segmentation (`PieceGeom`: `rs`, edges) is mm with y UP; the layout keeps that
// frame (an affine per piece). Only `fitBox` turns it into screen px with y DOWN. The drawing
// frame's inner lines (y down) come in as [x, −y].

import type { Affine, EdgeId, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import { readName } from 'lib/assembly-skeleton/skeleton/model';
import { ROLE_BOOK } from 'lib/assembly-skeleton/skeleton/template';
import {
  pairOverlap,
  pieceKeyOf,
  pieceTilt,
  rasterize,
  resolveEdge,
  runOf,
  sidewaysTrials,
  unionLayout,
  type Raster,
  type RunPart,
} from 'lib/assembly-skeleton/union';
import { apply, compose, IDENTITY, rigid, translate } from 'lib/assembly-skeleton/union/affine';
import { unitDisplayName } from 'lib/assembly-unit-name';
import type { SeamPlacement } from 'lib/seams';
import { handTargetsOf, laidHands, snapHand, type HandOn, type LaidHand } from './step-hand';
import { GUESS_OK, parseInner, pieceOfTarget, type SewnPair } from './step-seams-model';

export type Box = { x0: number; y0: number; x1: number; y1: number };
/** One seam as two lists of edges (a side may run over several edges). */
export type SeamSides = { a: readonly EdgeId[]; b: readonly EdgeId[] };

export function boxOf(pts: Iterable<Pt2>): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 1, y1: 1 };
}

export function centroidOf(pts: readonly Pt2[]): Pt2 {
  if (pts.length === 0) return [0, 0];
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

/** The x where each side of the ring crosses the height y, sorted — inside between pairs. */
function crossingsAt(ring: readonly Pt2[], y: number): number[] {
  const xs: number[] = [];
  for (let i = 0, n = ring.length; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (a[1] === b[1]) continue;
    if (y < Math.min(a[1], b[1]) || y >= Math.max(a[1], b[1])) continue;
    xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }
  return xs.sort((p, q) => p - q);
}

/** Whether a point lies inside a ring (even–odd). */
export function insideRing(p: Pt2, ring: readonly Pt2[]): boolean {
  const xs = crossingsAt(ring, p[1]);
  let inside = false;
  for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k] <= p[0] && p[0] < xs[k + 1]) inside = true;
  return inside;
}

/**
 * A spot inside a shape for its name: the middle of the widest run across the shape at its centre
 * height — or near it, when the centre line is narrow (a notch, a neck) — never in a gap.
 */
export function spotInside(ring: readonly Pt2[]): Pt2 {
  const b = boxOf(ring);
  const cy = (b.y0 + b.y1) / 2;
  const h = b.y1 - b.y0;
  const runs = [0, -1 / 8, 1 / 8, -1 / 4, 1 / 4].map((dy) => {
    const y = cy + dy * h;
    const xs = crossingsAt(ring, y);
    let best: { at: Pt2; w: number } | null = null;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const w = xs[k + 1] - xs[k];
      if (!best || w > best.w) best = { at: [(xs[k] + xs[k + 1]) / 2, y], w };
    }
    return best;
  });
  const widest = runs.reduce((m, r) => (r && (!m || r.w > m.w) ? r : m), null);
  if (!widest) return [(b.x0 + b.x1) / 2, cy];
  const centre = runs[0];
  return centre && centre.w >= 0.6 * widest.w ? centre.at : widest.at;
}

const EVIDENCE: SeamCandidate['evidence'] = {
  dLenMm: 0,
  relLen: 0,
  notchScore: null,
  curvature: 'flat',
  hand: 'neutral',
  twin: 'none',
  self: false,
};

/**
 * A pick / proposal / stored pair as a seam the placer reads: each side by its longest edge that
 * the geometry holds. Inner lines and same-piece pairs place nothing → null.
 */
export function candidateOf(
  s: SeamSides,
  geoms: ReadonlyMap<string, PieceGeom>,
): SeamCandidate | null {
  const longest = (ids: readonly EdgeId[]) => {
    let best: { id: EdgeId; len: number } | null = null;
    for (const id of ids) {
      const e = resolveEdge(id, geoms);
      if (e && (!best || e.len > best.len)) best = { id, len: e.len };
    }
    return best?.id ?? null;
  };
  const a = longest(s.a);
  const b = longest(s.b);
  if (!a || !b || pieceKeyOf(a) === pieceKeyOf(b)) return null;
  // A side of several edges (an armhole of front + back) is laid along as one run.
  return {
    a,
    b,
    ...(s.a.length > 1 ? { aParts: [...s.a] } : {}),
    ...(s.b.length > 1 ? { bParts: [...s.b] } : {}),
    score: 1,
    evidence: EVIDENCE,
    kind: 'edge',
    sewn: true,
  };
}

const FLIP_Y: Affine = [1, 0, 0, -1, 0, 0];

/**
 * A surface seam as the placer reads it: `part` laid on `host` by a hand placement (the part's
 * cut-bbox corner from the host's, mm, then turned — the numbers the picker stores and the techpack
 * lays it by), else centred on the host's mark `line` (rs frame, y up) in its own orientation.
 */
export function surfaceSeam(
  host: string,
  part: string,
  line: readonly Pt2[],
  geoms: ReadonlyMap<string, PieceGeom>,
  placement?: SeamPlacement,
): SeamCandidate | null {
  const hg = geoms.get(host);
  const pg = geoms.get(part);
  if (!hg || !pg || host === part || hg.rs.length < 3 || pg.rs.length < 3) return null;
  // The drawing frame (y down) is where the placement was measured.
  const down = (pts: readonly Pt2[]) => pts.map((p) => apply(FLIP_Y, p));
  const hb = boxOf(down(hg.rs));
  const pb = boxOf(down(pg.rs));
  let at = placement;
  if (!at) {
    const lb = line.length ? boxOf(down(line)) : hb;
    at = {
      xMm: (lb.x0 + lb.x1) / 2 - (pb.x1 - pb.x0) / 2 - hb.x0,
      yMm: (lb.y0 + lb.y1) / 2 - (pb.y1 - pb.y0) / 2 - hb.y0,
      rotDeg: 0,
      flip: false,
    };
  }
  const th = (at.rotDeg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const flip: Affine = at.flip ? [-1, 0, 0, 1, 2 * pb.x0, 0] : IDENTITY;
  const M = compose(
    translate(hb.x0 + at.xMm, hb.y0 + at.yMm),
    compose([c, s, -s, c, 0, 0], compose(translate(-pb.x0, -pb.y0), flip)),
  );
  return {
    a: `${host}#?`,
    b: `${part}#?`,
    score: 1,
    evidence: EVIDENCE,
    kind: 'surface',
    surface: { host, part, mark: 'hand', T: compose(FLIP_Y, compose(M, FLIP_Y)), fit: 1 },
  };
}

/**
 * A stored or picked pair as the placer reads it: an inner line on one side makes it a surface seam
 * (the host's line, the part the other side names), else the plain `candidateOf`.
 */
export function seamOfSides(
  s: SeamSides,
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLines: ReadonlyMap<string, readonly (readonly Pt2[])[]>,
  placement?: SeamPlacement,
): SeamCandidate | null {
  const hostSide = s.a.some((t) => parseInner(t))
    ? s.a
    : s.b.some((t) => parseInner(t))
      ? s.b
      : null;
  if (!hostSide) return candidateOf(s, geoms);
  const h = parseInner(hostSide.find((t) => parseInner(t))!)!;
  const other = (hostSide === s.a ? s.b : s.a).find((t) => !parseInner(t));
  if (!other) return null;
  const line = innerLines.get(h.piece)?.[h.k] ?? [];
  return surfaceSeam(h.piece, pieceOfTarget(other), line, geoms, placement);
}

/**
 * What of a seam the placer reads, as a string: everything but the words around it (evidence,
 * provenance, rivals) — a surface's T, composite parts, ranges all count.
 */
const WORDS = new Set(['evidence', 'provenance', 'ambiguousWith', 'score']);
export const seamSig = (xs: readonly SeamCandidate[]) =>
  JSON.stringify(xs, (k, v: unknown) => (WORDS.has(k) ? undefined : v));

/** Piece → index of the step input that holds it (the first, when two inputs share a piece). */
export function inputIndex(leaves: readonly (readonly string[])[]): Map<string, number> {
  const m = new Map<string, number>();
  leaves.forEach((set, i) => {
    for (const k of set) if (!m.has(k)) m.set(k, i);
  });
  return m;
}

/**
 * The card's seams split by the step: `inner` — both ends inside one input (already sewn, they keep
 * the unit's shape); `cross` — between two inputs (what this step may sew). Seams whose edges the
 * picker's geometry does not hold are dropped.
 */
export function splitSeams(
  chosen: readonly SeamCandidate[],
  leaves: readonly (readonly string[])[],
  geoms: ReadonlyMap<string, PieceGeom>,
): { inner: SeamCandidate[]; cross: SeamCandidate[] } {
  const where = inputIndex(leaves);
  const inner: SeamCandidate[] = [];
  const cross: SeamCandidate[] = [];
  for (const c of chosen) {
    if (c.kind === 'closure-not-seam') continue;
    const ia = where.get(pieceKeyOf(c.a));
    const ib = where.get(pieceKeyOf(c.b));
    if (ia == null || ib == null) continue;
    if (c.kind !== 'surface' && (!resolveEdge(c.a, geoms) || !resolveEdge(c.b, geoms))) continue;
    (ia === ib ? inner : cross).push(c);
  }
  return { inner, cross };
}

export type Ghost = {
  /** The piece the pattern holds no shape for. */
  key: string;
  input: number;
  /** A plain square standing in for it, picture frame. */
  ring: Pt2[];
};

export type StepLayout = {
  /** Piece → its rs frame (mm, y up) into the picture frame (mm, y up). */
  T: Map<string, Affine>;
  /** Piece → step input index (every leaf piece, drawn or not). */
  input: Map<string, number>;
  /** Pieces of an input with no shape: an empty square each, beside their input. */
  ghosts: Ghost[];
  /** Identical layers drawn as one shape, the leader first (a collar on its under-collar). */
  stacked: string[][];
  /**
   * Pieces set into a run across other pieces (a sleeve into an opened armhole, a collar on a
   * neckline): they point away from what they are sewn to — the run's way up, not the page's.
   */
  onRuns: string[];
  /** Pieces no seam inside their input lays: they stand beside it in a row, not joined to it. */
  apart: string[];
  /** Inputs laid against each other along the step's seams, the biggest first; the rest stand beside. */
  clusters: number[][];
  /**
   * Inputs laid upright ON the input they are sewn to, seam edge on seam edge (a pocket bag on the
   * front's opening, a facing, a lining; one half of a bag on the other): [layer, partner] input
   * indices. The joined result only — an exploded canvas stands them beside.
   */
  layers: [number, number][];
  /**
   * Pieces a hand placement lays `inside` on a partner of their own input (a bag on the back it was
   * sewn into a step before): [layer, partner] piece keys, drawn grey under the partner as a layer.
   */
  pieceLayers: [string, string][];
  /** The hand placements laid, by piece: its own, or its twin's mirrored. */
  hand: Map<string, LaidHand>;
  /** Extent of every drawn piece and ghost, picture frame. */
  bbox: Box;
};

/**
 * The pieces of one input a focused picture draws: the ones carrying the seam's edges, and the
 * pieces between them that the seams already sewn inside the input run through (a yoke's armhole
 * edge reaches the back through the yoke's other layer and the yoke seam) — so the input's parts
 * are laid joined, as the unit is, never as loose pieces each with a bit of the seam.
 */
export function focusPieces(
  pieces: readonly string[],
  seamPieces: ReadonlySet<string>,
  inner: readonly SeamCandidate[],
): string[] {
  const own = pieces.filter((k) => seamPieces.has(k));
  if (own.length < 2) return own;
  const here = new Set(pieces);
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b || !here.has(a) || !here.has(b)) return;
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const c of inner) {
    if (!confidentSeam(c)) continue;
    const surface = c.kind === 'surface' ? c.surface : undefined;
    const A = surface ? [surface.host] : (c.aParts ?? [c.a]).map(pieceKeyOf);
    const B = surface ? [surface.part] : (c.bParts ?? [c.b]).map(pieceKeyOf);
    for (const a of A)
      for (const b of B) {
        link(a, b);
        link(b, a);
      }
  }
  // Breadth-first from the seam's first piece; every other one joins by its shortest path.
  const from = new Map<string, string | null>([[own[0], null]]);
  const queue = [own[0]];
  while (queue.length) {
    const k = queue.shift()!;
    for (const n of adj.get(k) ?? [])
      if (!from.has(n)) {
        from.set(n, k);
        queue.push(n);
      }
  }
  const keep = new Set(own);
  for (const k of own.slice(1)) for (let p = from.get(k); p; p = from.get(p)) keep.add(p);
  return pieces.filter((k) => keep.has(k));
}

const EMPTY_LAYOUT: StepLayout = {
  T: new Map(),
  input: new Map(),
  ghosts: [],
  stacked: [],
  onRuns: [],
  apart: [],
  clusters: [],
  layers: [],
  pieceLayers: [],
  hand: new Map(),
  bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
};

const worldOf = (g: PieceGeom, T: Affine) => g.rs.map((p) => apply(T, p));

/** A polyline window in millimetres along its own direction. */
function rangedLine(pts: readonly Pt2[], range?: readonly [number, number]): Pt2[] {
  if (!range || pts.length < 2) return [...pts];
  const start = Math.max(0, Math.min(range[0], range[1]));
  const end = Math.max(start, Math.max(range[0], range[1]));
  const out: Pt2[] = [];
  let at = 0;
  for (let index = 1; index < pts.length; index++) {
    const a = pts[index - 1];
    const b = pts[index];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const next = at + length;
    if (length > 0 && next >= start && at <= end) {
      const pointAt = (distance: number): Pt2 => {
        const share = Math.max(0, Math.min(1, (distance - at) / length));
        return [a[0] + share * (b[0] - a[0]), a[1] + share * (b[1] - a[1])];
      };
      const from = pointAt(Math.max(start, at));
      const to = pointAt(Math.min(end, next));
      if (
        !out.length ||
        Math.hypot(out[out.length - 1][0] - from[0], out[out.length - 1][1] - from[1]) > 1e-6
      )
        out.push(from);
      out.push(to);
    }
    at = next;
    if (at >= end) break;
  }
  return out.length >= 2 ? out : [...pts];
}

const extentOf = (b: Box) => Math.max(b.x1 - b.x0, b.y1 - b.y0);
const squareAt = (x: number, y: number, s: number): Pt2[] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
];

/** Gap between things that are not sewn together: a share of the larger extent, never a touch. */
const APART = 0.08;
/** Overlap two laid shapes may still share: a hair, what rasters of touching edges read. */
const TOUCH = 0.01;
/** A joined seam may cross a narrow allowance, but never cover a meaningful share of a piece. */
const JOINED_OVERLAP = 0.15;
/** An input that lands on another is pushed off the seam by this share of the unit, a step at a time. */
const PUSH = 0.02;
const PUSH_MAX = 12;
/** The engine's own reading shapes a unit from this score up, with no rival. */
const CONFIDENT = 0.9;
/**
 * Share of an input its upright place lays on its partner past which it is that partner's layer: it
 * lies on it, not half off it (a left front laid over the right front is not a layer).
 */
const LAYER = 0.85;
/**
 * A layer lies on its partner as it is drawn (a bag cut to the front's opening): turned at most this
 * much — two edges digitised apart — and never mirrored.
 */
const LAYER_TURN = Math.PI / 12;

/** How far a placement leans from the piece's own up (the angle of its y axis), mirrored or not. */
export const tiltOf = (T: Affine) => Math.atan2(Math.abs(T[2]), T[3]);
/**
 * The garment's top stays up: a placement leans at most a right angle (the techpack's rule) and a
 * hair — a sleeve hung off a slightly leaning armhole lies sideways, not upside down.
 */
export const UPRIGHT = Math.PI / 2 + Math.PI / 36;

/**
 * A seam the picture may shape a unit by: one a person stored, one the solver is sure of, an edge
 * the engine reads high with no rival, a surface laid by its mark. The rest (a composite the solver
 * only finds likely, a partial run, an edge with rivals) leave the unit's pieces standing apart.
 */
export function confidentSeam(c: SeamCandidate): boolean {
  if (c.kind === 'closure-not-seam') return false;
  if (c.provenance) return true;
  if (c.kind === 'surface') return !!c.surface;
  const sure = c.assignment?.confidence;
  if (sure === 'ambiguous') return false;
  if (sure === 'sure') return true;
  return c.kind === 'edge' && c.score >= CONFIDENT && !c.ambiguousWith?.length;
}

/** Two pieces cut the same (collar and under-collar): laid as one shape, never beside each other. */
const identicalPair = (
  c: SeamCandidate,
  geoms: ReadonlyMap<string, PieceGeom>,
  ka: string,
  kb: string,
) =>
  c.evidence?.twin === 'identical' ||
  !!geoms.get(ka)?.twinOf.some((t) => t.key === kb && t.kind === 'identical');

/**
 * An input on its own: its pieces along its inner seams, upright and clear of each other (a seam
 * may push a piece off by a hair, never fold it); pieces the placer leaves out stand beside in a
 * row, their own way up, a small gap between. `apart`: every piece no seam joins to the input's
 * main body — left out, or laid beside it as a body of its own.
 */
function layInput(
  keys: readonly string[],
  inner: readonly SeamCandidate[],
  geoms: ReadonlyMap<string, PieceGeom>,
  raster: { rasterMm?: number },
): {
  T: Map<string, Affine>;
  stacked: string[][];
  onRuns: string[];
  apart: string[];
  hostOf: Map<string, string>;
} {
  const L = unionLayout(keys, inner, geoms, {
    ...raster,
    overlapMax: TOUCH,
    uprightMax: UPRIGHT,
    pushOffMax: PUSH * PUSH_MAX,
  });
  const T = new Map<string, Affine>(L.placements.map((p) => [p.pieceKey, p.T]));
  const left = keys.filter((k) => !T.has(k));
  // The body each laid piece belongs to: along what it hangs from (a surface part: its host) to a
  // root; the first root is the input's main body, any other root a body laid beside it.
  const hostOf = new Map<string, string>();
  for (const p of L.placements)
    if (p.attachedVia) hostOf.set(p.pieceKey, pieceKeyOf(p.attachedVia));
  for (const c of inner)
    if (c.kind === 'surface' && c.surface && T.has(c.surface.part) && !hostOf.has(c.surface.part))
      hostOf.set(c.surface.part, c.surface.host);
  const rootOf = (k: string) => {
    for (let n = 0; hostOf.has(k) && n < keys.length; n++) k = hostOf.get(k)!;
    return k;
  };
  const main = L.placements[0]?.pieceKey;
  const beside = keys.filter((k) => T.has(k) && rootOf(k) !== main);
  // One piece alone is the input, not a piece beside it.
  const apart = keys.length > 1 ? [...left, ...beside] : [];
  if (left.length) {
    const placed = [...T].flatMap(([k, t]) => worldOf(geoms.get(k)!, t));
    const all = placed.length ? boxOf(placed) : { x0: 0, y0: 0, x1: 0, y1: 0 };
    let x = all.x1;
    for (const k of left) {
      const b = boxOf(geoms.get(k)!.rs);
      if (T.size) x += APART * Math.max(extentOf(all), extentOf(b));
      T.set(k, translate(x - b.x0, all.y0 - b.y0));
      x += b.x1 - b.x0;
    }
  }
  return { T, stacked: L.stacked, onRuns: L.onRuns ?? [], apart, hostOf };
}

/**
 * What moves with a piece laid by hand on a partner of its own input: the pieces hung on it (its
 * side of the input once the link to the partner is cut) — or the piece alone, when the partner
 * hangs on that side too.
 */
function handSide(piece: string, partner: string, hostOf: ReadonlyMap<string, string>): string[] {
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => adj.set(a, [...(adj.get(a) ?? []), b]);
  for (const [k, h] of hostOf) {
    if ((k === piece && h === partner) || (k === partner && h === piece)) continue;
    link(k, h);
    link(h, k);
  }
  const seen = new Set([piece]);
  const queue = [piece];
  while (queue.length)
    for (const n of adj.get(queue.shift()!) ?? [])
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  return seen.has(partner) ? [piece] : [...seen];
}

/** A placement the picture can undo (a fold seen edge-on cannot be). */
const invertible = (T: Affine) => Math.abs(T[0] * T[3] - T[1] * T[2]) > 1e-9;

/** The inverse of a (non-degenerate) affine. */
export function invert(T: Affine): Affine {
  const [a, b, c, d, e, f] = T;
  const k = a * d - b * c || 1;
  return [d / k, -b / k, -c / k, a / k, (c * f - d * e) / k, (b * e - a * f) / k];
}

const pairKey = (i: number, j: number) => (i < j ? `${i}:${j}` : `${j}:${i}`);
const NO_HAND: ReadonlyMap<string, HandOn> = new Map();

/**
 * Lay the step out, honestly. Each input on its own first: its pieces along the seams already sewn
 * inside it that are stored or confident (`unionLayout`, upright, clear of each other); pieces with
 * no such seam stand apart in a row (a gap, never a touch) — an input whose pieces are not known to
 * be joined is not drawn as one; a piece with no shape is an empty square beside its input. Then
 * the inputs, each as a rigid whole, along the step's cross seams (longest first; a placement that
 * would turn the input past a right angle or land it on another is refused — a seam may push it
 * off by a hair, never fold it); an input no cross seam lays stands beside. `explode` (share of the
 * extent) then pulls each input away from the seams that hold it — 0 = the joined result.
 *
 * The invariant: no two inputs overlap. Identical layers (collar on under-collar) are the one
 * exception — laid as one shape in the joined result, apart on an exploded canvas — as is a surface
 * part on its host, and a layer on its partner: an input whose upright place along the seam lies on
 * the input it is sewn to (a pocket bag sewn inside along the front's own opening edge) is laid
 * there in the joined result, upright, seam edge on seam edge — once no seam lays any input clear,
 * so it never takes the place of a clear one. Any other overlap the seams leave is undone: that
 * input stands alone and the step is laid again, at worst every input on the shelves, which never
 * touch.
 *
 * A hand placement (`hand`, piece → placement, the picker's inside / turn / flip / slide) beats every
 * guess for its piece: the piece is snapped onto its partner's run (`snapHand`) — inside a unit, its
 * side of the unit moves with it; across inputs, its input does, before any seam is guessed, and the
 * two are never pulled apart for touching. `inside` lays it as a layer of its partner. A piece with
 * no placement of its own takes its twin's, mirrored (`twinHand`: the card's placements anywhere;
 * default `hand`) when it is sewn to the twin of the twin's partner.
 */
export function stepLayout(
  leaves: readonly (readonly string[])[],
  seams: readonly SeamCandidate[],
  geoms: ReadonlyMap<string, PieceGeom>,
  opts: {
    explode?: number;
    rasterMm?: number;
    hand?: ReadonlyMap<string, HandOn>;
    twinHand?: ReadonlyMap<string, HandOn>;
    /** Earlier output layouts, one per input; each is kept rigid while this step joins the inputs. */
    inputLayouts?: readonly (StepLayout | undefined)[];
    /** Finished trouser plies are stacked rather than opened like an instructional seam tile. */
    stackIdentical?: boolean;
    /** Legal joined overlap for inferred cut shapes; stored editor layouts keep the old zero. */
    joinedOverlap?: number;
    /** Use partial seam windows; stored editor layouts retain their historical full-edge fit. */
    honorRanges?: boolean;
    /** Opt into cumulative whole-garment packing; ordinary editor tiles keep legacy semantics. */
    garmentLayout?: boolean;
  } = {},
): StepLayout {
  const input = inputIndex(leaves);
  const drawable = (k: string) => (geoms.get(k)?.rs.length ?? 0) >= 3;
  // A previous output is authoritative: pieces deliberately omitted there because the card has
  // no seam for them must not reappear as a row of leftovers in every later operation.
  const keys = [...input].flatMap(([key, index]) =>
    drawable(key) && (!opts.inputLayouts?.[index] || opts.inputLayouts[index]?.T.has(key))
      ? [key]
      : [],
  );
  if (keys.length === 0) return EMPTY_LAYOUT;
  const drawnKeys = new Set(keys);
  const raster = opts.rasterMm ? { rasterMm: opts.rasterMm } : {};
  const explode = opts.explode ?? 0;
  const rigidInputs = !!opts.inputLayouts?.some(Boolean);
  const ins = leaves.map((_, i) => i).filter((i) => [...input.values()].includes(i));
  const inOf = (id: EdgeId) => input.get(pieceKeyOf(id));
  const keysOf = (i: number) => keys.filter((k) => input.get(k) === i);

  // Hand placements: a piece's own, else its twin's mirrored — on a seam to a drawn partner.
  const handOwn = opts.hand ?? NO_HAND;
  const hands =
    handOwn.size || opts.twinHand?.size
      ? laidHands(handTargetsOf(seams, geoms), geoms, handOwn, opts.twinHand ?? handOwn, (k) =>
          drawnKeys.has(k),
        )
      : new Map<string, LaidHand>();
  const snapOf = (h: LaidHand, place: HandOn = h.place) =>
    snapHand(h.target.part, h.target.partnerGeom, h.target.partRun, h.target.partnerRun, place);

  // ── 1. each input alone ──
  const local = new Map<string, Affine>();
  const localBox = new Map<number, Box>();
  const stacked: string[][] = [];
  const onRuns: string[] = [];
  const apart: string[] = [];
  const pieceLayers: [string, string][] = [];
  for (const i of ins) {
    const ks = keysOf(i);
    if (!ks.length) continue;
    const inner = seams.filter((c) => inOf(c.a) === i && inOf(c.b) === i && confidentSeam(c));
    const previous = opts.inputLayouts?.[i];
    const seeded = !!previous && ks.every((key) => previous.T.has(key));
    const laid = seeded
      ? {
          T: new Map(ks.map((key) => [key, previous.T.get(key)!])),
          stacked: previous.stacked
            .map((stack) => stack.filter((key) => ks.includes(key)))
            .filter((stack) => stack.length > 1),
          onRuns: previous.onRuns.filter((key) => ks.includes(key)),
          apart: previous.apart.filter((key) => ks.includes(key)),
          hostOf: new Map<string, string>(),
        }
      : layInput(ks, inner, geoms, raster);
    // A piece placed by hand on a partner of this input: its side of the unit snaps onto the
    // partner's run as the placement says (the bag a step before laid inside the back stays there).
    let laidApart = laid.apart;
    for (const [k, h] of hands) {
      const p = h.target.partner;
      if (input.get(k) !== i || input.get(p) !== i) continue;
      const from = laid.T.get(k);
      const onto = laid.T.get(p);
      if (!from || !onto) continue;
      const D = compose(compose(onto, snapOf(h)), invert(from));
      const moved = handSide(k, p, laid.hostOf);
      for (const m of moved) laid.T.set(m, compose(D, laid.T.get(m)!));
      if (!laidApart.includes(p)) laidApart = laidApart.filter((m) => !moved.includes(m));
      if (h.place.inside) pieceLayers.push([k, p]);
    }
    for (const [k, t] of laid.T) local.set(k, t);
    stacked.push(...laid.stacked);
    onRuns.push(...laid.onRuns);
    apart.push(...laidApart);
    if (seeded)
      pieceLayers.push(
        ...previous.pieceLayers.filter(
          ([piece, partner]) => ks.includes(piece) && ks.includes(partner),
        ),
      );
    if (seeded)
      for (const [layerInput, partnerInput] of previous.layers) {
        const partner = [...previous.input].find(([, input]) => input === partnerInput)?.[0];
        if (!partner || !ks.includes(partner)) continue;
        for (const [piece, input] of previous.input)
          if (input === layerInput && ks.includes(piece)) pieceLayers.push([piece, partner]);
      }
    localBox.set(i, boxOf(ks.flatMap((k) => worldOf(geoms.get(k)!, local.get(k)!))));
  }
  const standing = new Set(apart);
  // A layer under its identical twin is not a shape of its own: it leans as the twin's edge says.
  const followers = new Set(stacked.flatMap((s) => s.slice(1)));
  // Geometry-less pieces are useful doors on the editor canvas, but a print construction picture
  // must never invent a cut shape for them. The operation still prints its resolved outlines.
  const unit = Math.max(...[...localBox.values()].map(extentOf), 1);
  const side = 0.25 * unit;
  const ghostsLocal: Ghost[] = [];
  if (!opts.garmentLayout) {
    for (const i of ins) {
      const missing = [...input].filter(([k, gi]) => gi === i && !drawable(k)).map(([k]) => k);
      const b = localBox.get(i);
      let x = b ? b.x1 + APART * unit : 0;
      for (const k of missing) {
        ghostsLocal.push({ key: k, input: i, ring: squareAt(x, b ? b.y0 : 0, side) });
        x += side + APART * unit;
      }
    }
  }
  const ringsOf = (i: number, M: Affine = IDENTITY): Pt2[][] => [
    ...keysOf(i).map((k) => worldOf(geoms.get(k)!, compose(M, local.get(k)!))),
    ...ghostsLocal.filter((g) => g.input === i).map((g) => g.ring.map((p) => apply(M, p))),
  ];

  // ── 2. the inputs against each other ──
  const area = (i: number) => {
    const b = localBox.get(i);
    return b ? (b.x1 - b.x0) * (b.y1 - b.y0) : 0;
  };
  // A side whose own edge lies on a piece not drawn joined (standing apart, or left out of the
  // picture) is read along its longest part that is: a sleeve still hangs on the armhole's rest.
  const drawnPart = (id: EdgeId, parts: readonly EdgeId[] | undefined): EdgeId => {
    const joined = (k: string) => local.has(k) && !standing.has(k);
    if (joined(pieceKeyOf(id))) return id;
    let best = id;
    let longest = -1;
    for (const p of parts ?? []) {
      const len = joined(pieceKeyOf(p)) ? resolveEdge(p, geoms)?.len ?? 0 : -1;
      if (len > longest) {
        longest = len;
        best = p;
      }
    }
    return best;
  };
  const cross = seams
    .map((c) =>
      c.kind === 'surface' ? c : { ...c, a: drawnPart(c.a, c.aParts), b: drawnPart(c.b, c.bParts) },
    )
    .filter((c) => {
      const ia = inOf(c.a);
      const ib = inOf(c.b);
      if (ia == null || ib == null || ia === ib) return false;
      if (!local.has(pieceKeyOf(c.a)) || !local.has(pieceKeyOf(c.b))) return false;
      return c.kind === 'surface'
        ? !!c.surface
        : !!resolveEdge(c.a, geoms) && !!resolveEdge(c.b, geoms);
    })
    .map((c) => ({
      c,
      len:
        c.kind === 'surface'
          ? Infinity
          : Math.max(resolveEdge(c.a, geoms)!.len, resolveEdge(c.b, geoms)!.len),
    }))
    .sort((p, q) => q.len - p.len)
    .map((x) => x.c);
  const step = Math.max(2, unit / 120);
  /** The row step a hair is read at: a quarter of the coarse one, never under a millimetre. */
  const fine = Math.max(1, step / 4);
  const rastersOf = (i: number, M: Affine) => ringsOf(i, M).map((r) => rasterize(r, step));
  const order = [...ins].sort((p, q) => area(q) - area(p));

  // Hand placements across inputs: the piece's input laid on its partner's by the placement.
  const crossHands = [...hands].filter(([k, h]) => input.get(k) !== input.get(h.target.partner));
  /** Input of a piece placed by hand → its partner's input (laid first, so it roots the cluster). */
  const handParent = new Map(
    crossHands.map(([k, h]) => [input.get(k)!, input.get(h.target.partner)!] as const),
  );
  // Pieces whose input was laid before their partner's: re-snapped at the end when the placement
  // (a fold seen edge-on) cannot be undone to lay the partner.
  let pinned: string[] = [];

  // Inputs the seams cannot lay clear stand on their own; the step is laid again without them.
  const loose = new Set<number>();
  const G = new Map<number, Affine>();
  let T = new Map<string, Affine>();
  let ghosts: Ghost[] = [];
  let clustersOut: number[][] = [];
  // Layers laid on their twins across inputs (a cuff's second face as its own input).
  let crossStacks: string[][] = [];
  // Inputs set into another input's run (a sleeve into the body's armhole).
  let crossRuns: string[] = [];
  // Inputs laid on the input they are sewn to: [layer, partner].
  let layersOut: [number, number][] = [];
  for (;;) {
    G.clear();
    crossStacks = [];
    // Pairs drawn on each other on purpose: a layer on its identical twin, a part on its host, a
    // layer on its partner.
    const onEachOther = new Set<string>();
    const layers: [number, number][] = [];
    // Each laid input's rasters (coarse), by input.
    let placedRasters = new Map<number, Raster[]>();
    // The same at the fine step, built when a placement needs the hair read (and dropped with
    // every input laid, as the table changed).
    let placedFine: Map<number, Raster[]> | null = null;
    let placedKeys: { i: number; M: Affine }[] = [];
    // Inputs a hand placement holds (both sides of it): another input that lands on one gives way.
    const held = new Set<number>();
    pinned = [];
    const settle = (i: number, M: Affine) => {
      G.set(i, M);
      placedRasters.set(i, rastersOf(i, M));
      placedKeys.push({ i, M });
      placedFine = null;
    };
    /** The most input `j` laid by `M` covers of a laid input (`skip` left out). */
    const overlapAt = (j: number, M: Affine, skip?: number) => {
      let o = 0;
      const mine = rastersOf(j, M);
      for (const [k, rs] of placedRasters) {
        if (k === skip) continue;
        for (const r of mine) for (const p of rs) o = Math.max(o, pairOverlap(r, p));
      }
      return o;
    };
    /** The share of input `j` laid by `M` that lies on laid input `i`: all its pieces, not one. */
    const shareOn = (j: number, M: Affine, i: number) => {
      const theirs = placedRasters.get(i) ?? [];
      let on = 0;
      let all = 0;
      for (const r of rastersOf(j, M)) {
        let o = 0;
        for (const p of theirs) o += pairOverlap(r, p) * Math.min(r.area, p.area);
        on += Math.min(o, r.area);
        all += r.area;
      }
      return all > 0 ? on / all : 0;
    };
    const overlapFine = (j: number, M: Affine, skip?: number) => {
      placedFine ??= new Map(
        placedKeys.map((p) => [p.i, ringsOf(p.i, p.M).map((r) => rasterize(r, fine))]),
      );
      let o = 0;
      const mine = ringsOf(j, M).map((ring) => rasterize(ring, fine));
      for (const [k, rs] of placedFine) {
        if (k === skip) continue;
        for (const r of mine) for (const p of rs) o = Math.max(o, pairOverlap(r, p));
      }
      return o;
    };
    /**
     * The motion of input `j` that lays its side of `c` on the placed side, or null: not clear.
     * `asLayer`: the motion that lays it upright ON the input it is sewn to, seam edge on seam edge,
     * clear of every other input — or null.
     */
    const along = (c: SeamCandidate, j: number, asLayer = false): Affine | null => {
      const mine = inOf(c.a) === j ? c.a : c.b;
      const theirs = mine === c.a ? c.b : c.a;
      if (c.kind === 'surface') {
        if (asLayer) return null;
        // The part onto its host's mark (a host is never laid onto its part).
        const S = c.surface!;
        const host = local.get(S.host);
        const part = local.get(S.part);
        const Hg = G.get(input.get(S.host)!);
        if (!host || !part || !Hg || input.get(S.part) !== j) return null;
        onEachOther.add(pairKey(j, input.get(S.host)!));
        return compose(compose(compose(Hg, host), S.T), invert(part));
      }
      const i = inOf(theirs)!;
      const Ht = G.get(i);
      if (!Ht) return null;
      const ka = pieceKeyOf(mine);
      const kb = pieceKeyOf(theirs);
      const ea = resolveEdge(theirs, geoms)!;
      const eb = resolveEdge(mine, geoms)!;
      const rangeOf = (id: EdgeId) =>
        opts.honorRanges === true ? (id === c.a ? c.range?.a : c.range?.b) : undefined;
      const Tt = compose(Ht, local.get(kb)!);
      // Their side across several pieces of their input (an armhole of front + back): one run —
      // along the pieces drawn joined; one standing apart (a yoke no upright seam lays on the
      // fronts' shoulders) or not drawn is not part of the opening.
      const gone = (id: EdgeId) => inOf(id) == null || standing.has(pieceKeyOf(id));
      const theirParts = ((theirs === c.a ? c.aParts : c.bParts) ?? []).filter((id) => !gone(id));
      const run =
        theirParts.length > 1 && theirParts.every((id) => inOf(id) === i)
          ? runOf(
              theirParts.flatMap((id): RunPart[] => {
                const e = resolveEdge(id, geoms);
                return e ? [{ key: e.pieceKey, pts: e.pts, len: e.len }] : [];
              }),
              (k) => (local.has(k) ? compose(Ht, local.get(k)!) : undefined),
            )
          : null;
      const A = run ?? rangedLine(ea.pts, rangeOf(theirs)).map((p) => apply(Tt, p));
      const B = rangedLine(eb.pts, rangeOf(mine)).map((p) => apply(local.get(ka)!, p));
      const myParts = ((mine === c.a ? c.aParts : c.bParts) ?? []).filter((id) => !gone(id));
      const myRun =
        myParts.length > 1 && myParts.every((id) => inOf(id) === j)
          ? runOf(
              myParts.flatMap((id): RunPart[] => {
                const e = resolveEdge(id, geoms);
                return e ? [{ key: e.pieceKey, pts: e.pts, len: e.len }] : [];
              }),
              (k) => local.get(k),
            )
          : null;
      const a0 = A[0];
      const a1 = A[A.length - 1];
      const mineKeys = keysOf(j);
      const stack =
        mineKeys.length === 1 && keysOf(i).length === 1 && identicalPair(c, geoms, ka, kb);
      const upright = (M: Affine) =>
        mineKeys.every(
          (k) => followers.has(k) || pieceTilt(geoms.get(k)!, compose(M, local.get(k)!)) <= UPRIGHT,
        );
      if (stack && explode === 0 && opts.stackIdentical) {
        onEachOther.add(pairKey(i, j));
        crossStacks.push([kb, ka]);
        return compose(Tt, invert(local.get(ka)!));
      }
      if (opts.garmentLayout && !asLayer && /crotch:/.test(c.evidence.rule ?? '')) {
        const mineBox = boxOf(mineKeys.flatMap((key) => worldOf(geoms.get(key)!, local.get(key)!)));
        const hostBox = boxOf(
          keysOf(i).flatMap((key) => worldOf(geoms.get(key)!, compose(Ht, local.get(key)!))),
        );
        const isLeft = mineKeys.some((key) => {
          const geom = geoms.get(key)!;
          return (geom.hand ?? readName(geom.name).hand) === 'L';
        });
        // A completed left/right half stays rigid. Put the halves beside each other, waist level,
        // with their centre edges touching; edge-midpoint alignment nests the wide halves.
        const x = isLeft ? hostBox.x0 - mineBox.x1 : hostBox.x1 - mineBox.x0;
        return translate(x, hostBox.y1 - mineBox.y1);
      }
      if (opts.garmentLayout && !asLayer && /waistband follows/.test(c.evidence.rule ?? '')) {
        const target = midAlong(A).p;
        const source = midAlong(myRun ?? B).p;
        const mineBox = boxOf(mineKeys.flatMap((key) => worldOf(geoms.get(key)!, local.get(key)!)));
        const hostBox = boxOf(
          keysOf(i).flatMap((key) => worldOf(geoms.get(key)!, compose(Ht, local.get(key)!))),
        );
        // The waistband is sewn along the waist and rises above it; aligning edge midpoints alone
        // put the complete band below the legs when its paired long edge was digitised on top.
        return translate(target[0] - source[0], hostBox.y1 - mineBox.y0);
      }
      if (
        opts.garmentLayout &&
        !asLayer &&
        /trouser leg:|complete input units joined/.test(c.evidence.rule ?? '')
      ) {
        const target = midAlong(A).p;
        const source = midAlong(myRun ?? B).p;
        return translate(target[0] - source[0], target[1] - source[1]);
      }
      // Off the seam: along the laid edge's normal, away from the input it belongs to (for a run,
      // away from all the pieces it runs across).
      const hc = run
        ? centroidOf(
            keysOf(i)
              .filter((k) => !standing.has(k))
              .flatMap((k) => worldOf(geoms.get(k)!, compose(Ht, local.get(k)!))),
          )
        : centroidOf(worldOf(geoms.get(kb)!, Tt));
      const mid: Pt2 = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2];
      const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) || 1;
      let nx = -(a1[1] - a0[1]) / len;
      let ny = (a1[0] - a0[0]) / len;
      if ((hc[0] - mid[0]) * nx + (hc[1] - mid[1]) * ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      // Set into a run, an input points away from what it is sewn to: the run's way up, not the
      // page's (a sleeve out of an opened armhole, a collar above the neckline).
      const away = (M: Affine) => {
        const c = centroidOf(
          mineKeys.flatMap((k) => worldOf(geoms.get(k)!, compose(M, local.get(k)!))),
        );
        return (c[0] - mid[0]) * nx + (c[1] - mid[1]) * ny > 0;
      };
      let best: { M: Affine; score: number } | null = null;
      // Off the seam along its normal until clear of the inputs already laid.
      const settle = (M0: Affine, cost: number) => {
        let M = M0;
        let o = overlapAt(j, M);
        // The seam-aligned position is the only one guaranteed to touch. Keep it when the fine
        // reading says the cut shapes only share a legal seam allowance; pushing every positive
        // raster cell away made thin pieces float a few millimetres from their partner.
        const legalJoinedOverlap = opts.joinedOverlap ?? 0;
        if (o <= legalJoinedOverlap) {
          const h = overlapFine(j, M);
          if (h <= legalJoinedOverlap) {
            const score = cost + h * unit;
            if (!best || score < best.score) best = { M, score };
            return;
          }
        }
        let off = 0;
        for (let n = 1; o > TOUCH && n <= PUSH_MAX; n++) {
          off = n * PUSH * unit;
          M = compose(translate(nx * off, ny * off), M0);
          o = overlapAt(j, M);
        }
        if (o > TOUCH) {
          return;
        }
        // Clear of the hair too: read at the fine step (a cap's tip on the shoulder is thinner than
        // a coarse row), a quarter step at a time, two coarse steps further at most, keeping the
        // place that reads least. A place that still reads a hair is no place: the input stands
        // on its own, as it does when a coarse overlap stays.
        let h = overlapFine(j, M);
        for (let n = 1; h > 0 && n <= 8; n++) {
          const at = off + (n * PUSH * unit) / 4;
          const Mf = compose(translate(nx * at, ny * at), M0);
          const hf = overlapFine(j, Mf);
          if (hf < h) {
            M = Mf;
            h = hf;
            off = at;
          }
        }
        if (h > 0) {
          return;
        }
        const score = cost + off;
        if (!best || score < best.score) best = { M, score };
      };
      // Its side laid along theirs, either end first, as is and mirrored; centred on the laid edge
      // (a long cap on a short armhole hangs from its middle). As the unit placer: a flip only when
      // it clearly untangles the picture.
      const trials = (B: Pt2[]) =>
        [false, true].flatMap((rev) =>
          [false, true].map((mir) => {
            const q0 = rev ? B[B.length - 1] : B[0];
            const q1 = rev ? B[0] : B[B.length - 1];
            const R = rigid(a0, a1, q0, q1, mir);
            const m0 = apply(R, q0);
            const m1 = apply(R, q1);
            const M = compose(
              translate(mid[0] - (m0[0] + m1[0]) / 2, mid[1] - (m0[1] + m1[1]) / 2),
              R,
            );
            const e1 = apply(M, q1);
            return { M, endErr: Math.hypot(e1[0] - a1[0], e1[1] - a1[1]), mir };
          }),
        );
      if (asLayer) {
        // Laid upright along the seam it lies on the input it is sewn to: a piece sewn inside along
        // the partner's own edge (a pocket bag on the front's opening, a facing, a lining, one half
        // of a bag on the other). It stays there as it is, seam edge on seam edge — never folded,
        // never opened out over the seam — clear of every other input.
        const folded =
          !!opts.garmentLayout && /detail folded onto garment/.test(c.evidence.rule ?? '');
        if (explode > 0 || (run && !folded)) return null;
        // Its own side over several of its pieces (a bag's top across its two halves) lies on
        // theirs whole.
        let layer: { M: Affine; cost: number } | null = null;
        for (const t of trials(myRun ?? B)) {
          if (!folded && (t.mir || tiltOf(t.M) > LAYER_TURN || !upright(t.M))) continue;
          if (shareOn(j, t.M, i) <= (folded ? 0.5 : LAYER)) continue;
          if (overlapAt(j, t.M, i) > TOUCH || overlapFine(j, t.M, i) > 0) continue;
          const cost = t.endErr - (folded ? shareOn(j, t.M, i) * 100 : 0);
          if (!layer || cost < layer.cost) layer = { M: t.M, cost };
        }
        if (!layer) return null;
        onEachOther.add(pairKey(i, j));
        layers.push([j, i]);
        return layer.M;
      }
      if (stack) {
        // Two layers cut alike, sewn along one edge and opened out, lie across the seam from each
        // other, mirror images — a book opened at its spine; turned over on purpose, so never
        // upright. The layer goes ON its twin, edge on edge, then turns over the seam's tangent
        // at its middle: a straight edge folds on itself, a curved one has the layers touch at
        // the middle and part towards the ends (sewn, they are not flat). A layer that still cuts
        // into its twin slides off along the normal, as any input does.
        const S = rigid(a0, a1, B[0], B[B.length - 1], false);
        const m0 = apply(S, B[0]);
        const m1 = apply(S, B[B.length - 1]);
        const onTwin = compose(
          translate(mid[0] - (m0[0] + m1[0]) / 2, mid[1] - (m0[1] + m1[1]) / 2),
          S,
        );
        const { p: hp, t: ht } = midAlong(A);
        // Off the twin along the tangent's normal, away from the host: the chord's normal points
        // back into a deep crescent, whose middle bulges past its own centroid.
        nx = -ht[1];
        ny = ht[0];
        if ((hc[0] - hp[0]) * nx + (hc[1] - hp[1]) * ny > 0) {
          nx = -nx;
          ny = -ny;
        }
        settle(compose(reflectAcross(hp, ht), onTwin), 0);
        // (`best` is set inside `settle`: read past the narrowing.)
        const opened = best as { M: Affine; score: number } | null;
        if (opened) return opened.M;
        // No room to open it out: two layers alone go ON each other in the joined result (an
        // exploded canvas keeps them apart; among other inputs — the gores of a patchwork — a
        // layer with no room is laid by another seam or stands apart), drawn alike — straight
        // onto it first (its own way up whichever edge the seam names); only a twin drawn another
        // way is covered by turning along the seam.
        if (explode > 0 || placedKeys.length > 1) return null;
        const mc = centroidOf(worldOf(geoms.get(ka)!, local.get(ka)!));
        const M = translate(hc[0] - mc[0], hc[1] - mc[1]);
        best = { M, score: -overlapAt(j, M) * 1000 + (upright(M) ? 0 : 500) };
      }
      for (const { M: M0, endErr, mir } of trials(myRun ?? B)) {
        if (stack) {
          // The option that covers the twin best, its own way up when that covers half of it.
          const score = -overlapAt(j, M0) * 1000 + endErr + (upright(M0) ? 0 : 500);
          if (!best || score < best.score) best = { M: M0, score };
          continue;
        }
        if (!upright(M0) || (run && !away(M0))) continue;
        settle(M0, endErr + (mir ? 50 : 0));
      }
      if (!best && run) {
        // Along the run it would lie past upright (a slit of an armhole): sideways, an end of its
        // edge at the shoulder point, pointing away from the input it is sewn to.
        const dx = mid[0] - hc[0];
        const dy = mid[1] - hc[1];
        for (const s of sidewaysTrials(A, B)) {
          const c = centroidOf(
            mineKeys.flatMap((k) => worldOf(geoms.get(k)!, compose(s.T, local.get(k)!))),
          );
          if ((c[0] - mid[0]) * dx + (c[1] - mid[1]) * dy <= 0) continue;
          settle(s.T, s.mirrored ? 50 : 0);
        }
      }
      if (best && stack) {
        onEachOther.add(pairKey(i, j));
        crossStacks.push([kb, ka]);
      }
      if (best && run) crossRuns.push(...mineKeys);
      return best?.M ?? null;
    };
    // Inputs a cross seam reaches form a cluster (laid against each other); clusters stand apart.
    const clusters: number[][] = [];
    const holds: SeamCandidate[][] = [];
    /** A hand placement across inputs from this cluster: the other input laid by it, or null. */
    const byHand = (inCl: ReadonlySet<number>): number | null => {
      for (const [k, h] of crossHands) {
        const p = h.target.partner;
        const ik = input.get(k)!;
        const ip = input.get(p)!;
        if (loose.has(ik) || loose.has(ip)) continue;
        const S = snapOf(h);
        let j: number;
        let M: Affine;
        if (inCl.has(ip) && !G.has(ik)) {
          j = ik;
          M = compose(compose(compose(G.get(ip)!, local.get(p)!), S), invert(local.get(k)!));
        } else if (inCl.has(ik) && !G.has(ip)) {
          // Laid before its partner: the partner goes where the placement wants it.
          j = ip;
          const U = invertible(S) ? S : snapOf(h, { ...h.place, rotDeg: 0 });
          if (U !== S) pinned.push(k);
          M = compose(
            compose(compose(G.get(ik)!, local.get(k)!), invert(U)),
            invert(local.get(p)!),
          );
        } else continue;
        settle(j, M);
        held.add(ik);
        held.add(ip);
        onEachOther.add(pairKey(ik, ip));
        if (h.place.inside && explode === 0) layers.push([ik, ip]);
        return j;
      }
      return null;
    };
    for (;;) {
      const rest = order.filter((i) => !G.has(i));
      if (!rest.length) break;
      // A piece placed by hand hangs on its partner: the partner's input roots the cluster.
      const root =
        rest.find((i) => {
          const ip = handParent.get(i);
          return ip == null || ip === i || G.has(ip) || loose.has(ip);
        }) ?? rest[0];
      const cl = [root];
      const inCl = new Set(cl);
      const used: SeamCandidate[] = [];
      // A fresh table: an earlier cluster is shelved elsewhere, not under this one.
      placedRasters = new Map();
      placedKeys = [];
      placedFine = null;
      settle(root, IDENTITY);
      if (!loose.has(root))
        for (let laid = true; laid; ) {
          laid = false;
          // A hand placement first: it beats every guess.
          const j = byHand(inCl);
          if (j != null) {
            cl.push(j);
            inCl.add(j);
            laid = true;
            continue;
          }
          // Clear places first; a layer on its partner only once no seam lays any input clear.
          for (const asLayer of [false, true]) {
            for (const c of cross) {
              if (
                opts.garmentLayout &&
                !asLayer &&
                /detail folded onto garment/.test(c.evidence.rule ?? '')
              )
                continue;
              const ia = inOf(c.a)!;
              const ib = inOf(c.b)!;
              // Only from THIS cluster's inputs: a seam to an earlier cluster's input was refused
              // there.
              const j = inCl.has(ia) && !G.has(ib) ? ib : inCl.has(ib) && !G.has(ia) ? ia : null;
              if (j == null || loose.has(j)) continue;
              const M = along(c, j, asLayer);
              if (!M) continue;
              settle(j, M);
              cl.push(j);
              inCl.add(j);
              used.push(c);
              laid = true;
              break;
            }
            if (laid) break;
          }
        }
      clusters.push(cl);
      holds.push(used);
    }
    clustersOut = clusters;
    layersOut = layers;
    // Explode: each input of a cluster away from the centre of the seams that hold the cluster.
    if (explode > 0)
      clusters.forEach((cl, n) => {
        if (cl.length < 2) return;
        const seamPts: Pt2[] = [];
        for (const c of holds[n])
          for (const id of [c.a, c.b]) {
            const e = c.kind === 'surface' ? null : resolveEdge(id, geoms);
            const g = G.get(inOf(id)!);
            const l = local.get(pieceKeyOf(id));
            if (e && g && l) seamPts.push(...e.pts.map((p) => apply(compose(g, l), p)));
          }
        const rings = cl.flatMap((i) => ringsOf(i, G.get(i)!).flat());
        const centre = centroidOf(seamPts.length ? seamPts : rings);
        const gap = extentOf(boxOf(rings)) * explode;
        for (const i of cl) {
          const c = centroidOf(ringsOf(i, G.get(i)!).flat());
          const dx = c[0] - centre[0];
          const dy = c[1] - centre[1];
          const d = Math.hypot(dx, dy);
          if (d > 1e-6) G.set(i, compose(translate((dx / d) * gap, (dy / d) * gap), G.get(i)!));
        }
      });
    if (opts.garmentLayout) {
      // Whole-garment pictures dock independent rigid clusters at outline support points.
      const extrema = (points: readonly Pt2[]) => ({
        left: points.reduce((best, point) => (point[0] < best[0] ? point : best)),
        right: points.reduce((best, point) => (point[0] > best[0] ? point : best)),
        low: points.reduce((best, point) => (point[1] < best[1] ? point : best)),
        high: points.reduce((best, point) => (point[1] > best[1] ? point : best)),
      });
      const placed: Pt2[] = [];
      clusters.forEach((cl, n) => {
        let points = cl.flatMap((i) => ringsOf(i, G.get(i)!).flat());
        if (n > 0 && placed.length && points.length) {
          const host = extrema(placed);
          const part = extrema(points);
          const candidates: Pt2[] = [
            [host.right[0] - part.left[0], host.right[1] - part.left[1]],
            [host.left[0] - part.right[0], host.left[1] - part.right[1]],
            [host.high[0] - part.low[0], host.high[1] - part.low[1]],
            [host.low[0] - part.high[0], host.low[1] - part.high[1]],
          ];
          const score = ([dx, dy]: Pt2) => {
            const joined = [...placed, ...points.map(([x, y]) => [x + dx, y + dy] as Pt2)];
            const b = boxOf(joined);
            const width = Math.max(b.x1 - b.x0, 1);
            const height = Math.max(b.y1 - b.y0, 1);
            return (
              Math.abs(Math.log(width / height / (204 / 178))) * width * height + width * height
            );
          };
          const [dx, dy] = candidates.reduce((best, candidate) =>
            score(candidate) < score(best) ? candidate : best,
          );
          const M = translate(dx, dy);
          for (const i of cl) G.set(i, compose(M, G.get(i)!));
          points = points.map((point) => apply(M, point));
        }
        placed.push(...points);
      });
    } else {
      // Editor tiles keep the established shelves: exploded and unresolved inputs stand apart.
      const cbox = clusters.map((cl) => boxOf(cl.flatMap((i) => ringsOf(i, G.get(i)!).flat())));
      const gapMm = APART * unit;
      const sumArea = cbox.reduce(
        (sum, box) => sum + (box.x1 - box.x0 + gapMm) * (box.y1 - box.y0 + gapMm),
        0,
      );
      const rowW = Math.max(cbox[0].x1 - cbox[0].x0, 1.3 * Math.sqrt(sumArea));
      let x = cbox[0].x0;
      let top = cbox[0].y1;
      let rowLow = Infinity;
      clusters.forEach((cluster, index) => {
        const box = cbox[index];
        const width = box.x1 - box.x0;
        if (index > 0 && x + width > cbox[0].x0 + rowW && x > cbox[0].x0) {
          x = cbox[0].x0;
          top = rowLow - gapMm;
          rowLow = Infinity;
        }
        const move = translate(x - box.x0, top - box.y1);
        for (const inputIndex of cluster) G.set(inputIndex, compose(move, G.get(inputIndex)!));
        rowLow = Math.min(rowLow, top - (box.y1 - box.y0));
        x += width + gapMm;
      });
    }

    // Draw order: a part laid on its host after the host, so it shows on top.
    const onTop = new Set(
      seams.flatMap((c) => (c.kind === 'surface' && c.surface ? [c.surface.part] : [])),
    );
    T = new Map<string, Affine>(
      [...keys.filter((k) => !onTop.has(k)), ...keys.filter((k) => onTop.has(k))].map((k) => [
        k,
        compose(G.get(input.get(k)!)!, local.get(k)!),
      ]),
    );
    ghosts = ghostsLocal.map((g) => ({
      ...g,
      ring: g.ring.map((p) => apply(G.get(g.input)!, p)),
    }));

    // The invariant. Exploded inputs never touch; joined ones may share a hair along the seam.
    const tol = explode > 0 ? 0 : TOUCH;
    const R = new Map(ins.map((i) => [i, rastersOf(i, G.get(i)!)]));
    let culprit: number | null = null;
    for (let p = 0; p < ins.length && culprit == null; p++)
      for (let q = p + 1; q < ins.length && culprit == null; q++) {
        const i = ins[p];
        const j = ins[q];
        if (onEachOther.has(pairKey(i, j))) continue;
        if (rigidInputs && clusters.some((cluster) => cluster.includes(i) && cluster.includes(j)))
          continue;
        let o = 0;
        for (const a of R.get(i)!) for (const b of R.get(j)!) o = Math.max(o, pairOverlap(a, b));
        // A hand placement holds: the guessed input gives way to it.
        if (o > tol)
          culprit =
            held.has(i) !== held.has(j) ? (held.has(i) ? j : i) : area(i) <= area(j) ? i : j;
      }
    if (culprit == null || loose.has(culprit)) break;
    loose.add(culprit);
  }

  for (const k of pinned) {
    const h = hands.get(k)!;
    const onto = T.get(h.target.partner);
    if (onto) T.set(k, compose(onto, snapOf(h)));
  }

  const stacksOut = [...stacked, ...crossStacks];
  if (opts.garmentLayout) {
    // A seeded earlier output can contain more than one disconnected body even when this step has a
    // single input, so cluster packing above cannot see it. Keep each existing body rigid and dock
    // every smaller one at an outline support point. This is the final corpus-wide invariant: every
    // visible cut outline belongs to one touching picture, never a loose row beside it.
    const rings = new Map(keys.map((key) => [key, worldOf(geoms.get(key)!, T.get(key)!)]));
    const root = new Map(keys.map((key) => [key, key]));
    const find = (key: string): string => {
      const parent = root.get(key)!;
      if (parent === key) return key;
      const resolved = find(parent);
      root.set(key, resolved);
      return resolved;
    };
    const join = (a: string, b: string) => root.set(find(a), find(b));
    for (const stack of [...stacked, ...crossStacks])
      for (const key of stack.slice(1))
        if (root.has(stack[0]) && root.has(key)) join(stack[0], key);
    for (const [piece, partner] of pieceLayers)
      if (root.has(piece) && root.has(partner)) join(piece, partner);
    for (const [layerInput, partnerInput] of layersOut) {
      const layer = keys.find((key) => input.get(key) === layerInput);
      const partner = keys.find((key) => input.get(key) === partnerInput);
      if (layer && partner) join(layer, partner);
    }
    const close = (a: readonly Pt2[], b: readonly Pt2[]) => {
      const A = boxOf(a);
      const B = boxOf(b);
      const distance = 2;
      if (Math.max(A.x0 - B.x1, B.x0 - A.x1, A.y0 - B.y1, B.y0 - A.y1, 0) > distance) return false;
      const grid = new Map<string, Pt2[]>();
      for (const point of b) {
        const cell = `${Math.floor(point[0] / distance)}:${Math.floor(point[1] / distance)}`;
        grid.set(cell, [...(grid.get(cell) ?? []), point]);
      }
      return a.some(([x, y]) => {
        const gx = Math.floor(x / distance);
        const gy = Math.floor(y / distance);
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++)
            if (
              (grid.get(`${gx + dx}:${gy + dy}`) ?? []).some(
                (point) => Math.hypot(x - point[0], y - point[1]) <= distance,
              )
            )
              return true;
        return false;
      });
    };
    for (let left = 0; left < keys.length; left++)
      for (let right = left + 1; right < keys.length; right++)
        if (close(rings.get(keys[left])!, rings.get(keys[right])!)) join(keys[left], keys[right]);
    const bodies = new Map<string, string[]>();
    for (const key of keys) bodies.set(find(key), [...(bodies.get(find(key)) ?? []), key]);
    const groups = [...bodies.values()].sort((a, b) => {
      const area = (group: readonly string[]) => {
        const box = boxOf(group.flatMap((key) => rings.get(key)!));
        return (box.x1 - box.x0) * (box.y1 - box.y0);
      };
      return area(b) - area(a);
    });
    const hiddenForDock = new Set([
      ...[...stacked, ...crossStacks].flatMap((group) => group.slice(1)),
      ...pieceLayers.map(([piece]) => piece),
      ...keys.filter((key) => layersOut.some(([layer]) => input.get(key) === layer)),
    ]);
    const docked: Pt2[] = [];
    for (const [index, group] of groups.entries()) {
      let points = group.filter((key) => !hiddenForDock.has(key)).flatMap((key) => rings.get(key)!);
      if (!points.length) continue;
      if (index > 0 && docked.length) {
        const supports = (outline: readonly Pt2[]) => ({
          left: outline.reduce((best, point) => (point[0] < best[0] ? point : best)),
          right: outline.reduce((best, point) => (point[0] > best[0] ? point : best)),
          low: outline.reduce((best, point) => (point[1] < best[1] ? point : best)),
          high: outline.reduce((best, point) => (point[1] > best[1] ? point : best)),
        });
        const host = supports(docked);
        const part = supports(points);
        const candidates: Pt2[] = [
          [host.right[0] - part.left[0], host.right[1] - part.left[1]],
          [host.left[0] - part.right[0], host.left[1] - part.right[1]],
          [host.high[0] - part.low[0], host.high[1] - part.low[1]],
          [host.low[0] - part.high[0], host.low[1] - part.high[1]],
        ];
        const score = ([dx, dy]: Pt2) => {
          const box = boxOf([...docked, ...points.map(([x, y]) => [x + dx, y + dy] as Pt2)]);
          const width = Math.max(box.x1 - box.x0, 1);
          const height = Math.max(box.y1 - box.y0, 1);
          return Math.abs(Math.log(width / height / (204 / 178))) * width * height + width * height;
        };
        const [dx, dy] = candidates.reduce((best, candidate) =>
          score(candidate) < score(best) ? candidate : best,
        );
        const move = translate(dx, dy);
        for (const key of group) {
          T.set(key, compose(move, T.get(key)!));
          rings.set(
            key,
            rings.get(key)!.map((point) => apply(move, point)),
          );
        }
        for (const ghost of ghosts)
          if (group.some((key) => input.get(key) === ghost.input))
            ghost.ring = ghost.ring.map((point) => apply(move, point));
        points = points.map((point) => apply(move, point));
      }
      docked.push(...points);
    }

    // A pair can be two cut plies of one detail. A larger run of identical panels is construction
    // repetition (gore, bag side, patchwork), and must be assembled rather than collapsed.
    const hidden = new Set(stacksOut.flatMap((group) => group.slice(1)));
    const surfaceRoles = new Set(['pocket', 'facing', 'placket', 'fly']);
    const isSurfaceDetail = (key: string) => {
      const reading = readName(geoms.get(key)!.name);
      const role = ROLE_BOOK.roles.find((candidate) => candidate.id === reading.role);
      return (
        !!reading.role &&
        surfaceRoles.has(reading.role) &&
        !!reading.family &&
        !!role?.tokens.includes(reading.family)
      );
    };
    for (let left = 0; left < keys.length; left++)
      for (let right = left + 1; right < keys.length; right++) {
        const a = keys[left];
        const b = keys[right];
        const overlap = pairOverlap(rasterize(rings.get(a)!, 2), rasterize(rings.get(b)!, 2));
        if (overlap <= JOINED_OVERLAP) continue;
        const layer = isSurfaceDetail(a) ? a : isSurfaceDetail(b) ? b : null;
        const partner = layer === a ? b : layer === b ? a : null;
        if (layer && partner && !pieceLayers.some(([piece]) => piece === layer))
          pieceLayers.push([layer, partner]);
      }
    const hiddenOutline = () =>
      new Set([
        ...hidden,
        ...pieceLayers.map(([piece]) => piece),
        ...keys.filter((key) => layersOut.some(([layer]) => input.get(key) === layer)),
      ]);
    const supportMove = (host: readonly Pt2[], part: readonly Pt2[]) => {
      const supports = (outline: readonly Pt2[]) => ({
        left: outline.reduce((best, point) => (point[0] < best[0] ? point : best)),
        right: outline.reduce((best, point) => (point[0] > best[0] ? point : best)),
        low: outline.reduce((best, point) => (point[1] < best[1] ? point : best)),
        high: outline.reduce((best, point) => (point[1] > best[1] ? point : best)),
      });
      const h = supports(host);
      const p = supports(part);
      const candidates: Pt2[] = [
        [h.right[0] - p.left[0], h.right[1] - p.left[1]],
        [h.left[0] - p.right[0], h.left[1] - p.right[1]],
        [h.high[0] - p.low[0], h.high[1] - p.low[1]],
        [h.low[0] - p.high[0], h.low[1] - p.high[1]],
      ];
      const visible = keys.filter((key) => !hiddenOutline().has(key));
      const score = ([dx, dy]: Pt2) => {
        const moved = part.map(([x, y]) => [x + dx, y + dy] as Pt2);
        const overlap = visible.reduce(
          (sum, key) => sum + pairOverlap(rasterize(moved, 2), rasterize(rings.get(key)!, 2)),
          0,
        );
        const box = boxOf([...host, ...moved]);
        const width = Math.max(box.x1 - box.x0, 1);
        const height = Math.max(box.y1 - box.y0, 1);
        const area = width * height;
        return (
          overlap * area * 100 + Math.abs(Math.log(width / height / (204 / 178))) * area + area
        );
      };
      return candidates.reduce((best, candidate) =>
        score(candidate) < score(best) ? candidate : best,
      );
    };
    const movePiece = (key: string, [dx, dy]: Pt2) => {
      const move = translate(dx, dy);
      T.set(key, compose(move, T.get(key)!));
      rings.set(
        key,
        rings.get(key)!.map((point) => apply(move, point)),
      );
    };

    // Resolve any accidental covering left after rigid earlier-output placement. Semantic surface
    // layers and identical plies were classified above; every other pair meets at its outline only.
    for (let pass = 0; pass < keys.length; pass++) {
      const visible = keys.filter((key) => !hiddenOutline().has(key));
      let fixed = false;
      for (let left = 0; left < visible.length && !fixed; left++)
        for (let right = left + 1; right < visible.length && !fixed; right++) {
          const a = visible[left];
          const b = visible[right];
          if (
            pairOverlap(rasterize(rings.get(a)!, 2), rasterize(rings.get(b)!, 2)) <= JOINED_OVERLAP
          )
            continue;
          const area = (key: string) => {
            const box = boxOf(rings.get(key)!);
            return (box.x1 - box.x0) * (box.y1 - box.y0);
          };
          const mover = area(a) <= area(b) ? a : b;
          const host = mover === a ? b : a;
          movePiece(mover, supportMove(rings.get(host)!, rings.get(mover)!));
          fixed = true;
        }
      if (!fixed) break;
    }

    // Hiding a folded layer can expose a formerly layer-to-layer contact. Dock any resulting loose
    // visible outline once more, against the largest visible body.
    for (let pass = 0; pass < keys.length; pass++) {
      const visible = keys.filter((key) => !hiddenOutline().has(key));
      const loose = visible.find(
        (key) =>
          !visible.some((other) => other !== key && close(rings.get(key)!, rings.get(other)!)),
      );
      if (!loose || visible.length < 2) break;
      const hosts = visible.filter((key) => key !== loose);
      const host = hosts.reduce((best, key) => {
        const area = (candidate: string) => {
          const box = boxOf(rings.get(candidate)!);
          return (box.x1 - box.x0) * (box.y1 - box.y0);
        };
        return area(key) > area(best) ? key : best;
      });
      movePiece(loose, supportMove(rings.get(host)!, rings.get(loose)!));
    }

    // Long tapes/bindings on a narrow product sit outside the body edge they finish, not centred on
    // it. This also lets a tall bag use the print box without distorting any cut geometry.
    const visible = keys.filter((key) => !hiddenOutline().has(key));
    const thin = visible.filter((key) => {
      const box = boxOf(rings.get(key)!);
      return box.y1 - box.y0 > 4 * Math.max(box.x1 - box.x0, 1);
    });
    const body = visible.filter((key) => !thin.includes(key));
    if (thin.length === 2 && body.length === 1) {
      const bodyBox = boxOf(body.flatMap((key) => rings.get(key)!));
      const full = boxOf(visible.flatMap((key) => rings.get(key)!));
      const bodyWidth = Math.max(bodyBox.x1 - bodyBox.x0, 1);
      const tapeLike = thin.every((key) => {
        const box = boxOf(rings.get(key)!);
        return box.x1 - box.x0 <= 0.15 * bodyWidth;
      });
      if (tapeLike && (full.x1 - full.x0) / Math.max(full.y1 - full.y0, 1) < (204 / 178) * 0.6) {
        const centre = (bodyBox.x0 + bodyBox.x1) / 2;
        for (const key of thin) {
          const box = boxOf(rings.get(key)!);
          const left = (box.x0 + box.x1) / 2 < centre;
          movePiece(key, [left ? bodyBox.x0 - box.x1 : bodyBox.x1 - box.x0, 0]);
        }
      }
    }

    // Last safety pass after edge tapes move: keep one largest anchor fixed and dock every outline
    // that still has no neighbour. Later docks use the whole connected anchor, so none is undone.
    const finalVisible = keys.filter((key) => !hiddenOutline().has(key));
    if (finalVisible.length > 1) {
      const area = (key: string) => {
        const box = boxOf(rings.get(key)!);
        return (box.x1 - box.x0) * (box.y1 - box.y0);
      };
      const anchor = finalVisible.reduce((best, key) => (area(key) > area(best) ? key : best));
      const anchored = [anchor];
      for (const key of finalVisible) {
        if (key === anchor) continue;
        if (anchored.some((other) => close(rings.get(key)!, rings.get(other)!))) {
          anchored.push(key);
          continue;
        }
        const host = anchored.flatMap((other) => rings.get(other)!);
        movePiece(key, supportMove(host, rings.get(key)!));
        anchored.push(key);
      }
    }

    // A completed waistband is the product's top edge. Repeated band sections form one horizontal
    // run immediately above the assembled body; generic compact packing must not shelve them below.
    const waistbands = finalVisible.filter(
      (key) => readName(geoms.get(key)!.name).role === 'waistband',
    );
    const belowWaist = finalVisible.filter((key) => !waistbands.includes(key));
    const waistPanels = belowWaist.filter((key) => {
      const box = boxOf(rings.get(key)!);
      const width = Math.max(box.x1 - box.x0, 1);
      const height = Math.max(box.y1 - box.y0, 1);
      return Math.max(width, height) < 5 * Math.min(width, height);
    });
    const raisedWaistbands = new Set<string>();
    if (waistbands.length && waistPanels.length >= 2) {
      waistbands.forEach((key) => raisedWaistbands.add(key));
      const bodyBox = boxOf(belowWaist.flatMap((key) => rings.get(key)!));
      const body = belowWaist.flatMap((key) => rings.get(key)!);
      const high = body.reduce((best, point) => (point[1] > best[1] ? point : best));
      let x = 0;
      waistbands.forEach((key, index) => {
        const box = boxOf(rings.get(key)!);
        if (index === 0) {
          const low = rings.get(key)!.reduce((best, point) => (point[1] < best[1] ? point : best));
          movePiece(key, [high[0] - low[0], bodyBox.y1 - box.y0]);
        } else movePiece(key, [x - box.x0, bodyBox.y1 - box.y0]);
        x = boxOf(rings.get(key)!).x1;
      });
    }

    // A collar is the neckline finish, not generic tape. Put its lower centre on the body's upper
    // centre; this remains name-language agnostic through the shared role dictionary.
    const collars = finalVisible.filter((key) => readName(geoms.get(key)!.name).role === 'collar');
    const collarBody = finalVisible.filter((key) => !collars.includes(key));
    if (collars.length && collarBody.length) {
      const body = collarBody.flatMap((key) => rings.get(key)!);
      const bodyBox = boxOf(body);
      const centre = (bodyBox.x0 + bodyBox.x1) / 2;
      const neck = body
        .filter(([x]) => Math.abs(x - centre) <= 0.25 * (bodyBox.x1 - bodyBox.x0))
        .reduce((best, point) => (point[1] > best[1] ? point : best));
      for (const key of collars) {
        const points = rings.get(key)!;
        const box = boxOf(points);
        const middle = (box.x0 + box.x1) / 2;
        const low = points
          .filter(([x]) => Math.abs(x - middle) <= 0.35 * (box.x1 - box.x0))
          .reduce((best, point) => (point[1] < best[1] ? point : best));
        movePiece(key, [neck[0] - low[0], neck[1] - low[1]]);
      }
    }

    // Tapes, bindings and belt-length strips are edge treatments, not a second product silhouette.
    // Keep a usable strip on the matching body edge; a strip longer than the whole body is shown as
    // a folded construction trace instead of stretching the frame away from the product.
    if (finalVisible.length > 1) {
      const main = finalVisible.reduce((best, key) => {
        const rank = (candidate: string) => {
          const geom = geoms.get(candidate)!;
          const box = boxOf(rings.get(candidate)!);
          const width = Math.max(box.x1 - box.x0, 1);
          const height = Math.max(box.y1 - box.y0, 1);
          return Math.abs(geom.areaMm2) * (Math.min(width, height) / Math.max(width, height));
        };
        const a = rank(best);
        const b = rank(key);
        return b > a ? key : best;
      });
      const bodyBox = boxOf(rings.get(main)!);
      const bodyWidth = Math.max(bodyBox.x1 - bodyBox.x0, 1);
      const bodyHeight = Math.max(bodyBox.y1 - bodyBox.y0, 1);
      const bodySpan = Math.max(bodyWidth, bodyHeight);
      let verticalSide = 0;
      for (const key of finalVisible) {
        if (
          key === main ||
          raisedWaistbands.has(key) ||
          collars.includes(key) ||
          pieceLayers.some(([piece]) => piece === key)
        )
          continue;
        const box = boxOf(rings.get(key)!);
        const width = Math.max(box.x1 - box.x0, 1);
        const height = Math.max(box.y1 - box.y0, 1);
        const span = Math.max(width, height);
        if (span < 4 * Math.min(width, height)) continue;
        if (span > 1.2 * bodySpan) {
          pieceLayers.push([key, main]);
          continue;
        }
        if (height >= width) {
          const left = verticalSide++ % 2 === 0;
          movePiece(key, [
            left ? bodyBox.x0 - box.x1 : bodyBox.x1 - box.x0,
            (bodyBox.y0 + bodyBox.y1 - box.y0 - box.y1) / 2,
          ]);
        } else {
          movePiece(key, [(bodyBox.x0 + bodyBox.x1 - box.x0 - box.x1) / 2, bodyBox.y1 - box.y0]);
        }
        const partner = finalVisible.find(
          (other) =>
            other !== key &&
            !pieceLayers.some(([piece]) => piece === other) &&
            pairOverlap(rasterize(rings.get(key)!, 2), rasterize(rings.get(other)!, 2)) >
              JOINED_OVERLAP,
        );
        if (partner) pieceLayers.push([key, partner]);
      }
    }

    // Semantic edge treatments above are the last motions in the layout. Re-assert the two hard
    // print invariants afterwards: visible cut pieces neither cover one another nor float. This is
    // deliberately geometry-only, so it also covers unnamed/Russian pattern pieces.
    for (let pass = 0; pass < keys.length; pass++) {
      const visible = keys.filter((key) => !hiddenOutline().has(key));
      let fixed = false;
      for (let left = 0; left < visible.length && !fixed; left++)
        for (let right = left + 1; right < visible.length && !fixed; right++) {
          const a = visible[left];
          const b = visible[right];
          if (
            pairOverlap(rasterize(rings.get(a)!, 2), rasterize(rings.get(b)!, 2)) <= JOINED_OVERLAP
          )
            continue;
          const boxArea = (key: string) => {
            const box = boxOf(rings.get(key)!);
            return (box.x1 - box.x0) * (box.y1 - box.y0);
          };
          const mover = boxArea(a) <= boxArea(b) ? a : b;
          const host = mover === a ? b : a;
          movePiece(mover, supportMove(rings.get(host)!, rings.get(mover)!));
          fixed = true;
        }
      if (!fixed) break;
    }

    const settled = keys.filter((key) => !hiddenOutline().has(key));
    if (settled.length > 1) {
      const boxArea = (key: string) => {
        const box = boxOf(rings.get(key)!);
        return (box.x1 - box.x0) * (box.y1 - box.y0);
      };
      const anchor = settled.reduce((best, key) => (boxArea(key) > boxArea(best) ? key : best));
      const anchored = [anchor];
      for (const key of settled) {
        if (key === anchor) continue;
        if (anchored.some((other) => close(rings.get(key)!, rings.get(other)!))) {
          anchored.push(key);
          continue;
        }
        movePiece(
          key,
          supportMove(
            anchored.flatMap((other) => rings.get(other)!),
            rings.get(key)!,
          ),
        );
        anchored.push(key);
      }
    }

    // Overlap repair may have moved a narrow band off a dense waist seam. The product silhouette
    // gets the last word: restore the complete band as one centred run immediately above the body.
    if (raisedWaistbands.size) {
      const body = belowWaist.flatMap((key) => rings.get(key)!);
      const widths = waistbands.map((key) => {
        const box = boxOf(rings.get(key)!);
        return box.x1 - box.x0;
      });
      const high = body.reduce((best, point) => (point[1] > best[1] ? point : best));
      const first = waistbands[0];
      const low = rings.get(first)!.reduce((best, point) => (point[1] < best[1] ? point : best));
      movePiece(first, [high[0] - low[0], high[1] - low[1]]);
      let x = boxOf(rings.get(first)!).x1;
      waistbands.forEach((key, index) => {
        if (index === 0) return;
        const box = boxOf(rings.get(key)!);
        movePiece(key, [x - box.x0, high[1] - box.y0]);
        x += widths[index];
      });
    }
  }

  const bbox = boxOf([
    ...keys.flatMap((k) => worldOf(geoms.get(k)!, T.get(k)!)),
    ...ghosts.flatMap((g) => g.ring),
  ]);
  return {
    T,
    input,
    ghosts,
    stacked: stacksOut,
    onRuns: [...onRuns, ...crossRuns],
    apart,
    clusters: clustersOut,
    layers: layersOut,
    pieceLayers,
    hand: hands,
    bbox,
  };
}

// A background guess (not a step's own proposal) shapes a unit from the model's GUESS_OK down: a pair
// that fits both ways (each side on a piece its input expects, nothing against it) and no worse.
// Card 83: side and shoulder seams −0.09…−0.11, a placket's free edge guessed onto the back hem −0.01.

/**
 * Seams earlier steps made inside one input of this step — stored rows, the steps' own proposals
 * and the model's better guesses, as the placer reads them — beside what the engine reads there
 * itself. An edge the engine already pairs with another partner (sure or not) is its call, not a
 * guess's — the very pair it reads, a step confirms; a layer's other edge is the one exception
 * (a cuff's two faces are paired along both long edges, yet one of them is the sleeve's). The
 * placer still refuses a seam that would land a piece on another or fold it over.
 */
export function earlierInner(
  pairs: readonly SewnPair[],
  leaves: readonly (readonly string[])[],
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLines: ReadonlyMap<string, readonly (readonly Pt2[])[]>,
  engine: readonly SeamCandidate[],
): SeamCandidate[] {
  const input = inputIndex(leaves);
  const inOf = (id: EdgeId) => input.get(pieceKeyOf(id));
  const identical = (ka: string, kb: string) =>
    !!geoms.get(ka)?.twinOf.some((t) => t.key === kb && t.kind === 'identical');
  // Each edge's partners as the engine reads them (both sides, parts included).
  const partners = new Map<EdgeId, EdgeId[]>();
  for (const c of engine) {
    if (c.kind === 'surface' || c.kind === 'closure-not-seam') continue;
    if (identical(pieceKeyOf(c.a), pieceKeyOf(c.b))) continue;
    const A = c.aParts ?? [c.a];
    const B = c.bParts ?? [c.b];
    for (const id of A) partners.set(id, [...(partners.get(id) ?? []), ...B]);
    for (const id of B) partners.set(id, [...(partners.get(id) ?? []), ...A]);
  }
  const out: SeamCandidate[] = [];
  for (const s of pairs) {
    if (!s.own && s.score > GUESS_OK) continue;
    const ids = [...s.a, ...s.b];
    if (!ids.length) continue;
    // What the engine pairs an edge with must lie within this pair (the same seam, or a part of
    // it read on its own — a back armhole without the front's); another partner is its call.
    const set = new Set(ids);
    if (ids.some((id) => (partners.get(id) ?? []).some((p) => !set.has(p)))) continue;
    const i = inOf(ids[0]);
    if (i == null || ids.some((id) => inOf(id) !== i)) continue;
    const c = seamOfSides(s, geoms, innerLines);
    if (c && c.kind !== 'surface') out.push(c);
  }
  return out;
}

// ─── screen ───────────────────────────────────────────────────────────────────────────────────────

export type Fit = { s: number; tx: number; ty: number };

/**
 * The picture fitted into a w × h px box with `pad` px kept free on every side, centred, y flipped
 * to screen. The scale fills the box on the tighter axis — a late step's whole shirt takes the
 * canvas, not a strip of it.
 */
export function fitBox(b: Box, w: number, h: number, pad: number): Fit {
  const bw = Math.max(b.x1 - b.x0, 1);
  const bh = Math.max(b.y1 - b.y0, 1);
  const iw = Math.max(w - 2 * pad, 1);
  const ih = Math.max(h - 2 * pad, 1);
  const s = Math.min(iw / bw, ih / bh);
  return {
    s,
    tx: pad + (iw - bw * s) / 2 - b.x0 * s,
    ty: pad + (ih - bh * s) / 2 + b.y1 * s,
  };
}

/** A picture-frame point (mm, y up) on screen (px, y down). */
export const toPx = (f: Fit, p: Pt2): Pt2 => [p[0] * f.s + f.tx, -p[1] * f.s + f.ty];

export const pathOf = (pts: readonly Pt2[], closed = false) =>
  pts.length
    ? `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}${closed ? 'Z' : ''}`
    : '';

/** The reflection across the line through `p` along the unit direction `t`. */
function reflectAcross(p: Pt2, t: Pt2): Affine {
  const a = 2 * t[0] * t[0] - 1;
  const b = 2 * t[0] * t[1];
  const d = 2 * t[1] * t[1] - 1;
  return [a, b, b, d, p[0] - (a * p[0] + b * p[1]), p[1] - (b * p[0] + d * p[1])];
}

/** The point halfway along a polyline and the unit tangent there. */
export function midAlong(pts: readonly Pt2[]): { p: Pt2; t: Pt2 } {
  if (pts.length < 2) return { p: pts[0] ?? [0, 0], t: [1, 0] };
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let left = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    const d = Math.hypot(dx, dy);
    if (d >= left && d > 0) {
      const k = left / d;
      return { p: [pts[i - 1][0] + k * dx, pts[i - 1][1] + k * dy], t: [dx / d, dy / d] };
    }
    left -= d;
  }
  const a = pts[pts.length - 2];
  const b = pts[pts.length - 1];
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { p: b, t: [(b[0] - a[0]) / d, (b[1] - a[1]) / d] };
}

/**
 * Where a label of an edge goes: `off` px off the edge's middle, INSIDE its own piece (towards
 * `inside`, the piece's centre), anchored so the text runs away from the line. Two sides of a seam
 * laid against each other so label into their own shapes, never both into the gap between them.
 */
export function labelSpot(
  pts: readonly Pt2[],
  inside: Pt2,
  off: number,
): { at: Pt2; anchor: 'start' | 'middle' | 'end'; t: Pt2 } {
  const { p, t } = midAlong(pts);
  let n: Pt2 = [t[1], -t[0]];
  if (n[0] * (inside[0] - p[0]) + n[1] * (inside[1] - p[1]) < 0) n = [-n[0], -n[1]];
  return {
    at: [p[0] + n[0] * off, p[1] + n[1] * off],
    anchor: Math.abs(n[0]) < 0.7 ? 'middle' : n[0] > 0 ? 'start' : 'end',
    t,
  };
}

export type LabelBox = {
  at: Pt2;
  anchor: 'start' | 'middle' | 'end';
  t: Pt2;
  w: number;
  h: number;
  /** A hide-mode label that reserves its spot even when it collides or leaves the frame. */
  required?: boolean;
  /** Boxes this label must also stay off (other inputs' shapes, for a unit's name). */
  avoid?: readonly Box[];
};

const rectOf = (l: LabelBox, at: Pt2) => {
  const x0 = l.anchor === 'start' ? at[0] : l.anchor === 'end' ? at[0] - l.w : at[0] - l.w / 2;
  return { x0, y0: at[1] - l.h / 2, x1: x0 + l.w, y1: at[1] + l.h / 2 };
};
const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Labels that would sit on each other (two facing edges both label into the gap between them) are
 * slid along their own edge, one label height at a time, alternating sides, until they stand clear.
 * Returns each label's final spot, in input order.
 */
export function spreadLabels(labels: readonly LabelBox[]): Pt2[] {
  const placed: Box[] = [];
  return labels.map((l) => {
    const step = l.h + 2;
    for (let i = 0; i < 12; i++) {
      const k = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1);
      const at: Pt2 = [l.at[0] + l.t[0] * step * k, l.at[1] + l.t[1] * step * k];
      const r = rectOf(l, at);
      if (!placed.some((p) => hits(p, r)) && !l.avoid?.some((p) => hits(p, r))) {
        placed.push(r);
        return at;
      }
    }
    placed.push(rectOf(l, l.at));
    return l.at;
  });
}

/** Canvas/result labels stay at their own spot; optional labels that collide or leave the frame hide. */
export function hideLabels(labels: readonly LabelBox[], bounds: Box): (Pt2 | null)[] {
  const placed: Box[] = [];
  return labels.map((label) => {
    const rect = rectOf(label, label.at);
    const outside =
      rect.x0 < bounds.x0 || rect.y0 < bounds.y0 || rect.x1 > bounds.x1 || rect.y1 > bounds.y1;
    const blocked =
      placed.some((placedRect) => hits(placedRect, rect)) ||
      label.avoid?.some((avoid) => hits(avoid, rect));
    if (!label.required && (outside || blocked)) return null;
    placed.push(rect);
    return label.at;
  });
}

// ─── partner, names ───────────────────────────────────────────────────────────────────────────────

/** A partner is offered within this share of the longer side. */
export const PARTNER_REL = 0.1;

/**
 * The edge on the other side closest in length to a picked side (ease applied), none within 10 %
 * or shorter than 30 mm → null. Never «0 mm»: a picked side either has a partner or stands alone.
 */
export function partnerOf(
  len: number,
  candidates: readonly { id: EdgeId; lenMm: number }[],
  delta: (a: number, b: number) => number,
): EdgeId | null {
  if (!(len > 0)) return null;
  let best: { id: EdgeId; rel: number } | null = null;
  for (const c of candidates) {
    if (c.lenMm < 30) continue;
    const rel = delta(len, c.lenMm) / Math.max(len, c.lenMm, 1);
    if (rel > PARTNER_REL) continue;
    if (!best || rel < best.rel) best = { id: c.id, rel };
  }
  return best?.id ?? null;
}

/**
 * An input's one human name: a piece by its own name, a unit by the name its producing step gave
 * it (the latest earlier step that names it), else its key read as words.
 */
export function inputName(
  key: string,
  index: number,
  ops: readonly { outputUnitKey?: string; outputUnitName?: string }[],
  isPiece: (key: string) => boolean,
  pieceName: (key: string) => string,
): string {
  if (isPiece(key)) return pieceName(key);
  for (let i = index - 1; i >= 0; i--) {
    const o = ops[i];
    if ((o?.outputUnitKey ?? '').trim() === key && (o?.outputUnitName ?? '').trim())
      return (o?.outputUnitName ?? '').trim();
  }
  return unitDisplayName({ key });
}
