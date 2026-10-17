// LINEFIX on the sizes step: which lines look like they sit in the wrong size, and the answers
// (`line-assign`, LINE-ASSIGN.md) built from the operator's pick. Pure geometry over the chains
// stage's own previews (drawing frame, mm) — the same frame the sizes canvas draws.
//
// The suspect lines come from GRADED NESTS: a piece drawn in every size often shares one corner
// across the sizes (kombinezon's waistband strips: 8 outlines from (829, 1319), one per size, the
// area stepping up with the size). A nest with exactly as many area steps as the file has sizes
// says which outline is which size: the smallest is the first size, and so on. An outline the
// reader put in another row (all 8 strips in row 6; the other strip's in «ignore» / «common») is
// a suspect, and its nest names the size it belongs to. The engine gives no such list (its
// `lineAssign.flags` only judge answers already given), so the step proposes it and the operator
// confirms — or picks lines by hand.
import type { ChainAssign, PtMm } from 'lib/pattern-import/types';
import { inside } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';

type Chains = NonNullable<ImportSessionApi['session']['chains']>;
type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** A closed piece outline (ends within 2 mm, ≥ 200 mm round): its area (mm²) and bbox. */
function outline(a: Float32Array | undefined): { area: number; bb: Box } | null {
  if (!a || a.length < 8) return null;
  const n = a.length;
  if (Math.hypot(a[0] - a[n - 2], a[1] - a[n - 1]) > 2) return null;
  let len = 0;
  let sh = 0;
  const bb = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let k = 0; k < n; k += 2) {
    if (k + 3 < n) {
      len += Math.hypot(a[k + 2] - a[k], a[k + 3] - a[k + 1]);
      sh += a[k] * a[k + 3] - a[k + 2] * a[k + 1];
    }
    bb.minX = Math.min(bb.minX, a[k]);
    bb.maxX = Math.max(bb.maxX, a[k]);
    bb.minY = Math.min(bb.minY, a[k + 1]);
    bb.maxY = Math.max(bb.maxY, a[k + 1]);
  }
  return len >= 200 ? { area: Math.abs(sh) / 2, bb } : null;
}

const corners = (b: Box): [number, number][] => [
  [b.minX, b.minY],
  [b.maxX, b.minY],
  [b.minX, b.maxY],
  [b.maxX, b.maxY],
];

/** Corner tolerance of a nest, mm (the line keys quantise to 0.5 mm; previews are simplified). */
const CORNER_MM = 1.5;
/** Two outlines this close in area are one size's (a line drawn twice), not two sizes. */
const SAME_AREA = 0.005;

export type LineNests = {
  /** chain → the size row its nest says it belongs to (every nest line, right or not). */
  expected: Map<number, number>;
  /** chain ids per nest. */
  nests: number[][];
  /** the nest lines NOT in the row their nest names (or in it and in another size row too). */
  suspects: Set<number>;
};

/**
 * The size rows in grading order: by the reader's nesting rank when every row has one, else by the
 * area of their biggest outline.
 */
export function sizeOrder(chains: Chains): number[] {
  const rows = chains.classes.filter((c) => c.role === 'size');
  const rank = (id: number) => {
    const ev = rows.find((c) => c.id === id)?.evidence ?? [];
    for (const e of ev) if (e.kind === 'nesting-order') return e.rank;
    return null;
  };
  const big = (id: number) =>
    Math.max(
      0,
      ...(rows.find((c) => c.id === id)?.chains ?? []).map(
        (ch) => outline(chains.chainPreview[ch])?.area ?? 0,
      ),
    );
  const ids = rows.map((c) => c.id);
  const byRank = ids.every((id) => rank(id) != null);
  return ids.sort((a, b) => (byRank ? rank(a)! - rank(b)! : big(a) - big(b)) || a - b);
}

export function lineNests(chains: Chains): LineNests {
  const order = sizeOrder(chains);
  const out: LineNests = { expected: new Map(), nests: [], suspects: new Set() };
  if (order.length < 2) return out;
  const lines = chains.chainLines;
  const ol: { id: number; area: number; bb: Box }[] = [];
  chains.chainPreview.forEach((a, id) => {
    if (lines && !lines[id]?.key) return;
    const o = outline(a);
    if (o) ol.push({ id, ...o });
  });
  // union of outlines sharing a bbox corner, alike in size (a graded step, not another piece)
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
  const groups = new Map<number, typeof ol>();
  ol.forEach((o, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), o]));
  const sizeOf = new Map<number, number[]>();
  for (const c of chains.classes)
    if (c.role === 'size')
      for (const ch of c.chains) sizeOf.set(ch, [...(sizeOf.get(ch) ?? []), c.id]);
  for (const g of groups.values()) {
    g.sort((a, b) => a.area - b.area);
    const levels: number[][] = [];
    let last = -1;
    for (const o of g) {
      if (last > 0 && (o.area - last) / last <= SAME_AREA) levels[levels.length - 1].push(o.id);
      else levels.push([o.id]);
      last = o.area;
    }
    // only a nest that steps through every size names them
    if (levels.length !== order.length) continue;
    out.nests.push(g.map((o) => o.id));
    levels.forEach((ids, i) =>
      ids.forEach((id) => {
        out.expected.set(id, order[i]);
        const now = sizeOf.get(id) ?? [];
        if (now.length !== 1 || now[0] !== order[i]) out.suspects.add(id);
      }),
    );
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
