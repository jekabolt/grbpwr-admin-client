// MOOD Ф5 — a piece ONE geometry serves for every size (a ruffle, a strap, a cuff, a waistband).
//
// Every size of the run closed on one outline. That alone is one evidence (D3): a graded piece
// whose sizes all borrowed one line closes alike too (MOOD-DIAG R9: Marostica's band). What the
// drawing says about it, under a size key (identity runs):
//   drawing  the outline is drawn ONCE in a line no size's key names (Hilde's ruffle), or by every
//            size in one place — ≥ 3 sizes' pens along the whole outline (Mood's cuffs and straps);
//   label    the texts inside it name no single size ("C - TOP RUFFLE · Cut 2 · Sizes XXS to 4XL");
//   against  a size draws its OWN line beside the outline, inside it (≤ 15 mm, off it): the smaller
//            sizes of a graded piece nest in its largest outline — the piece is graded.
// Drawing + label → one piece for all sizes (written once, `<ID>_UNI`, the card's ungraded piece),
// the reading recorded on the piece. One of them alone, or the outline drawn in ONE size's pen only
// (that size's piece, or one geometry drawn with it?) → the operator is asked; so is an outline nothing proves either way. Against → graded.
import type {
  ChainId,
  ChainSet,
  IRText,
  PieceCandidate,
  PtMm,
  Sheet,
  SizeRun,
  Style,
} from '../types';
import { parseSizeToken } from '../sizes/tokens';
import { OVERLAY_MIN_PENS, overlayAt } from '../sizes/overlay';
import { chainLook, onPen, rankLooks } from '../pieces/identity';
import { classOverlayLines } from '../pieces/walls';
import { SegGrid, segNearest } from '../pieces/geom';
import { closestOnPolyline, dist, pointInPolygon } from './geom';

export type OneSizeRead =
  | { kind: 'proven'; evidence: string[] }
  | { kind: 'ask'; why: string }
  | { kind: 'graded'; why: string };

/** The outline is drawn this much (by length) by the evidence named. */
const DRAWN_SHARE = 0.9;
/** A size's own line beside the outline: within this, mm … */
const BESIDE_MM = 15;
/** …and off it by more than this, mm. */
const OFF_MM = 1.5;
/** A size drawing this share of the outline (and no more) draws a part of it only. */
const PART_MIN = 0.3;
const PART_MAX = 0.85;

const canon = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '');

function ringSamples(outer: readonly PtMm[], step: number): { p: PtMm; t: PtMm }[] {
  const out: { p: PtMm; t: PtMm }[] = [];
  const n = outer.length;
  let next = step / 2;
  let s0 = 0;
  for (let i = 0; i < n; i++) {
    const a = outer[i];
    const b = outer[(i + 1) % n];
    const l = dist(a, b);
    if (l < 1e-9) continue;
    const t = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    for (; next <= s0 + l; next += step) {
      const k = next - s0;
      out.push({ p: { x: a.x + t.x * k, y: a.y + t.y * k }, t });
    }
    s0 += l;
  }
  return out;
}

/**
 * MOOD Ф5: what the drawing and the label say about one outline every size closed on alike.
 * Null when the reading does not apply (no size key: a rank by nesting proves no pen).
 */
export function oneSizeRead(
  cand: PieceCandidate,
  set: ChainSet,
  sheet: Pick<Sheet, 'texts' | 'styles'>,
  run: SizeRun,
): OneSizeRead | null {
  if (run.sizes.length < 3 || cand.outer.length < 3) return null;
  const styles = new Map<number, Style>(sheet.styles.map((s) => [s.id, s]));
  const { identity, looks } = rankLooks(set, run, styles);
  if (!identity) return null;
  const outer = cand.outer;
  const rankOfChain = new Map<ChainId, number>();
  const roleOf = new Map<ChainId, string>();
  for (const k of set.classes) {
    for (const id of k.chains) roleOf.set(id, k.role);
    if (k.role !== 'size') continue;
    const r = k.evidence.find((e) => e.kind === 'nesting-order');
    if (!r || r.kind !== 'nesting-order' || r.rank < 0 || r.rank >= run.sizes.length) continue;
    for (const id of k.chains) rankOfChain.set(id, r.rank);
  }
  const L = classOverlayLines(set, run.sizes.length);
  // every chain near the outline, for the nearest-line reading
  const b = cand.bbox;
  const pad = BESIDE_MM + 2;
  const grid = new SegGrid(4);
  const near: ChainId[] = [];
  for (const c of set.chains) {
    if (!c || c.pts.length < 2) continue;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of c.pts) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    if (x1 < b.minX - pad || x0 > b.maxX + pad || y1 < b.minY - pad || y0 > b.maxY + pad) continue;
    near.push(c.id);
    grid.addPolyline(c.id, c.pts, c.closed);
  }
  const penRank = (id: ChainId): number[] => {
    const c = set.chains[id];
    const l = c ? chainLook(c, styles) : null;
    if (!l) return [];
    return looks.flatMap((pen, r) => (pen.length && onPen(l, pen) ? [r] : []));
  };
  // ── the drawing: what lies under every 2 mm of the outline ──
  const smp = ringSamples(outer, 2);
  if (!smp.length) return null;
  const n = smp.length;
  let overlay = 0;
  let keyless = 0;
  const single = new Map<number, number>();
  /** per rank: the samples its own lines run on */
  const cover = new Map<number, number>();
  for (const { p, t } of smp) {
    const here = new Set<number>();
    grid.near(p, 0.6, (id, s) => {
      const r = rankOfChain.get(id);
      if (r === undefined || here.has(r)) return;
      const q = set.chains[id].pts;
      const a = q[s];
      const z = s + 1 < q.length ? q[s + 1] : q[0];
      if (a && z && segNearest(p, a, z).d <= 0.6) here.add(r);
    });
    for (const r of here) cover.set(r, (cover.get(r) ?? 0) + 1);
    if (overlayAt(p, t, L, null).ranks.size >= OVERLAY_MIN_PENS) {
      overlay++;
      continue;
    }
    let best: { id: ChainId; d: number } | null = null;
    grid.near(p, 0.6, (id, s) => {
      const q = set.chains[id].pts;
      const a = q[s];
      const z = s + 1 < q.length ? q[s + 1] : q[0];
      if (!a || !z) return;
      const d = segNearest(p, a, z).d;
      if (d <= 0.6 && (!best || d < best.d)) best = { id, d };
    });
    if (!best) continue;
    const id = (best as { id: ChainId }).id;
    const r = rankOfChain.get(id);
    const pr = r !== undefined ? [r] : penRank(id);
    if (pr.length === 1) single.set(pr[0], (single.get(pr[0]) ?? 0) + 1);
    else if (!pr.length && roleOf.get(id) !== 'size') keyless++;
  }
  const onePen = [...single].sort((x, y) => y[1] - x[1])[0];
  const drawn =
    overlay / n >= DRAWN_SHARE
      ? `every size draws it in one place (${OVERLAY_MIN_PENS}+ sizes' pens along ${Math.round((100 * overlay) / n)} % of it)`
      : keyless / n >= DRAWN_SHARE
        ? `drawn once, in a line no size's key names (${Math.round((100 * keyless) / n)} % of it)`
        : (overlay + keyless) / n >= DRAWN_SHARE
          ? `drawn once or by every size in one place (${Math.round((100 * (overlay + keyless)) / n)} % of it)`
          : null;
  const oneSizePen =
    !drawn && onePen && onePen[1] / n >= DRAWN_SHARE ? run.sizes[onePen[0]]?.label ?? null : null;
  // ── against: a size whose lines run on part of the outline and stop (its piece is shorter or
  //    narrower: cirrus's waistband, each size's sides ending at its own length) ──
  for (const [r, k] of cover) {
    const f = k / n;
    if (f >= PART_MIN && f <= PART_MAX)
      return {
        kind: 'graded',
        why: `size ${run.sizes[r]?.label ?? r} draws ${Math.round(100 * f)} % of the outline and stops`,
      };
  }
  // ── against: a size's own line beside the outline, off it ──
  for (const [id, r] of rankOfChain) {
    const c = set.chains[id];
    if (!c || c.lengthMm < 20 || !near.includes(id)) continue;
    let beside = 0;
    let m = 0;
    for (let i = 0; i + 1 < c.pts.length; i++) {
      const a = c.pts[i];
      const z = c.pts[i + 1];
      const l = dist(a, z);
      const k = Math.max(1, Math.ceil(l / 2));
      for (let j = 0; j < k; j++) {
        const p = {
          x: a.x + ((z.x - a.x) * (j + 0.5)) / k,
          y: a.y + ((z.y - a.y) * (j + 0.5)) / k,
        };
        m++;
        // inside the outline: the smaller sizes of a graded piece nest in it (a neighbouring
        // piece's line outside it is no evidence)
        const d = closestOnPolyline(p, outer, true).d;
        if (d > OFF_MM && d <= BESIDE_MM && pointInPolygon(p, outer)) beside++;
      }
    }
    if (m && beside / m >= 0.5 && beside * 2 >= 20)
      return {
        kind: 'graded',
        why: `size ${run.sizes[r]?.label ?? r} draws its own line beside the outline`,
      };
  }
  // ── the label: the texts inside name no single size ──
  const runLabels = new Set(run.sizes.map((z) => canon(z.label)));
  const inside = sheet.texts.filter((t: IRText) =>
    pointInPolygon(
      { x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 },
      outer,
    ),
  );
  const named = new Set<string>();
  for (const t of inside) {
    const tok = parseSizeToken(t.text);
    if (tok && runLabels.has(canon(tok.label))) named.add(tok.label);
  }
  const label = !inside.length
    ? null
    : named.size === 1
      ? null
      : `its label names no single size («${inside
          .map((t) => t.text.trim())
          .filter(Boolean)
          .slice(0, 2)
          .join(' · ')}»)`;
  const labelNo = !inside.length
    ? 'no label inside it'
    : named.size === 1
      ? `its label names size ${[...named][0]}`
      : null;
  if (drawn && label) return { kind: 'proven', evidence: [drawn, label] };
  if (drawn)
    return { kind: 'ask', why: `every size closes on one outline, ${drawn} — but ${labelNo}` };
  if (oneSizePen)
    return {
      kind: 'ask',
      why: `every size closes on one outline drawn once in size ${oneSizePen}'s pen${label ? `, ${label}` : ''} — that size's piece, or one piece for all sizes?`,
    };
  return {
    kind: 'ask',
    why: `every size closes on one outline, but no line proves it one piece (not drawn once, not by every size in one place)${label ? `; ${label}` : ''}`,
  };
}
