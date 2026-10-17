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

/**
 * The engine's own suspects (lane pi/lineassign2), when it gives them. Shape assumed:
 * `chains.suspects: { chain, suggest: ClassId | null, nest?: number }[]` — adapt here only.
 */
type EngineSuspect = { chain: number; suggest?: number | null; nest?: number };
function engineSuspects(chains: Chains): LineNests | null {
  const list = (chains as { suspects?: EngineSuspect[] }).suspects;
  if (!Array.isArray(list)) return null;
  const out: LineNests = { expected: new Map(), nests: [], suspects: new Set() };
  const byNest = new Map<number, number[]>();
  for (const s of list) {
    out.suspects.add(s.chain);
    if (s.suggest != null) out.expected.set(s.chain, s.suggest);
    const k = s.nest ?? -1;
    byNest.set(k, [...(byNest.get(k) ?? []), s.chain]);
  }
  out.nests = [...byNest.values()];
  return out;
}

/** THE source of the step's suspect lines: the engine's list when present, else our geometry. */
export function lineSuspects(chains: Chains): LineNests {
  return engineSuspects(chains) ?? lineNests(chains);
}

/** Closed outlines a size row draws: the engine's count when present (`outlineCounts`), else ours. */
export function outlineCount(chains: Chains, classId: number): number {
  const eng = (chains as { outlineCounts?: Record<number, number> }).outlineCounts;
  if (eng && eng[classId] != null) return eng[classId];
  const c = chains.classes.find((x) => x.id === classId);
  return (c?.chains ?? []).filter((id) => outline(id, chains.chainPreview[id])).length;
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
