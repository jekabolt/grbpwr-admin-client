// A HALF ON FOLD, AS THE CARD CUTS IT (L14).
//
// The converter exports a piece it cannot unfold (Ulmus' ruffle: owner decision 19.10 a) as the
// HALF as drawn, its fold line on the AAMA mirror layer 6, `halfFold` in the manifest. Laid on the
// marker as drawn, that half is cut ONCE per garment — half a piece, with nothing to see on the
// marker, and the norm half its area. The engine lays open spreads only, so the honest equivalent
// of "the half with its fold edge on the folded fabric" is the unit those two plies give: the half
// ∪ its mirror across the fold line. That is also the card's FOLD semantics (proto: FOLD = union
// of the half and its reflection; nothing multiplies), so QUANTITY 1 stays one unit per garment.
//
// Applied inside applySeamAllowance, BEFORE the offset and also at allowance 0: every consumer of
// the cut footprint (worker nest, modal, batch, saved-marker export, norm areas) passes there, on
// both sides of the worker, with the same input. The parse stays as drawn (POM, plot, gate).
//
// D3: the unit is built only on TWO evidences — the trusted manifest says `halfFold` (the manifest
// is bound to the geometry by its contour signature, parse-files.ts) AND exactly one layer-6 line
// lies along a straight run of the outline. Everything else that points at a half is REFUSED with
// a plain reason, never laid as drawn and never unfolded on one evidence:
//   • a layer-6 line along the outline without the trusted fact (a foreign AAMA half, or a
//     converter file whose manifest is no longer trusted);
//   • the fact without such a line;
//   • the half crosses or touches its fold line away from the fold edge (XS/S of the ruffle: on
//     folded fabric the tips run past the fold and are lost; open, the two tips overlap);
//   • the grain runs neither along nor across the fold (the two halves would differ in grain).
import type { PieceDTO, Pt } from '../types';

import { area, bounds, signedArea } from './polygon';

/** AAMA DXF layer 6: mirror line. The converter writes a half's fold line there (write/r12.ts). */
export const AAMA_MIRROR_LAYER = '6';

// cm. The writer's fold line IS the cut line's own run (pattern-import halfFoldLine), so both
// carry the same vertices; 0.5 mm absorbs the mm→cm parse and the grain rotation.
const ON_TOL_CM = 0.05;
// The outline must run along at least this share of the fold line (as halfFoldLine requires).
const MIN_COVER = 0.9;
// Grain vs fold line: along or across, within this many degrees.
const GRAIN_TOL_DEG = 3;
// The unfolded outline must come out as twice the half within this share.
const AREA_TOL = 0.01;

type Line = { a: Pt; u: Pt; n: Pt; len: number };

const fmtCm = (v: number) => (v >= 1 ? v.toFixed(1) : v.toFixed(2));

function lineOf(pts: readonly Pt[]): Line | null {
  if (pts.length < 2) return null;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(len > 1)) return null;
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  return { a, u, n: { x: -u.y, y: u.x }, len };
}

const sideOf = (l: Line, p: Pt) => (p.x - l.a.x) * l.n.x + (p.y - l.a.y) * l.n.y;
const alongOf = (l: Line, p: Pt) => (p.x - l.a.x) * l.u.x + (p.y - l.a.y) * l.u.y;
const mirrorOf = (l: Line, p: Pt): Pt => {
  const s = sideOf(l, p);
  return { x: p.x - 2 * s * l.n.x, y: p.y - 2 * s * l.n.y };
};
const projectOn = (l: Line, p: Pt): Pt => {
  const t = alongOf(l, p);
  return { x: l.a.x + l.u.x * t, y: l.a.y + l.u.y * t };
};
const straight = (l: Line, pts: readonly Pt[]) =>
  pts.every((p) => Math.abs(sideOf(l, p)) <= ON_TOL_CM);

/**
 * The run of the outline along the fold line: the contiguous vertices on the line within its
 * extent, with the largest coverage. `others` — vertices on the line outside that run (the half
 * touches its fold line elsewhere).
 */
function foldRun(
  poly: readonly Pt[],
  l: Line,
): { from: number; to: number; cover: number; others: number } | null {
  const n = poly.length;
  const on = poly.map((p) => {
    const t = alongOf(l, p);
    return Math.abs(sideOf(l, p)) <= ON_TOL_CM && t >= -ON_TOL_CM && t <= l.len + ON_TOL_CM;
  });
  const onLine = poly.map((p) => Math.abs(sideOf(l, p)) <= ON_TOL_CM);
  const start = on.findIndex((v) => !v);
  if (start < 0) return null;
  let best: { from: number; to: number; cover: number } | null = null;
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (!on[i] || on[(i - 1 + n) % n]) continue;
    let lo = Infinity;
    let hi = -Infinity;
    let j = i;
    for (;;) {
      const t = alongOf(l, poly[j]);
      lo = Math.min(lo, t);
      hi = Math.max(hi, t);
      const nx = (j + 1) % n;
      if (!on[nx]) break;
      j = nx;
    }
    const cover = Math.min(hi, l.len) - Math.max(lo, 0);
    if (!best || cover > best.cover) best = { from: i, to: j, cover };
  }
  if (!best) return null;
  let others = 0;
  for (let i = 0; i < n; i++) {
    const inRun =
      best.from <= best.to ? i >= best.from && i <= best.to : i >= best.from || i <= best.to;
    if (!inRun && onLine[i]) others++;
  }
  return { ...best, others };
}

const refused = (p: PieceDTO, reason: string): PieceDTO => ({
  ...p,
  fold: { kind: 'refused', reason },
});

/**
 * The piece as the card cuts it: unchanged when it is not a half on fold, the unit (half ∪
 * mirror) when two evidences say it is, refused (with a plain reason) otherwise. Idempotent.
 */
export function foldUnitOf(p: PieceDTO): PieceDTO {
  if (p.fold) return p;
  const facts = p.manifest ?? null;
  const trusted = facts?.halfFold === true;
  const mirrors = (p.inner ?? []).filter((c) => c.layer === AAMA_MIRROR_LAYER && !c.closed);
  if (mirrors.length === 0) return trusted ? refused(p, 'no fold line on the piece') : p;

  // which mirror lines lie along the outline
  const along = mirrors
    .map((c) => ({ c, l: lineOf(c.pts) }))
    .filter((x): x is { c: (typeof mirrors)[number]; l: Line } => !!x.l)
    .map((x) => ({ ...x, run: foldRun(p.poly, x.l) }))
    .filter((x) => !!x.run && x.run.cover >= MIN_COVER * x.l.len && straight(x.l, x.c.pts));

  if (!trusted) {
    // one evidence (a mirror line on the edge) never unfolds; laying the half would cut half
    return along.length > 0
      ? refused(
          p,
          facts?.unfolded
            ? 'declared unfolded, yet a mirror line runs along its edge'
            : facts
              ? 'a mirror line runs along its edge, but the converter did not declare a half'
              : 'a mirror line runs along its edge (a half), with no converter facts to unfold it by',
        )
      : p;
  }
  if (mirrors.length > 1) return refused(p, `${mirrors.length} fold lines on the piece`);
  if (along.length === 0) return refused(p, 'its fold line is not on the cut line');
  const { c: foldChain, l, run } = along[0];
  if (!run) return refused(p, 'its fold line is not on the cut line');

  // the half must stay on its side of the fold line
  const n = p.poly.length;
  const inRun = (i: number) =>
    run.from <= run.to ? i >= run.from && i <= run.to : i >= run.from || i <= run.to;
  let mass = 0;
  for (let i = 0; i < n; i++) if (!inRun(i)) mass += sideOf(l, p.poly[i]);
  const sg = Math.sign(mass) || 1;
  let cross = 0;
  for (let i = 0; i < n; i++) {
    if (inRun(i)) continue;
    cross = Math.max(cross, -sg * sideOf(l, p.poly[i]));
  }
  if (cross > ON_TOL_CM)
    return refused(
      p,
      `the half crosses its fold line by ${fmtCm(cross)} cm — on the fold it cannot be cut as drawn`,
    );
  if (run.others > 0)
    return refused(
      p,
      'the half touches its fold line away from the fold edge — on the fold it is not one piece',
    );

  // grain: along or across the fold, or the two halves would lie on different grains
  const grainLayer = facts?.grainLayer ?? '';
  const grains = (p.inner ?? [])
    .filter((c) => grainLayer && c.layer === grainLayer && !c.closed && c.pts.length === 2)
    .map((c) => lineOf(c.pts))
    .filter((g): g is Line => !!g);
  for (const g of grains) {
    const dot = Math.abs(g.u.x * l.u.x + g.u.y * l.u.y);
    const deg = (Math.acos(Math.min(1, dot)) * 180) / Math.PI;
    if (deg > GRAIN_TOL_DEG && deg < 90 - GRAIN_TOL_DEG)
      return refused(
        p,
        `its grain runs ${deg.toFixed(0)}° off the fold line — the mirrored half would lie off grain`,
      );
  }

  // the unit: the outline from the run's end round to its start, then its mirror back
  const path: Pt[] = [];
  for (let k = 0, i = run.to; ; k++, i = (i + 1) % n) {
    path.push(p.poly[i]);
    if (i === run.from || k > n) break;
  }
  path[0] = projectOn(l, path[0]);
  path[path.length - 1] = projectOn(l, path[path.length - 1]);
  const back = path.map((q) => mirrorOf(l, q)).reverse();
  let unit = [...path, ...back.slice(1, -1)];
  if (signedArea(unit) < 0) unit = unit.reverse();
  const halfArea = area(p.poly);
  const unitArea = area(unit);
  if (!(Math.abs(unitArea - 2 * halfArea) <= AREA_TOL * 2 * halfArea))
    return refused(p, 'the unfolded outline does not come out as twice the half');

  // renormalize to the unit's own bbox corner, the drawing with it (as the seam allowance does)
  const bb = bounds(unit);
  const dx = bb.minX;
  const dy = bb.minY;
  const sh = (q: Pt): Pt => ({ x: q.x - dx, y: q.y - dy });
  const inner: NonNullable<PieceDTO['inner']> = [];
  for (const c of p.inner ?? []) {
    inner.push({ layer: c.layer, closed: c.closed, pts: c.pts.map(sh) });
    // the fold line stays once: it is the unit's axis, the line the cutter folds along
    if (c === foldChain) continue;
    inner.push({
      layer: c.layer,
      closed: c.closed,
      pts: c.pts.map((q) => sh(mirrorOf(l, q))).reverse(),
    });
  }
  return {
    ...p,
    poly: unit.map(sh),
    inner,
    bboxW: bb.maxX - dx,
    bboxH: bb.maxY - dy,
    areaCm2: unitArea,
    originX: p.originX != null ? p.originX + dx : undefined,
    originY: p.originY != null ? p.originY + dy : undefined,
    fold: { kind: 'unit', halfAreaCm2: halfArea },
  };
}
