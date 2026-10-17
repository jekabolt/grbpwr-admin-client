// chains/ — LINEASSIGN-2: graded NESTS and what they say about the rows (the sizes step's "these
// lines look like they sit in the wrong size", and the evidence the line answers' pen flags read).
//
// A piece drawn in every size often shares one corner across its sizes: kombinezon's strips are 8
// closed outlines from one corner, each a step longer. Such a nest — closed outlines (ends within
// 2 mm, ≥ 200 mm round) sharing a bounding-box corner within 1.5 mm, alike in area (ratio ≥ 0.6) —
// whose areas step through EXACTLY as many levels as the run has size rows (≥ 3: two outlines
// sharing a corner are no grading evidence), every step growing and the steps even (largest
// ≤ 3 × smallest), names each outline's size by its place: the smallest is
// the first size row (nesting rank 0), and so on. Two outlines within 0.5 % of area are one level
// (the same line drawn twice). A nest is geometry only: no pen, no layer, no row is read.
//
// The PEN of a nest outline, against the size its place names (`penVerdict`):
//   agrees   drawn in that size row's pen;
//   against  drawn in another size row's pen (the pen names another size than the place);
//   slip     drawn in another size O's pen, BUT that pen also draws the nest's own size-O outline
//            (at O's place) and the named size's pen draws no outline of the nest: the pen is used
//            twice in one nest of distinct sizes, so it cannot identify both, and the place it
//            leaves empty is exactly where this outline sits — the drawing's pen slip (kombinezon's
//            size-18 strip outline on layer 6, drawn with size 8's dash 3.59 and printed "18");
//   unknown  no pen read on the line, or no size row's pen known.
// `slip` is two independent evidences against the pen (the nest's place, the pen's own place in
// the same nest) — D3: an answer that puts such a line in its place is not flagged against its pen.
import type {
  Chain,
  ChainId,
  ChainSet,
  ClassId,
  LineClass,
  LineSuspect,
  PtMm,
  SizeOutlines,
  Style,
} from 'lib/pattern-import/types';

import { chainLook, classLooks, onPen, sameLook, type Look } from '../pieces/identity';

/** An outline: closed (or ends within this, mm) … */
const END_MM = 2;
/** … and at least this long round, mm. */
const MIN_LEN_MM = 200;
/** Bounding-box corner tolerance of one nest, mm. */
const CORNER_MM = 1.5;
/** Two outlines this close in area are one level (a line drawn twice), not two sizes. */
const SAME_AREA = 0.005;
/** Outlines of one nest are alike in area (smaller / larger). */
const ALIKE = 0.6;
/** A nest needs this many sizes (levels): two steps at least, so evenness means something. */
const MIN_SIZES = 3;
/** Even steps: the largest area step at most this many times the smallest. */
const EVEN = 3;

type Box = { minX: number; minY: number; maxX: number; maxY: number };
type Outline = { id: ChainId; area: number; bb: Box };

/** A closed piece outline: its area (mm²) and box, else null. */
export function outlineOf(c: Chain | undefined): { area: number; bb: Box } | null {
  if (!c || c.pts.length < 3 || c.lengthMm < MIN_LEN_MM) return null;
  const p = c.pts;
  const a = p[0];
  const z = p[p.length - 1];
  if (!c.closed && Math.hypot(a.x - z.x, a.y - z.y) > END_MM) return null;
  let sh = 0;
  const bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let i = 0; i < p.length; i++) {
    const q = p[i];
    const r = p[(i + 1) % p.length];
    sh += q.x * r.y - r.x * q.y;
    bb.minX = Math.min(bb.minX, q.x);
    bb.maxX = Math.max(bb.maxX, q.x);
    bb.minY = Math.min(bb.minY, q.y);
    bb.maxY = Math.max(bb.maxY, q.y);
  }
  return { area: Math.abs(sh) / 2, bb };
}

const rankOf = (c: LineClass) => {
  for (const e of c.evidence) if (e.kind === 'nesting-order') return e.rank;
  return null;
};

/**
 * The size rows in grading order: by the reader's nesting rank when every row has one, else by the
 * area of their biggest outline.
 */
export function sizeOrder(set: ChainSet): ClassId[] {
  const rows = set.classes.filter((c) => c.role === 'size');
  const byRank = rows.every((c) => rankOf(c) != null);
  const big = (c: LineClass) =>
    Math.max(0, ...c.chains.map((id) => outlineOf(set.chains[id])?.area ?? 0));
  const key = new Map(rows.map((c) => [c.id, byRank ? rankOf(c)! : big(c)]));
  return rows.map((c) => c.id).sort((a, b) => key.get(a)! - key.get(b)! || a - b);
}

export type Nest = {
  /** The shared corner of the smallest outline (drawing frame, mm). */
  at: PtMm;
  /** Its levels, smallest first: level i is the size row `order[i]`; one or more chains each. */
  levels: ChainId[][];
  /** Mean area per level, mm². */
  areas: number[];
};

export type Nests = {
  /** The size rows in grading order (`sizeOrder`). */
  order: ClassId[];
  nests: Nest[];
  /** Per nest chain: its nest (index into `nests`) and level. */
  place: Map<ChainId, { nest: number; level: number }>;
};

const memo = new WeakMap<ChainSet, Nests>();

/** The graded nests of a chain set (see the header). Pure; memoised per set. */
export function lineNests(set: ChainSet): Nests {
  const m = memo.get(set);
  if (m) return m;
  const order = sizeOrder(set);
  const out: Nests = { order, nests: [], place: new Map() };
  memo.set(set, out);
  if (order.length < MIN_SIZES) return out;
  const ol: Outline[] = [];
  set.chains.forEach((c, id) => {
    const o = outlineOf(c);
    if (o) ol.push({ id, ...o });
  });
  const parent = ol.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  // corners hashed per corner kind (min-min, max-min, min-max, max-max) on a CORNER_MM grid
  const corner = (b: Box, k: number): [number, number] => [
    k & 1 ? b.maxX : b.minX,
    k & 2 ? b.maxY : b.minY,
  ];
  const cell = (v: number) => Math.floor(v / CORNER_MM);
  const grid = new Map<string, number[]>();
  ol.forEach((o, i) => {
    for (let k = 0; k < 4; k++) {
      const [x, y] = corner(o.bb, k);
      const cx = cell(x);
      const cy = cell(y);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const j of grid.get(`${k}|${cx + dx}|${cy + dy}`) ?? []) {
            const [u, v] = corner(ol[j].bb, k);
            if (Math.abs(u - x) > CORNER_MM || Math.abs(v - y) > CORNER_MM) continue;
            const r = Math.min(o.area, ol[j].area) / Math.max(o.area, ol[j].area, 1e-9);
            if (r >= ALIKE) parent[find(i)] = find(j);
          }
      const key = `${k}|${cx}|${cy}`;
      grid.set(key, [...(grid.get(key) ?? []), i]);
    }
  });
  const groups = new Map<number, Outline[]>();
  ol.forEach((o, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), o]));
  for (const g of groups.values()) {
    if (g.length < order.length) continue;
    g.sort((a, b) => a.area - b.area || a.id - b.id);
    const levels: Outline[][] = [];
    let last = -1;
    for (const o of g) {
      if (last > 0 && (o.area - last) / last <= SAME_AREA) levels[levels.length - 1].push(o);
      else levels.push([o]);
      last = o.area;
    }
    // only a nest that steps through every size names them, in even steps
    if (levels.length !== order.length) continue;
    const areas = levels.map((l) => l.reduce((t, o) => t + o.area, 0) / l.length);
    const steps = areas.slice(1).map((a, i) => a - areas[i]);
    const lo = Math.min(...steps);
    if (!(lo > 0) || Math.max(...steps) > EVEN * lo) continue;
    const n = out.nests.length;
    out.nests.push({
      at: { x: g[0].bb.minX, y: g[0].bb.minY },
      levels: levels.map((l) => l.map((o) => o.id)),
      areas,
    });
    levels.forEach((l, level) => l.forEach((o) => out.place.set(o.id, { nest: n, level })));
  }
  return out;
}

/** A size row's pen: its declared / recovered look, else the one look of ≥ 60 % of its length. */
export function rowPen(set: ChainSet, c: LineClass, styles: ReadonlyMap<number, Style>): Look[] {
  const l = classLooks(c);
  if (l.length) return l;
  const groups: { l: Look; len: number }[] = [];
  let total = 0;
  for (const id of c.chains) {
    const ch = set.chains[id];
    if (!ch) continue;
    total += ch.lengthMm;
    const cl = chainLook(ch, styles);
    if (!cl) continue;
    const g = groups.find((x) => sameLook(x.l, cl));
    if (g) g.len += ch.lengthMm;
    else groups.push({ l: cl, len: ch.lengthMm });
  }
  const best = groups.sort((a, b) => b.len - a.len)[0];
  return best && best.len >= 0.6 * total ? [best.l] : [];
}

export type PenVerdict =
  | { pen: 'agrees' | 'unknown' }
  | { pen: 'against'; says: ClassId }
  | { pen: 'slip'; says: ClassId; own: ChainId[] };

/**
 * The pen of nest chain `id` against size row `to` (see the header). `pens` = each size row's pen
 * (`rowPen`) on the set the nests were read on.
 */
export function penVerdict(
  set: ChainSet,
  n: Nests,
  id: ChainId,
  to: ClassId,
  pens: ReadonlyMap<ClassId, Look[]>,
  styles: ReadonlyMap<number, Style>,
): PenVerdict {
  const look = set.chains[id] ? chainLook(set.chains[id], styles) : null;
  const own = pens.get(to) ?? [];
  if (!look || !own.length) return { pen: 'unknown' };
  if (onPen(look, own)) return { pen: 'agrees' };
  const says = n.order.find((o) => o !== to && onPen(look, pens.get(o) ?? []));
  if (says == null) return { pen: 'unknown' };
  const at = n.place.get(id);
  if (!at) return { pen: 'against', says };
  const nest = n.nests[at.nest];
  const lookOf = (c: ChainId) => (set.chains[c] ? chainLook(set.chains[c], styles) : null);
  // the pen's own place in this nest is drawn with it …
  const level = n.order.indexOf(says);
  const ownIds = (nest.levels[level] ?? []).filter((c) => {
    const l = lookOf(c);
    return c !== id && !!l && onPen(l, pens.get(says) ?? []);
  });
  // … and the named size's pen draws no outline of the nest
  const toDrawn = nest.levels.some((l) =>
    l.some((c) => {
      const lk = lookOf(c);
      return !!lk && onPen(lk, own);
    }),
  );
  return ownIds.length && !toDrawn && n.order[at.level] === to
    ? { pen: 'slip', says, own: ownIds }
    : { pen: 'against', says };
}

const label = (set: ChainSet, id: ClassId) => {
  const c = set.classes.find((x) => x.id === id);
  return c?.sizeLabel ? `size ${c.sizeLabel}` : `size row #${id}`;
};
const ord = (k: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = k % 100;
  return `${k}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
const cm2 = (mm2: number) => (mm2 / 100).toFixed(0);

/**
 * Nest outlines NOT in the size row their place names (in another row, in none, or in it and in
 * another size row too): the row the nest names, with the pen's verdict. Lines the operator
 * answered (`set.assigned`) are his — never suspects.
 */
export function lineSuspects(set: ChainSet, styles: readonly Style[]): LineSuspect[] {
  const n = lineNests(set);
  if (!n.nests.length) return [];
  const styleMap = new Map(styles.map((s) => [s.id, s]));
  const answered = new Set((set.assigned ?? []).map((a) => a.chain));
  const sizeOf = new Map<ChainId, ClassId[]>();
  for (const c of set.classes)
    if (c.role === 'size')
      for (const ch of c.chains) {
        const a = sizeOf.get(ch);
        if (!a) sizeOf.set(ch, [c.id]);
        else if (!a.includes(c.id)) a.push(c.id);
      }
  const rowOf = (ch: ChainId) =>
    set.classes
      .filter((c) => c.chains.includes(ch))
      .map((c) => (c.role === 'size' ? label(set, c.id) : c.role))
      .join(' + ') || 'no row';
  let pens: Map<ClassId, Look[]> | null = null;
  const out: LineSuspect[] = [];
  n.nests.forEach((nest, k) => {
    nest.levels.forEach((ids, level) => {
      const to = n.order[level];
      for (const id of ids) {
        if (answered.has(id)) continue;
        const now = sizeOf.get(id) ?? [];
        if (now.length === 1 && now[0] === to) continue;
        pens ??= new Map(
          set.classes.filter((c) => c.role === 'size').map((c) => [c.id, rowPen(set, c, styleMap)]),
        );
        const v = penVerdict(set, n, id, to, pens, styleMap);
        const place = `nest of ${n.order.length} outlines at (${nest.at.x.toFixed(0)}, ${nest.at.y.toFixed(0)}): ${ord(level + 1)} by area (${cm2(nest.areas[level])} cm² in ${cm2(nest.areas[0])}→${cm2(nest.areas[nest.areas.length - 1])}, even steps) → ${label(set, to)}`;
        const pen =
          v.pen === 'agrees'
            ? `drawn in ${label(set, to)}'s pen`
            : v.pen === 'against'
              ? `drawn in ${label(set, v.says)}'s pen`
              : v.pen === 'slip'
                ? `drawn in ${label(set, v.says)}'s pen, which also draws the nest's own ${label(set, v.says)} outline (#${v.own.join(', #')}) while ${label(set, to)}'s pen draws none of it — a pen slip of the drawing`
                : 'no pen read';
        out.push({
          chain: id,
          suggest: to,
          why: `${place}; now in ${rowOf(id)}; ${pen}`,
          pen: v.pen,
          nest: k,
        });
      }
    });
  });
  return out;
}

/** Per size row: the closed piece outlines its lines draw (ends within 2 mm, ≥ 200 mm round). */
export function sizeOutlines(set: ChainSet): SizeOutlines[] {
  return set.classes
    .filter((c) => c.role === 'size')
    .map((c) => {
      const chains: ChainId[] = [];
      let maxAreaMm2 = 0;
      for (const id of new Set(c.chains)) {
        const o = outlineOf(set.chains[id]);
        if (!o) continue;
        chains.push(id);
        maxAreaMm2 = Math.max(maxAreaMm2, o.area);
      }
      return { cls: c.id, n: chains.length, chains, maxAreaMm2: Math.round(maxAreaMm2) };
    });
}
