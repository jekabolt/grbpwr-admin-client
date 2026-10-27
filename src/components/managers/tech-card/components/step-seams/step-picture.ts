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
  rasterize,
  resolveEdge,
  unionLayout,
} from 'lib/assembly-skeleton/union';
import { apply, compose, IDENTITY, rigid, translate } from 'lib/assembly-skeleton/union/affine';
import { unitDisplayName } from 'lib/assembly-unit-name';
import type { SeamPlacement } from 'lib/seams';
import { parseInner, pieceOfTarget } from './step-seams-model';

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
  return { a, b, score: 1, evidence: EVIDENCE, kind: 'edge' };
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
  /** Extent of every drawn piece and ghost, picture frame. */
  bbox: Box;
};

const EMPTY_LAYOUT: StepLayout = {
  T: new Map(),
  input: new Map(),
  ghosts: [],
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

/** An input on its own: its pieces along its inner seams; pieces the placer leaves out stand beside. */
function layInput(
  keys: readonly string[],
  inner: readonly SeamCandidate[],
  geoms: ReadonlyMap<string, PieceGeom>,
  raster: { rasterMm?: number },
): Map<string, Affine> {
  const L = unionLayout(keys, inner, geoms, raster);
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
  return T;
}

/** The inverse of a (non-degenerate) affine. */
export function invert(T: Affine): Affine {
  const [a, b, c, d, e, f] = T;
  const k = a * d - b * c || 1;
  return [d / k, -b / k, -c / k, a / k, (c * f - d * e) / k, (b * e - a * f) / k];
}

/**
 * Lay the step out, honestly. Each input on its own first: its pieces along the seams already sewn
 * inside it (`unionLayout`); pieces with no seam between them stand apart (a gap, never a touch) —
 * an input whose pieces are not known to be joined is not drawn as one; a piece with no shape is
 * an empty square beside its input. Then the inputs, each as a rigid whole, along the step's cross
 * seams (longest first, the side that fits clear of the rest); an input no cross seam reaches stands
 * beside. `explode` (share of the extent) then pulls each input away from the centre of the cross
 * seams — 0 = the joined result.
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
  const ins = leaves.map((_, i) => i).filter((i) => [...input.values()].includes(i));
  const inOf = (id: EdgeId) => input.get(pieceKeyOf(id));

  // ── 1. each input alone ──
  const local = new Map<string, Affine>();
  const localBox = new Map<number, Box>();
  for (const i of ins) {
    const ks = keys.filter((k) => input.get(k) === i);
    if (!ks.length) continue;
    const inner = seams.filter((c) => inOf(c.a) === i && inOf(c.b) === i);
    for (const [k, t] of layInput(ks, inner, geoms, raster)) local.set(k, t);
    localBox.set(i, boxOf(ks.flatMap((k) => worldOf(geoms.get(k)!, local.get(k)!))));
  }
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
  const ringsOf = (i: number, G: Affine = IDENTITY): Pt2[] => [
    ...keys
      .filter((k) => input.get(k) === i)
      .flatMap((k) => worldOf(geoms.get(k)!, compose(G, local.get(k)!))),
    ...ghostsLocal.filter((g) => g.input === i).flatMap((g) => g.ring.map((p) => apply(G, p))),
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
  const G = new Map<number, Affine>();
  const step = Math.max(2, unit / 120);
  const rasters = (i: number, M: Affine) =>
    keys
      .filter((k) => input.get(k) === i)
      .map((k) => rasterize(worldOf(geoms.get(k)!, compose(M, local.get(k)!)), step));
  // Inputs a cross seam reaches form a cluster (laid against each other); clusters stand apart.
  let placedRasters: ReturnType<typeof rasterize>[] = [];
  const settle = (i: number, M: Affine) => {
    G.set(i, M);
    placedRasters.push(...rasters(i, M));
  };
  /** The motion of input `j` that lays its side of `c` on the placed side. */
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
      return compose(compose(compose(Hg, host), S.T), invert(part));
    }
    const Ht = G.get(inOf(theirs)!);
    if (!Ht) return null;
    const ea = resolveEdge(theirs, geoms)!;
    const eb = resolveEdge(mine, geoms)!;
    const A = ea.pts.map((p) => apply(compose(Ht, local.get(pieceKeyOf(theirs))!), p));
    const B = eb.pts.map((p) => apply(local.get(pieceKeyOf(mine))!, p));
    const a0 = A[0];
    const a1 = A[A.length - 1];
    let best: { M: Affine; score: number } | null = null;
    for (const rev of [false, true])
      for (const mir of [false, true]) {
        const q0 = rev ? B[B.length - 1] : B[0];
        const q1 = rev ? B[0] : B[B.length - 1];
        const M = rigid(a0, a1, q0, q1, mir);
        const e1 = apply(M, q1);
        const mineR = rasters(j, M);
        let overlap = 0;
        for (const r of mineR)
          for (const o of placedRasters) overlap = Math.max(overlap, pairOverlap(r, o));
        // As the unit placer: a flip only when it clearly untangles the picture.
        const score = overlap * 1000 + Math.hypot(e1[0] - a1[0], e1[1] - a1[1]) + (mir ? 50 : 0);
        if (!best || score < best.score) best = { M, score };
      }
    return best?.M ?? null;
  };
  const order = [...ins].sort((p, q) => area(q) - area(p));
  const clusters: number[][] = [];
  for (;;) {
    const rest = order.filter((i) => !G.has(i));
    if (!rest.length) break;
    const cl = [rest[0]];
    placedRasters = [];
    settle(rest[0], IDENTITY);
    for (let laid = true; laid; ) {
      laid = false;
      for (const c of cross) {
        const ia = inOf(c.a)!;
        const ib = inOf(c.b)!;
        const j = G.has(ia) && !G.has(ib) ? ib : G.has(ib) && !G.has(ia) ? ia : null;
        if (j == null) continue;
        const M = along(c, j);
        if (!M) continue;
        settle(j, M);
        cl.push(j);
        laid = true;
        break;
      }
    }
    clusters.push(cl);
  }
  // Shelves: the biggest cluster first, the rest in rows to the right and below it, about as wide
  // as the whole is tall (a late step's ten parts stay big enough to read).
  const cbox = clusters.map((cl) => boxOf(cl.flatMap((i) => ringsOf(i, G.get(i)!))));
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
  const T = new Map<string, Affine>(
    [...keys.filter((k) => !onTop.has(k)), ...keys.filter((k) => onTop.has(k))].map((k) => [
      k,
      compose(G.get(input.get(k)!)!, local.get(k)!),
    ]),
  );
  let ghosts: Ghost[] = ghostsLocal.map((g) => ({
    ...g,
    ring: g.ring.map((p) => apply(G.get(g.input)!, p)),
  }));
  const groupPts = (i: number) => [
    ...keys.filter((k) => input.get(k) === i).flatMap((k) => worldOf(geoms.get(k)!, T.get(k)!)),
    ...ghosts.filter((g) => g.input === i).flatMap((g) => g.ring),
  ];

  const explode = opts.explode ?? 0;
  if (explode > 0 && G.size > 1) {
    const all = boxOf(ins.flatMap(groupPts));
    const seamPts: Pt2[] = [];
    for (const c of cross)
      for (const id of [c.a, c.b]) {
        const e = c.kind === 'surface' ? null : resolveEdge(id, geoms);
        const t = T.get(pieceKeyOf(id));
        if (e && t) seamPts.push(...e.pts.map((p) => apply(t, p)));
      }
    const centre = centroidOf(seamPts.length ? seamPts : ins.flatMap(groupPts));
    const gap = extentOf(all) * explode;
    const shift = new Map<number, Affine>();
    for (const i of ins) {
      const c = centroidOf(groupPts(i));
      const dx = c[0] - centre[0];
      const dy = c[1] - centre[1];
      const len = Math.hypot(dx, dy);
      shift.set(i, len > 1e-6 ? translate((dx / len) * gap, (dy / len) * gap) : IDENTITY);
    }
    for (const k of keys) T.set(k, compose(shift.get(input.get(k)!)!, T.get(k)!));
    ghosts = ghosts.map((g) => ({
      ...g,
      ring: g.ring.map((p) => apply(shift.get(g.input)!, p)),
    }));
  }

  const bbox = boxOf([
    ...keys.flatMap((k) => worldOf(geoms.get(k)!, T.get(k)!)),
    ...ghosts.flatMap((g) => g.ring),
  ]);
  return { T, input, ghosts, bbox };
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
 * Where a label of an edge goes: `off` px off the edge's middle, on the side away from `inside`
 * (the piece's centre), anchored so the text runs away from the line.
 */
export function labelSpot(
  pts: readonly Pt2[],
  inside: Pt2,
  off: number,
): { at: Pt2; anchor: 'start' | 'middle' | 'end'; t: Pt2 } {
  const { p, t } = midAlong(pts);
  let n: Pt2 = [t[1], -t[0]];
  if (n[0] * (inside[0] - p[0]) + n[1] * (inside[1] - p[1]) > 0) n = [-n[0], -n[1]];
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
