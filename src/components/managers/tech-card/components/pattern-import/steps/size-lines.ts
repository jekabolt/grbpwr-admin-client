// LINEFIX on the sizes step: which lines look like they sit in the wrong size, and the answers
// (`line-assign`, LINE-ASSIGN.md) built from the operator's pick.
//
// The suspect lines come from GRADED NESTS: a piece drawn in every size often shares one corner
// across the sizes (kombinezon's waistband strips: 8 outlines from (829, 1319), one per size, the
// area stepping up with the size). A nest with exactly as many area steps as the file has sizes
// says which outline is which size: the smallest is the first size, and so on. An outline the
// reader put in another row is a suspect, and its nest names the size it belongs to.
//
// The engine gives that list itself (LINEASSIGN-2, `chains.suspects`, with the line's pen against
// the nest's size) and the closed outlines per size row (`chains.outlines`); both are computed on
// the set as answered. The geometry below over the chain previews is only the fallback when they
// are absent (the DXF fast path, an older read).
import type { ChainAssign, LineSuspect, PtMm } from 'lib/pattern-import/types';
import { inside } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';

type Chains = NonNullable<ImportSessionApi['session']['chains']>;
type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** A closed piece outline (ends within 2 mm, ≥ 200 mm round): area (mm²), bbox, points. */
type Outline = { id: number; area: number; bb: Box; pts: PtMm[] };
function outline(id: number, a: Float32Array | undefined): Outline | null {
  if (!a || a.length < 8) return null;
  const n = a.length;
  if (Math.hypot(a[0] - a[n - 2], a[1] - a[n - 1]) > 2) return null;
  let len = 0;
  let sh = 0;
  const bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const pts: PtMm[] = [];
  for (let k = 0; k < n; k += 2) {
    if (k + 3 < n) {
      len += Math.hypot(a[k + 2] - a[k], a[k + 3] - a[k + 1]);
      sh += a[k] * a[k + 3] - a[k + 2] * a[k + 1];
    }
    bb.minX = Math.min(bb.minX, a[k]);
    bb.maxX = Math.max(bb.maxX, a[k]);
    bb.minY = Math.min(bb.minY, a[k + 1]);
    bb.maxY = Math.max(bb.maxY, a[k + 1]);
    pts.push({ x: a[k], y: a[k + 1] });
  }
  return len >= 200 ? { id, area: Math.abs(sh) / 2, bb, pts } : null;
}

const corners = (b: Box): [number, number][] => [
  [b.minX, b.minY],
  [b.maxX, b.minY],
  [b.minX, b.maxY],
  [b.maxX, b.maxY],
];

/** Corner tolerance of a nest, mm (the line keys quantise to 0.5 mm; previews are simplified). */
const CORNER_MM = 1.5;
/** A smaller size may touch the next one's outline by this much (the shared corner and edges). */
const TOUCH_MM = 2;
/** Two outlines this close in area are one size's (a line drawn twice), not two sizes. */
const SAME_AREA = 0.005;
/** One grading step changes the bbox aspect by at most this factor. */
const ASPECT_STEP = 1.25;

function distToPoly(p: PtMm, poly: readonly PtMm[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j];
    const b = poly[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

/** `a` lies inside `b` (every vertex inside, or on b's line within TOUCH_MM). */
const within = (a: Outline, b: Outline) =>
  a.pts.every((p) => inside(p, b.pts) || distToPoly(p, b.pts) <= TOUCH_MM);

const aspect = (o: Outline) => (o.bb.maxX - o.bb.minX) / Math.max(1e-6, o.bb.maxY - o.bb.minY);

/**
 * One graded piece: each step's outline inside the next (≤ 2 mm touch), the bbox aspect and the
 * vertex count changing little per step, the area growing. Any step failing rejects the whole
 * group (a chain of partial nests of different pieces names nothing).
 */
function graded(levels: Outline[][]): boolean {
  for (let i = 0; i + 1 < levels.length; i++) {
    const a = levels[i][0];
    const b = levels[i + 1][0];
    if (!(b.area > a.area) || !within(a, b)) return false;
    const r = aspect(a) / aspect(b);
    if (r > ASPECT_STEP || r < 1 / ASPECT_STEP) return false;
    const na = a.pts.length;
    const nb = b.pts.length;
    if (Math.abs(na - nb) > Math.max(4, 0.5 * Math.min(na, nb))) return false;
  }
  return true;
}

export type LineNests = {
  /** chain → the size row it belongs to (only when the size order is sure; see `sizeOrder`). */
  expected: Map<number, number>;
  /** chain ids per nest (one answer covers a nest). */
  nests: number[][];
  /** the lines that look like they sit in the wrong size. */
  suspects: Set<number>;
  /** the engine's read of each suspect's pen against its nest's size (absent: our geometry). */
  pen?: Map<number, LineSuspect['pen']>;
  /** the engine's words for each suspect (tooltip). */
  why?: Map<number, string>;
};

/**
 * A suspect the step may move with ONE click: the engine's pen agrees with its nest, or the pen is
 * the drawing's slip (two evidences for the nest's size). `against` / `unknown` are asked. Our
 * geometry fallback reads no pen — one evidence only: its suspects need the operator's size chip.
 */
export const oneClick = (n: LineNests, id: number) => {
  if (!n.pen) return false;
  const p = n.pen.get(id);
  return p === 'agrees' || p === 'slip';
};

/**
 * The size rows in grading order — ONLY when every size row carries the reader's nesting rank and
 * no two share one. Otherwise null: an order guessed from the rows' current outlines would follow
 * the very misplacement it is meant to fix (S holding S and L sorts after M).
 */
export function sizeOrder(chains: Chains): number[] | null {
  const rows = chains.classes.filter((c) => c.role === 'size');
  const rank = new Map<number, number>();
  for (const c of rows)
    for (const e of c.evidence)
      if (e.kind === 'nesting-order') {
        rank.set(c.id, e.rank);
        break;
      }
  if (rank.size !== rows.length || new Set(rank.values()).size !== rows.length) return null;
  return rows.map((c) => c.id).sort((a, b) => rank.get(a)! - rank.get(b)!);
}

/** The engine's own suspects (LINEASSIGN-2 `chains.suspects`); null when it gives none. */
function engineSuspects(chains: Chains): LineNests | null {
  const list = chains.suspects;
  if (!Array.isArray(list)) return null;
  const out: LineNests = {
    expected: new Map(),
    nests: [],
    suspects: new Set(),
    pen: new Map(),
    why: new Map(),
  };
  const byNest = new Map<number, number[]>();
  for (const s of list) {
    out.suspects.add(s.chain);
    out.expected.set(s.chain, s.suggest);
    out.pen!.set(s.chain, s.pen);
    out.why!.set(s.chain, s.why);
    byNest.set(s.nest, [...(byNest.get(s.nest) ?? []), s.chain]);
  }
  out.nests = [...byNest.values()];
  return out;
}

/** THE source of the step's suspect lines: the engine's list when present, else our geometry. */
export function lineSuspects(chains: Chains): LineNests {
  return engineSuspects(chains) ?? lineNests(chains);
}

/** Closed outlines a size row draws: the engine's count when present (`outlines`), else ours. */
export function outlineCount(chains: Chains, classId: number): number {
  const eng = chains.outlines?.find((o) => o.cls === classId);
  if (eng) return eng.n;
  const c = chains.classes.find((x) => x.id === classId);
  return (c?.chains ?? []).filter((id) => outline(id, chains.chainPreview[id])).length;
}

/**
 * The biggest closed outline a size row draws, mm²: the engine's `maxAreaMm2` when present, else
 * the shoelace over the previews. 0 = none closed (the geometry cannot order that size).
 */
export function outlineArea(chains: Chains, classId: number): number {
  const eng = chains.outlines?.find((o) => o.cls === classId);
  if (eng) return eng.maxAreaMm2;
  const c = chains.classes.find((x) => x.id === classId);
  let best = 0;
  for (const id of c?.chains ?? []) {
    const o = outline(id, chains.chainPreview[id]);
    if (o) best = Math.max(best, o.area);
  }
  return best;
}

/**
 * The picture of some lines in their piece: the longest of `ids` that lies inside a piece — the
 * smallest closed outline of a size or shared row around it — and that piece's box, padded. None
 * of them inside a piece (a sheet's sketch, its frame): the longest line and its own box.
 */
export function lineInPiece(
  chains: Chains,
  ids: readonly number[],
): { chain: number; piece: number | null; box: Box } | null {
  const own = new Set(ids);
  const pieces: Outline[] = [];
  for (const c of chains.classes) {
    if (c.role !== 'size' && c.role !== 'common') continue;
    for (const id of c.chains) {
      if (own.has(id)) continue;
      const o = outline(id, chains.chainPreview[id]);
      if (o) pieces.push(o);
    }
  }
  const byLen = ids
    .map((id) => {
      const a = chains.chainPreview[id];
      let len = 0;
      if (a)
        for (let k = 0; k + 3 < a.length; k += 2)
          len += Math.hypot(a[k + 2] - a[k], a[k + 3] - a[k + 1]);
      return { id, len };
    })
    .filter((x) => x.len > 0)
    .sort((x, y) => y.len - x.len);
  if (!byLen.length) return null;
  for (const { id } of byLen) {
    const lb = boxOf(chains, [id]);
    if (!lb) continue;
    const a = chains.chainPreview[id];
    let piece: Outline | null = null;
    for (const o of pieces) {
      if (piece && o.area >= piece.area) continue;
      const b = o.bb;
      if (b.minX > lb.minX || b.maxX < lb.maxX || b.minY > lb.minY || b.maxY < lb.maxY) continue;
      // every point inside (or on) the outline: the line is drawn in the piece, not across it
      let ok = true;
      for (let k = 0; ok && k + 1 < a.length; k += 2) {
        const p = { x: a[k], y: a[k + 1] };
        ok = inside(p, o.pts) || distToPoly(p, o.pts) <= TOUCH_MM;
      }
      if (ok) piece = o;
    }
    if (piece) return { chain: id, piece: piece.id, box: pad(piece.bb) };
  }
  const id = byLen[0].id;
  return { chain: id, piece: null, box: pad(boxOf(chains, [id])!) };
}

/** A box grown by 8 % of its larger side (≥ 10 mm), so the lines do not touch the frame. */
export function pad(b: Box): Box {
  const m = Math.max(10, 0.08 * Math.max(b.maxX - b.minX, b.maxY - b.minY));
  return { minX: b.minX - m, minY: b.minY - m, maxX: b.maxX + m, maxY: b.maxY + m };
}

export function lineNests(chains: Chains): LineNests {
  const out: LineNests = { expected: new Map(), nests: [], suspects: new Set() };
  const rows = chains.classes.filter((c) => c.role === 'size');
  if (rows.length < 2) return out;
  const order = sizeOrder(chains);
  const lines = chains.chainLines;
  const ol: Outline[] = [];
  chains.chainPreview.forEach((a, id) => {
    if (lines && !lines[id]?.key) return;
    const o = outline(id, a);
    if (o) ol.push(o);
  });
  // candidates: outlines sharing a bbox corner, alike in size; `graded` then proves the nest
  const parent = ol.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < ol.length; i++)
    for (let j = i + 1; j < ol.length; j++) {
      const r = ol[i].area / ol[j].area;
      if (r < 0.6 || r > 1 / 0.6) continue;
      const ci = corners(ol[i].bb);
      const cj = corners(ol[j].bb);
      if (
        ci.some(
          (p, k) =>
            Math.abs(p[0] - cj[k][0]) <= CORNER_MM && Math.abs(p[1] - cj[k][1]) <= CORNER_MM,
        )
      )
        parent[find(i)] = find(j);
    }
  const groups = new Map<number, Outline[]>();
  ol.forEach((o, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), o]));
  const sizeOf = new Map<number, number[]>();
  for (const c of rows)
    for (const ch of c.chains) sizeOf.set(ch, [...(sizeOf.get(ch) ?? []), c.id]);
  for (const g of groups.values()) {
    g.sort((a, b) => a.area - b.area);
    const levels: Outline[][] = [];
    let last = -1;
    for (const o of g) {
      if (last > 0 && (o.area - last) / last <= SAME_AREA) levels[levels.length - 1].push(o);
      else levels.push([o]);
      last = o.area;
    }
    // only a proven nest that steps through every size names them
    if (levels.length !== rows.length || !graded(levels)) continue;
    const ids = levels.map((l) => l.map((o) => o.id));
    if (order) {
      ids.forEach((lv, i) =>
        lv.forEach((id) => {
          out.expected.set(id, order[i]);
          const now = sizeOf.get(id) ?? [];
          if (now.length !== 1 || now[0] !== order[i]) out.suspects.add(id);
        }),
      );
    } else {
      // no sure order: a step that shares its size row with another step, or sits in none (or in
      // two), is suspect — the operator names its size (chips), nothing is proposed
      const rowOf = ids.map((lv) => {
        const r = lv.flatMap((id) => sizeOf.get(id) ?? []);
        return r.length === lv.length && new Set(r).size === 1 ? r[0] : null;
      });
      ids.forEach((lv, i) => {
        const r = rowOf[i];
        if (r == null || rowOf.filter((x) => x === r).length > 1)
          lv.forEach((id) => out.suspects.add(id));
      });
    }
    if (ids.some((lv) => lv.some((id) => out.suspects.has(id)))) out.nests.push(ids.flat());
  }
  return out;
}

/**
 * The suspects a size row's warning is about: every suspect of the nests that hold one of this
 * row's suspects (one in it that is another size's, or one of its own that sits elsewhere). One
 * answer fixes the whole nest — the same evidence names every line of it.
 */
export function suspectsOf(chains: Chains, n: LineNests, classId: number): number[] {
  const mine = new Set(chains.classes.find((c) => c.id === classId)?.chains ?? []);
  const out = new Set<number>();
  for (const nest of n.nests) {
    const hit = nest.some(
      (id) => n.suspects.has(id) && (n.expected.get(id) === classId || mine.has(id)),
    );
    if (hit) for (const id of nest) if (n.suspects.has(id)) out.add(id);
  }
  return [...out].sort((a, b) => a - b);
}

/** One answer entry per tile sheet (a key is read on its own sheet), keys unique. */
export function assignTo(chains: Chains, ids: number[], to: ChainAssign['to']): ChainAssign[] {
  const lines = chains.chainLines ?? [];
  const bySheet = new Map<number, Set<string>>();
  for (const id of ids) {
    const l = lines[id];
    if (!l?.key) continue;
    bySheet.set(l.sheet, (bySheet.get(l.sheet) ?? new Set()).add(l.key));
  }
  return [...bySheet].map(([sheet, keys]) => ({ sheet, keys: [...keys], to }));
}

/** Each line to the row its nest names (`rowKey`: the row's legend key). */
export function assignEach(
  chains: Chains,
  ids: number[],
  expected: Map<number, number>,
  rowKey: (classId: number) => string | null,
): ChainAssign[] {
  const byRow = new Map<number, number[]>();
  for (const id of ids) {
    const r = expected.get(id);
    if (r != null) byRow.set(r, [...(byRow.get(r) ?? []), id]);
  }
  return [...byRow].flatMap(([r, rowIds]) => {
    const row = rowKey(r);
    return row ? assignTo(chains, rowIds, { row }) : [];
  });
}

/** The lines (with a key) drawn wholly inside the operator's lasso. */
export function chainsIn(chains: Chains, poly: readonly PtMm[]): number[] {
  if (poly.length < 3) return [];
  const lines = chains.chainLines;
  const ids: number[] = [];
  chains.chainPreview.forEach((a, id) => {
    if (a.length < 4 || (lines && !lines[id]?.key)) return;
    for (let i = 0; i < a.length; i += 2) if (!inside({ x: a[i], y: a[i + 1] }, poly)) return;
    ids.push(id);
  });
  return ids;
}

/** The box around some lines (null: none drawn). */
export function boxOf(chains: Chains, ids: Iterable<number>): Box | null {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const id of ids) {
    const a = chains.chainPreview[id];
    if (!a) continue;
    for (let k = 0; k + 1 < a.length; k += 2) {
      b.minX = Math.min(b.minX, a[k]);
      b.maxX = Math.max(b.maxX, a[k]);
      b.minY = Math.min(b.minY, a[k + 1]);
      b.maxY = Math.max(b.maxY, a[k + 1]);
    }
  }
  return Number.isFinite(b.minX) ? b : null;
}

/** The answer list without the keys the engine could not find any more (`lineAssign.stale`). */
export function dropStale(
  list: ChainAssign[],
  stale: { entry: number; key: string }[],
): ChainAssign[] {
  return list.flatMap((e, i) => {
    const gone = new Set(stale.filter((s) => s.entry === i).map((s) => s.key));
    const keys = e.keys.filter((k) => !gone.has(k));
    return keys.length ? [{ ...e, keys }] : [];
  });
}
