// THE STEP PICTURE, PURE (seam picker v2, owner OK 27.10): a step's inputs drawn as UNITS — each
// input's leaf pieces laid as assembled by the card's own placer (`unionLayout`, the one the unit
// pictograms and the assembly map use), the inputs laid along the step's seam and then pulled
// apart, like the map's PairShape. The picker, its RESULT panel and the SEAMS row tile share it.
//
// Frames. A piece's segmentation (`PieceGeom`: `rs`, edges) is mm with y UP; the layout keeps that
// frame (an affine per piece). Only `fitBox` turns it into screen px with y DOWN. The drawing
// frame's inner lines (y down) come in as [x, −y].

import type { Affine, EdgeId, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
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
  /** Extent of every drawn piece and ghost, picture frame. */
  bbox: Box;
};

const EMPTY_LAYOUT: StepLayout = {
  T: new Map(),
  input: new Map(),
  ghosts: [],
  stacked: [],
  onRuns: [],
  bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
};

const worldOf = (g: PieceGeom, T: Affine) => g.rs.map((p) => apply(T, p));
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
/** An input that lands on another is pushed off the seam by this share of the unit, a step at a time. */
const PUSH = 0.02;
const PUSH_MAX = 12;
/** The engine's own reading shapes a unit from this score up, with no rival. */
const CONFIDENT = 0.9;

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
 * An input on its own: its pieces along its inner seams, upright and clear of each other; pieces
 * the placer leaves out stand beside in a row, their own way up, a small gap between.
 */
function layInput(
  keys: readonly string[],
  inner: readonly SeamCandidate[],
  geoms: ReadonlyMap<string, PieceGeom>,
  raster: { rasterMm?: number },
): { T: Map<string, Affine>; stacked: string[][]; onRuns: string[] } {
  const L = unionLayout(keys, inner, geoms, { ...raster, overlapMax: TOUCH, uprightMax: UPRIGHT });
  const T = new Map<string, Affine>(L.placements.map((p) => [p.pieceKey, p.T]));
  const left = keys.filter((k) => !T.has(k));
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
  return { T, stacked: L.stacked, onRuns: L.onRuns ?? [] };
}

/** The inverse of a (non-degenerate) affine. */
export function invert(T: Affine): Affine {
  const [a, b, c, d, e, f] = T;
  const k = a * d - b * c || 1;
  return [d / k, -b / k, -c / k, a / k, (c * f - d * e) / k, (b * e - a * f) / k];
}

const pairKey = (i: number, j: number) => (i < j ? `${i}:${j}` : `${j}:${i}`);

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
 * part on its host. Any other overlap the seams leave is undone: that input stands alone and the
 * step is laid again, at worst every input on the shelves, which never touch.
 */
export function stepLayout(
  leaves: readonly (readonly string[])[],
  seams: readonly SeamCandidate[],
  geoms: ReadonlyMap<string, PieceGeom>,
  opts: { explode?: number; rasterMm?: number } = {},
): StepLayout {
  const input = inputIndex(leaves);
  const drawable = (k: string) => (geoms.get(k)?.rs.length ?? 0) >= 3;
  const keys = [...input.keys()].filter(drawable);
  if (keys.length === 0) return EMPTY_LAYOUT;
  const raster = opts.rasterMm ? { rasterMm: opts.rasterMm } : {};
  const explode = opts.explode ?? 0;
  const ins = leaves.map((_, i) => i).filter((i) => [...input.values()].includes(i));
  const inOf = (id: EdgeId) => input.get(pieceKeyOf(id));
  const keysOf = (i: number) => keys.filter((k) => input.get(k) === i);

  // ── 1. each input alone ──
  const local = new Map<string, Affine>();
  const localBox = new Map<number, Box>();
  const stacked: string[][] = [];
  const onRuns: string[] = [];
  for (const i of ins) {
    const ks = keysOf(i);
    if (!ks.length) continue;
    const inner = seams.filter((c) => inOf(c.a) === i && inOf(c.b) === i && confidentSeam(c));
    const laid = layInput(ks, inner, geoms, raster);
    for (const [k, t] of laid.T) local.set(k, t);
    stacked.push(...laid.stacked);
    onRuns.push(...laid.onRuns);
    localBox.set(i, boxOf(ks.flatMap((k) => worldOf(geoms.get(k)!, local.get(k)!))));
  }
  // A layer under its identical twin is not a shape of its own: it leans as the twin's edge says.
  const followers = new Set(stacked.flatMap((s) => s.slice(1)));
  // Ghosts: a square a quarter of the largest input, in a row after their input's pieces.
  const unit = Math.max(...[...localBox.values()].map(extentOf), 1);
  const side = 0.25 * unit;
  const ghostsLocal: Ghost[] = [];
  for (const i of ins) {
    const missing = [...input].filter(([k, gi]) => gi === i && !drawable(k)).map(([k]) => k);
    const b = localBox.get(i);
    let x = b ? b.x1 + APART * unit : 0;
    for (const k of missing) {
      ghostsLocal.push({ key: k, input: i, ring: squareAt(x, b ? b.y0 : 0, side) });
      x += side + APART * unit;
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
  const cross = seams
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
  const rastersOf = (i: number, M: Affine) => ringsOf(i, M).map((r) => rasterize(r, step));
  const order = [...ins].sort((p, q) => area(q) - area(p));

  // Inputs the seams cannot lay clear stand on their own; the step is laid again without them.
  const loose = new Set<number>();
  const G = new Map<number, Affine>();
  let T = new Map<string, Affine>();
  let ghosts: Ghost[] = [];
  // Layers laid on their twins across inputs (a cuff's second face as its own input).
  let crossStacks: string[][] = [];
  // Inputs set into another input's run (a sleeve into the body's armhole).
  let crossRuns: string[] = [];
  for (;;) {
    G.clear();
    crossStacks = [];
    // Pairs drawn on each other on purpose: a layer on its identical twin, a part on its host.
    const onEachOther = new Set<string>();
    let placedRasters: Raster[] = [];
    const settle = (i: number, M: Affine) => {
      G.set(i, M);
      placedRasters.push(...rastersOf(i, M));
    };
    const overlapAt = (j: number, M: Affine) => {
      let o = 0;
      for (const r of rastersOf(j, M))
        for (const p of placedRasters) o = Math.max(o, pairOverlap(r, p));
      return o;
    };
    /** The motion of input `j` that lays its side of `c` on the placed side, or null: not clear. */
    const along = (c: SeamCandidate, j: number): Affine | null => {
      const mine = inOf(c.a) === j ? c.a : c.b;
      const theirs = mine === c.a ? c.b : c.a;
      if (c.kind === 'surface') {
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
      const Tt = compose(Ht, local.get(kb)!);
      // Their side across several pieces of their input (an armhole of front + back): one run.
      const theirParts = (theirs === c.a ? c.aParts : c.bParts) ?? [];
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
      const A = run ?? ea.pts.map((p) => apply(Tt, p));
      const B = eb.pts.map((p) => apply(local.get(ka)!, p));
      const a0 = A[0];
      const a1 = A[A.length - 1];
      const mineKeys = keysOf(j);
      const stack =
        mineKeys.length === 1 && keysOf(i).length === 1 && identicalPair(c, geoms, ka, kb);
      // A layer goes ON its twin only in the joined result; an exploded canvas keeps them apart.
      if (stack && explode > 0) return null;
      const upright = (M: Affine) =>
        mineKeys.every(
          (k) => followers.has(k) || pieceTilt(geoms.get(k)!, compose(M, local.get(k)!)) <= UPRIGHT,
        );
      // Off the seam: along the laid edge's normal, away from the input it belongs to (for a run,
      // away from all the pieces it runs across).
      const hc = run
        ? centroidOf(keysOf(i).flatMap((k) => worldOf(geoms.get(k)!, compose(Ht, local.get(k)!))))
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
        let off = 0;
        for (let n = 1; o > TOUCH && n <= PUSH_MAX; n++) {
          off = n * PUSH * unit;
          M = compose(translate(nx * off, ny * off), M0);
          o = overlapAt(j, M);
        }
        if (o > TOUCH) return;
        const score = cost + off;
        if (!best || score < best.score) best = { M, score };
      };
      if (stack) {
        // A layer goes ON its twin, drawn alike: straight onto it first (its own way up whichever
        // edge the seam names); only a twin drawn another way is covered by turning along the seam.
        const mc = centroidOf(worldOf(geoms.get(ka)!, local.get(ka)!));
        const M = translate(hc[0] - mc[0], hc[1] - mc[1]);
        best = { M, score: -overlapAt(j, M) * 1000 + (upright(M) ? 0 : 500) };
      }
      for (const rev of [false, true])
        for (const mir of [false, true]) {
          const q0 = rev ? B[B.length - 1] : B[0];
          const q1 = rev ? B[0] : B[B.length - 1];
          // Centred on the laid edge (a long cap on a short armhole hangs from its middle).
          const R = rigid(a0, a1, q0, q1, mir);
          const m0 = apply(R, q0);
          const m1 = apply(R, q1);
          const M0 = compose(
            translate(mid[0] - (m0[0] + m1[0]) / 2, mid[1] - (m0[1] + m1[1]) / 2),
            R,
          );
          const e1 = apply(M0, q1);
          const endErr = Math.hypot(e1[0] - a1[0], e1[1] - a1[1]);
          if (stack) {
            // The option that covers the twin best, its own way up when that covers half of it.
            const score = -overlapAt(j, M0) * 1000 + endErr + (upright(M0) ? 0 : 500);
            if (!best || score < best.score) best = { M: M0, score };
            continue;
          }
          if (!upright(M0) || (run && !away(M0))) continue;
          // As the unit placer: a flip only when it clearly untangles the picture.
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
    for (;;) {
      const rest = order.filter((i) => !G.has(i));
      if (!rest.length) break;
      const cl = [rest[0]];
      const inCl = new Set(cl);
      const used: SeamCandidate[] = [];
      placedRasters = [];
      settle(rest[0], IDENTITY);
      if (!loose.has(rest[0]))
        for (let laid = true; laid; ) {
          laid = false;
          for (const c of cross) {
            const ia = inOf(c.a)!;
            const ib = inOf(c.b)!;
            // Only from THIS cluster's inputs: a seam to an earlier cluster's input was refused there.
            const j = inCl.has(ia) && !G.has(ib) ? ib : inCl.has(ib) && !G.has(ia) ? ia : null;
            if (j == null || loose.has(j)) continue;
            const M = along(c, j);
            if (!M) continue;
            settle(j, M);
            cl.push(j);
            used.push(c);
            laid = true;
            break;
          }
        }
      clusters.push(cl);
      holds.push(used);
    }
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
    // Shelves: the biggest cluster first, the rest in rows to the right and below it, about as
    // wide as the whole is tall (a late step's ten parts stay big enough to read).
    const cbox = clusters.map((cl) => boxOf(cl.flatMap((i) => ringsOf(i, G.get(i)!).flat())));
    const gapMm = APART * unit;
    const sumArea = cbox.reduce((s, b) => s + (b.x1 - b.x0 + gapMm) * (b.y1 - b.y0 + gapMm), 0);
    const rowW = Math.max(cbox[0].x1 - cbox[0].x0, 1.3 * Math.sqrt(sumArea));
    let x = cbox[0].x0;
    let top = cbox[0].y1;
    let rowLow = Infinity;
    clusters.forEach((cl, n) => {
      const b = cbox[n];
      const w = b.x1 - b.x0;
      if (n > 0 && x + w > cbox[0].x0 + rowW && x > cbox[0].x0) {
        x = cbox[0].x0;
        top = rowLow - gapMm;
        rowLow = Infinity;
      }
      const M = translate(x - b.x0, top - b.y1);
      for (const i of cl) G.set(i, compose(M, G.get(i)!));
      rowLow = Math.min(rowLow, top - (b.y1 - b.y0));
      x += w + gapMm;
    });

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
        let o = 0;
        for (const a of R.get(i)!) for (const b of R.get(j)!) o = Math.max(o, pairOverlap(a, b));
        if (o > tol) culprit = area(i) <= area(j) ? i : j;
      }
    if (culprit == null || loose.has(culprit)) break;
    loose.add(culprit);
  }

  const bbox = boxOf([
    ...keys.flatMap((k) => worldOf(geoms.get(k)!, T.get(k)!)),
    ...ghosts.flatMap((g) => g.ring),
  ]);
  return {
    T,
    input,
    ghosts,
    stacked: [...stacked, ...crossStacks],
    onRuns: [...onRuns, ...crossRuns],
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

// ─── partner, names ───────────────────────────────────────────────────────────────────────────────

/** A partner is offered within this share of the longer side. */
const PARTNER_REL = 0.1;

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
