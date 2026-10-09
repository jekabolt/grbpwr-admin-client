// Notches from real CLO/AAMA files (K2, 10-CLO-DXF-FORMAT §2.4 pitfalls 2–4). Three measured gaps:
//
// 2. R12 notches are POINT entities on layer 4 with the inward angle in code 50 and the depth in
//    code 30. dxf-parser keeps the position but DROPS code 50, and the card dropped POINT entirely,
//    so an AAMA file reached the marker with no notches at all. The angle is recovered from the raw
//    tag stream here and the POINT becomes a short LINE-like notch (start on the line, end inward).
// 3. In AAMA R12 only the SAMPLE-size block carries notches (summer men: M has 50, XS/<S>/L/XL 0).
//    They are carried over to the other sizes of the same piece along a contour both blocks share
//    with identical topology (CLO grades vertex-for-vertex), or the gap is named in a warning.
// 4. CLO writes every notch twice — once on the cut line and once on the seam line (mode A), or as
//    an exact duplicate when L1 = L14 (mode B). One logical notch must stay one notch.
//
// All of this is scoped to the AAMA notch layer "4": it is a CLO/AAMA convention, and files from a
// pattern maker that never used it keep their exact old outcome.
import type { IDxf, IEntity } from 'dxf-parser';
import type { Pt } from '../types';
import type { EntityGroup, LayeredChain } from './transform';

export const NOTCH_LAYER = '4';

// Depth when the file carries none (10-CLO-DXF-FORMAT §1.6: "default to 5 mm").
const DEFAULT_NOTCH_DEPTH_CM = 0.5;

// What parse.ts recovers from the tag stream and hangs on the dxf-parser POINT entity.
export type PointNotch = { angleDeg: number; depth: number };
export type PointEntityWithNotch = IEntity & {
  position?: { x: number; y: number; z?: number };
  notch?: PointNotch;
};

// ── 2. POINT angle from the raw tags ─────────────────────────────────────────────────────────────

// dxf-parser splits on the same three line breaks and parseFloat()s every code 10–59 value, so a
// key built the same way matches its entity bit-for-bit. Matching is by (layer, x, y), FIFO for
// repeats, rather than by order: the parser's block map and our scan need not agree on order.
const keyOf = (layer: string, x: number, y: number) => `${layer}|${x}|${y}`;

export function attachPointNotches(dxf: IDxf, text: string): void {
  if (!/\r?\n\s*POINT\s*\r?\n/.test(text)) return;
  const lines = text.split(/\r\n|\r|\n/g);
  const queue = new Map<string, PointNotch[]>();
  let inPoint = false;
  let layer = '';
  let x = NaN;
  let y = NaN;
  let z = NaN;
  let angle = NaN;
  const flush = () => {
    if (
      inPoint &&
      layer === NOTCH_LAYER &&
      Number.isFinite(angle) &&
      Number.isFinite(x) &&
      Number.isFinite(y)
    ) {
      const k = keyOf(layer, x, y);
      const list = queue.get(k) ?? [];
      list.push({ angleDeg: angle, depth: Number.isFinite(z) ? z : 0 });
      queue.set(k, list);
    }
    inPoint = false;
  };
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    const value = lines[i + 1].trim();
    if (code === 0) {
      flush();
      if (value === 'POINT') {
        inPoint = true;
        layer = '';
        x = y = z = angle = NaN;
      }
      continue;
    }
    if (!inPoint) continue;
    if (code === 8) layer = value;
    else if (code === 10) x = parseFloat(value);
    else if (code === 20) y = parseFloat(value);
    else if (code === 30) z = parseFloat(value);
    else if (code === 50) angle = parseFloat(value);
  }
  flush();
  if (queue.size === 0) return;
  const visit = (entities: IEntity[] | undefined) => {
    for (const e of entities ?? []) {
      if (e.type !== 'POINT') continue;
      const pe = e as PointEntityWithNotch;
      if (!pe.position) continue;
      const list = queue.get(keyOf(String(pe.layer ?? ''), pe.position.x, pe.position.y));
      const hit = list?.shift();
      if (hit) pe.notch = hit;
    }
  };
  for (const b of Object.values(dxf.blocks ?? {})) visit(b.entities);
  visit(dxf.entities);
}

// A POINT notch as a 2-point path in DRAWING units: start on the line, end `depth` along the
// inward angle. The caller scales and transforms both points like any other entity, so INSERT
// rotation and mirroring carry the direction for free.
export function pointNotchPts(e: IEntity, u: number): Pt[] | null {
  const pe = e as PointEntityWithNotch;
  if (!pe.notch || !pe.position || String(pe.layer ?? '') !== NOTCH_LAYER) return null;
  const depth = pe.notch.depth > 0 ? pe.notch.depth : DEFAULT_NOTCH_DEPTH_CM / u;
  const a = (pe.notch.angleDeg * Math.PI) / 180;
  const p = pe.position;
  return [
    { x: p.x, y: p.y },
    { x: p.x + depth * Math.cos(a), y: p.y + depth * Math.sin(a) },
  ];
}

// ── 4. One logical notch = one path ──────────────────────────────────────────────────────────────

const isNotchPath = (c: LayeredChain) => c.layer === NOTCH_LAYER && !c.closed && c.pts.length === 2;

// Twins: CLO's cut-line and seam-line copies of one notch sit an allowance apart (FP_R_M: 10.0 mm)
// and the step from one start to the other runs ALONG one of the two notches — the normal of its own
// line. The two copies need not point the same way: measured on ALLSIZES_DXF, the axes of a twin
// pair differ by up to 75° at corners while the step stays within 1° of one axis. A double notch is
// two notches a step apart ACROSS the axis (along the edge), which this never pairs.
const TWIN_MAX_CM = 2.5;
const TWIN_SIN = Math.sin((15 * Math.PI) / 180);
// CLO also writes one notch twice at a closed contour's start/end vertex, 0.02 mm apart
// (CLR_3_M: x = ±0.01). Starts this close are the same notch whatever the direction.
const SAME_START_CM = 0.01;

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function distToLoop(p: Pt, loop: readonly Pt[]): number {
  let m = Infinity;
  for (let i = 0; i < loop.length; i++)
    m = Math.min(m, segDist(p, loop[i], loop[(i + 1) % loop.length]));
  return m;
}

function unit(a: Pt, b: Pt): Pt | null {
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  return l > 0 ? { x: (b.x - a.x) / l, y: (b.y - a.y) / l } : null;
}

const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;

// Indices of `chains` that are a second copy of a notch already kept, for the piece whose contour is
// `contour`. Duplicates go first (keep the earliest). Of a cut/seam twin pair the copy whose start
// lies NEARER THIS PIECE'S contour stays — the cut-line notch for a piece cut by layer 1, the
// seam-line one for a piece taken by layer 14. Nearer, not on: in CLO mode A (ALLSIZES_DXF) both
// copies are the SAMPLE size's notches repeated in every size, so off the graded outline in XS…XL;
// they are still one notch.
export function duplicateNotches(
  chains: readonly LayeredChain[],
  contour: readonly Pt[],
): Set<number> {
  const drop = new Set<number>();
  const idx: number[] = [];
  for (let i = 0; i < chains.length; i++) if (isNotchPath(chains[i])) idx.push(i);
  if (idx.length < 2) return drop;

  for (let a = 0; a < idx.length; a++) {
    if (drop.has(idx[a])) continue;
    const A = chains[idx[a]].pts[0];
    for (let b = a + 1; b < idx.length; b++) {
      if (drop.has(idx[b])) continue;
      const B = chains[idx[b]].pts[0];
      if (Math.hypot(A.x - B.x, A.y - B.y) <= SAME_START_CM) drop.add(idx[b]);
    }
  }

  type Pair = { i: number; j: number; d: number };
  const pairs: Pair[] = [];
  const live = idx.filter((i) => !drop.has(i));
  for (let a = 0; a < live.length; a++) {
    const A = chains[live[a]].pts;
    const ua = unit(A[0], A[1]);
    if (!ua) continue;
    for (let b = a + 1; b < live.length; b++) {
      const B = chains[live[b]].pts;
      const ub = unit(B[0], B[1]);
      if (!ub) continue;
      const d = Math.hypot(B[0].x - A[0].x, B[0].y - A[0].y);
      if (d > TWIN_MAX_CM) continue;
      const v = { x: (B[0].x - A[0].x) / d, y: (B[0].y - A[0].y) / d };
      if (Math.abs(cross(v, ua)) > TWIN_SIN && Math.abs(cross(v, ub)) > TWIN_SIN) continue;
      pairs.push({ i: live[a], j: live[b], d });
    }
  }
  pairs.sort((p, q) => p.d - q.d || p.i - q.i || p.j - q.j);
  for (const { i, j } of pairs) {
    if (drop.has(i) || drop.has(j)) continue;
    const di = distToLoop(chains[i].pts[0], contour);
    const dj = distToLoop(chains[j].pts[0], contour);
    drop.add(dj < di ? i : j);
  }
  return drop;
}

// ── 3. Sample-size notches carried to the other sizes ────────────────────────────────────────────

// Stem = block name minus its last `_` token (the size, 10-CLO-DXF-FORMAT §1.5). `FP_R_<S>` → `FP_R`.
function stemOf(block: string): string | null {
  const at = block.lastIndexOf('_');
  return at > 0 ? block.slice(0, at) : null;
}

type Frame = { o: Pt; t: Pt; n: Pt };

function frameAt(loop: readonly Pt[], seg: number, s: number): Frame | null {
  const a = loop[seg];
  const b = loop[(seg + 1) % loop.length];
  const t = unit(a, b);
  if (!t) return null;
  return { o: { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s }, t, n: { x: -t.y, y: t.x } };
}

function nearestOn(loop: readonly Pt[], p: Pt): { seg: number; s: number } {
  let best = { seg: 0, s: 0 };
  let bestD = Infinity;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    let s = l2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
    s = Math.max(0, Math.min(1, s));
    const d = Math.hypot(p.x - a.x - s * dx, p.y - a.y - s * dy);
    if (d < bestD) {
      bestD = d;
      best = { seg: i, s };
    }
  }
  return best;
}

// Point in a frame → (along, across); and back in another frame.
const toLocal = (f: Frame, p: Pt): Pt => {
  const dx = p.x - f.o.x;
  const dy = p.y - f.o.y;
  return { x: dx * f.t.x + dy * f.t.y, y: dx * f.n.x + dy * f.n.y };
};
const fromLocal = (f: Frame, q: Pt): Pt => ({
  x: f.o.x + q.x * f.t.x + q.y * f.n.x,
  y: f.o.y + q.x * f.t.y + q.y * f.n.y,
});

const closedOn = (g: EntityGroup, layer: string) =>
  g.chains.filter((c) => c.closed && c.layer === layer && !c.notch);

// The contour layer to carry notches along: one closed contour in both blocks with the same vertex
// count. A layer that GRADES between the two sizes wins over one that does not (CLO-AAMA: layer 14
// grades, layer 1 is the sample's cut line copied into every size, §2.3 mode A).
function carrierLayer(
  donor: EntityGroup,
  target: EntityGroup,
): { layer: string; from: Pt[]; to: Pt[] } | null {
  let still: { layer: string; from: Pt[]; to: Pt[] } | null = null;
  const layers = [
    ...new Set(donor.chains.filter((c) => c.closed && !c.notch).map((c) => c.layer)),
  ].sort();
  for (const layer of layers) {
    if (layer === NOTCH_LAYER) continue;
    const a = closedOn(donor, layer);
    const b = closedOn(target, layer);
    if (
      a.length !== 1 ||
      b.length !== 1 ||
      a[0].pts.length !== b[0].pts.length ||
      a[0].pts.length < 3
    )
      continue;
    const moved = a[0].pts.some(
      (p, k) => Math.hypot(p.x - b[0].pts[k].x, p.y - b[0].pts[k].y) > 1e-3,
    );
    if (moved) return { layer, from: a[0].pts, to: b[0].pts };
    still ??= { layer, from: a[0].pts, to: b[0].pts };
  }
  return still;
}

// Within one stem (piece across sizes): when POINT notches live in exactly one block and the other
// blocks carry no notch at all, map each notch into each of them. Files whose every size already has
// its notches (CLO R2000, our own writer, pattern-maker files) are untouched.
export function carrySampleNotches(groups: EntityGroup[], warnings: string[]): void {
  const byStem = new Map<string, EntityGroup[]>();
  for (const g of groups) {
    if (!g.blockName) continue;
    const stem = stemOf(g.blockName);
    if (!stem) continue;
    const list = byStem.get(stem) ?? [];
    list.push(g);
    byStem.set(stem, list);
  }
  let carried = 0;
  const stranded: string[] = [];
  for (const [stem, list] of byStem) {
    if (list.length < 2) continue;
    const donors = list.filter((g) => g.chains.some((c) => c.notch));
    if (donors.length !== 1) continue;
    const donor = donors[0];
    const notches = donor.chains.filter((c) => c.notch);
    for (const target of list) {
      if (target === donor || target.chains.some((c) => c.layer === NOTCH_LAYER)) continue;
      const carrier = carrierLayer(donor, target);
      if (!carrier) {
        stranded.push(target.blockName ?? stem);
        continue;
      }
      for (const c of notches) {
        const at = nearestOn(carrier.from, c.pts[0]);
        const f0 = frameAt(carrier.from, at.seg, at.s);
        const f1 = frameAt(carrier.to, at.seg, at.s);
        if (!f0 || !f1) continue;
        target.chains.push({
          pts: [fromLocal(f1, toLocal(f0, c.pts[0])), fromLocal(f1, toLocal(f0, c.pts[1]))],
          closed: false,
          layer: c.layer,
          notch: true,
        });
        carried++;
      }
    }
  }
  if (carried > 0) {
    warnings.push(
      `notches are drawn only in the sample size — ${carried} carried to the other sizes along the graded contour`,
    );
  }
  if (stranded.length > 0) {
    warnings.push(
      `notches are drawn only in the sample size and could not be carried to ${stranded.length} block(s) (${stranded
        .slice(0, 5)
        .join(', ')}${stranded.length > 5 ? ', …' : ''}) — those sizes have no notches`,
    );
  }
}
