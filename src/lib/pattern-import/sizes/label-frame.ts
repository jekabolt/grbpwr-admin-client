// sizes/ — LABELFRAME: a small closed line drawn around a size label is the label's frame, not a
// size line and not the geometry of any size.
//
// polupalto boxes its size labels (a ≈ 6 mm square around «44» … «54», 97 on sheet 0). The label
// sits inside its box, so the text-label pass ranked every box as the size it names and the box went
// into that size's walls: region 10's size-44 outline ran around a box and the region fell out as an
// offset hull (the cutting list changed and had to be confirmed again).
//
// A closed line is a label's frame only when three independent things hold:
//   1. content — it encloses exactly one text, a label of the sheet's size run, and no other line
//      work (no stretch of another line inside it or across it);
//   2. scale — it hugs that text: its area is at most a label box (a few em), never piece-scale,
//      and the text's glyph box sits in it with at most an em to spare on each side;
//   3. no nesting — no other line runs around it on every side: the smallest outline of a graded
//      piece has the other sizes' outlines around it (outward, parallel, within the bundle distance).
// Anything less keeps today's behaviour (the line stays wherever the size pass put it).
import type { Chain, IRText, PtMm } from 'lib/pattern-import/types';

import { BUNDLE } from '../chains/bundles';
import { bboxOf, dist, SegGrid, segNearest } from '../chains/geom';
import { parseSizeToken } from './tokens';

/** A frame is never longer than this (mm): a label box, not a piece. */
const MAX_FRAME_MM = 60;
/** Frame area ≤ this many label boxes; a label box is (0.6 em per glyph + 1 em) × 2 em
 *  (polupalto: 0.54–0.57 of one box; a 10 mm circle around a «44» in 3.75 mm type: 1.27; a 20 mm
 *  piece: 6.5). */
const MAX_LABEL_BOXES = 1;
/** The glyph box across the baseline is at least this many em (cap height ≈ 0.7 em). */
const GLYPH_ACROSS_EM = 0.7;
/** The glyph box may stick out of the frame's box by this many em (a label set off-centre). */
const HUG_SLACK_EM = 0.15;
/** Another line's point this far inside the frame (mm) is line work in it (a duplicate stroke of
 *  the frame itself lies on it). */
const INSIDE_MM = 0.3;
/** Outward rays: step (mm along the frame), reach (the bundle distance), parallel within. */
const RAY_STEP_MM = 1;
const PARALLEL_COS = Math.cos((BUNDLE.parallelDeg * Math.PI) / 180);
/** The outward directions that meet a parallel line leave no gap wider than this: surrounded
 *  (polupalto's frames: ≥ 179°, one side or two opposite sides by the size lines beside them). */
const SURROUND_GAP_DEG = 135;

export type LabelFrame = { chain: number; label: string; text: IRText };

function signedArea(ring: readonly PtMm[]): number {
  let a = 0;
  for (let k = 0; k < ring.length; k++) {
    const p = ring[k];
    const q = ring[(k + 1) % ring.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function insideRing(p: PtMm, ring: readonly PtMm[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

function ringDist(p: PtMm, ring: readonly PtMm[]): number {
  let d = Infinity;
  for (let k = 0; k < ring.length; k++)
    d = Math.min(d, segNearest(p, ring[k], ring[(k + 1) % ring.length]).d);
  return d;
}

/** The chain as a closed ring (no repeated end point), or null when it is not closed. */
function ringOf(c: Chain): PtMm[] | null {
  const p = c.pts;
  if (p.length < 3) return null;
  const shut = dist(p[0], p[p.length - 1]) <= 0.5;
  if (!c.closed && !shut) return null;
  const ring = shut ? p.slice(0, -1) : p.slice();
  return ring.length >= 3 ? ring : null;
}

/**
 * Size-label frames among `chains` (only ids < `n0`, the built ones). `lineWork[i]`: the line is
 * drawing (not page furniture) — only drawing is a frame or nests around one. `sizeLabels`: the
 * labels of the sheet's size run.
 */
export function labelFrames(
  chains: readonly Chain[],
  n0: number,
  lineWork: readonly boolean[],
  texts: readonly IRText[],
  sizeLabels: ReadonlySet<string>,
): LabelFrame[] {
  if (!sizeLabels.size) return [];
  // 1 + 2: content and scale
  const all = new SegGrid(6);
  chains.forEach((c, i) => {
    all.addPolyline(i, c.pts);
    if (c.closed && c.pts.length > 2)
      all.addSeg(i, c.pts.length - 1, c.pts[c.pts.length - 1], c.pts[0]);
  });
  const segOf = (j: number, si: number): [PtMm, PtMm] => {
    const p = chains[j].pts;
    return [p[si], p[(si + 1) % p.length]];
  };
  const centre = (t: IRText) => ({
    x: (t.bbox.minX + t.bbox.maxX) / 2,
    y: (t.bbox.minY + t.bbox.maxY) / 2,
  });
  const cands: { chain: number; ring: PtMm[]; label: string; text: IRText }[] = [];
  for (let i = 0; i < Math.min(n0, chains.length); i++) {
    const c = chains[i];
    // drawing only: page furniture keeps its own reason
    if (!lineWork[i] || c.lengthMm > MAX_FRAME_MM) continue;
    const ring = ringOf(c);
    if (!ring) continue;
    const bb = bboxOf(ring);
    const inBox = (p: PtMm) => p.x >= bb.minX && p.x <= bb.maxX && p.y >= bb.minY && p.y <= bb.maxY;
    const held = texts.filter((t) => {
      const p = centre(t);
      return inBox(p) && insideRing(p, ring);
    });
    if (held.length !== 1) continue;
    const t = held[0];
    const tok = parseSizeToken(t.text, true);
    if (!tok || !sizeLabels.has(tok.label)) continue;
    const tb = t.bbox;
    const tw = tb.maxX - tb.minX;
    const th = tb.maxY - tb.minY;
    // em is never more than the glyph box across the baseline allows (a font size blown up by an
    // odd text matrix must not open the scale test)
    const across = Math.abs(Math.sin((t.rotationDeg * Math.PI) / 180)) > Math.SQRT1_2 ? tw : th;
    const em = Math.min(t.fontSizeMm > 0 ? t.fontSizeMm : Infinity, across / GLYPH_ACROSS_EM);
    const box = (0.6 * Math.max(1, t.text.trim().length) + 1) * em * 2 * em;
    if (!(em > 0) || Math.abs(signedArea(ring)) > MAX_LABEL_BOXES * box) continue;
    // it hugs the label: the glyph box lies in the frame's box, which is at most an em wider and
    // taller on each side (a long thin closed mark under a label is no frame)
    const slack = HUG_SLACK_EM * em;
    if (
      tb.minX < bb.minX - slack ||
      tb.maxX > bb.maxX + slack ||
      tb.minY < bb.minY - slack ||
      tb.maxY > bb.maxY + slack ||
      bb.maxX - bb.minX > tw + 2 * em ||
      bb.maxY - bb.minY > th + 2 * em
    )
      continue;
    // no other line work inside it or across it
    const mid = { x: (bb.minX + bb.maxX) / 2, y: (bb.minY + bb.maxY) / 2 };
    const r = Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY) / 2 + 1;
    let busy = false;
    const seen = new Set<number>();
    all.near(mid, r, (j, si) => {
      if (busy || j === i) return;
      const key = j * 1e6 + si;
      if (seen.has(key)) return;
      seen.add(key);
      const [a, b] = segOf(j, si);
      const L = dist(a, b);
      const steps = Math.max(1, Math.ceil(L / 0.5));
      for (let k = 0; k <= steps && !busy; k++) {
        const q = { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps };
        if (inBox(q) && insideRing(q, ring) && ringDist(q, ring) > INSIDE_MM) busy = true;
      }
    });
    if (busy) continue;
    cands.push({ chain: i, ring, label: tok.label, text: t });
  }
  if (!cands.length) return [];
  // 3: no nesting — outward rays from the frame meet a parallel line of drawing (not another
  // frame) on every side = the outline of the next size around it
  const isCand = new Set(cands.map((c) => c.chain));
  const work = new SegGrid(6);
  chains.forEach((c, j) => {
    if (!lineWork[j] || isCand.has(j)) return;
    work.addPolyline(j, c.pts);
    if (c.closed && c.pts.length > 2)
      work.addSeg(j, c.pts.length - 1, c.pts[c.pts.length - 1], c.pts[0]);
  });
  const reach = BUNDLE.maxSepMm;
  const out: LabelFrame[] = [];
  for (const f of cands) {
    const ring = f.ring;
    const ccw = signedArea(ring) > 0;
    const met: number[] = [];
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k];
      const b = ring[(k + 1) % ring.length];
      const L = dist(a, b);
      if (L < 1e-9) continue;
      const t = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
      // interior on the left of a counter-clockwise ring: outward is the right normal
      const nrm = ccw ? { x: t.y, y: -t.x } : { x: -t.y, y: t.x };
      for (let s = Math.min(RAY_STEP_MM / 2, L / 2); s < L; s += RAY_STEP_MM) {
        // from just inside the frame: a line lying on its side counts as around it
        const p = {
          x: a.x + t.x * s - nrm.x * INSIDE_MM,
          y: a.y + t.y * s - nrm.y * INSIDE_MM,
        };
        let hit = false;
        const seen = new Set<number>();
        for (let d = 0; d <= reach + 3 && !hit; d += 3) {
          const q = { x: p.x + nrm.x * d, y: p.y + nrm.y * d };
          work.near(q, 3, (j, si) => {
            if (hit) return;
            const key = j * 1e6 + si;
            if (seen.has(key)) return;
            seen.add(key);
            const [u0, u1] = segOf(j, si);
            const sx = u1.x - u0.x;
            const sy = u1.y - u0.y;
            const den = nrm.x * sy - nrm.y * sx;
            if (Math.abs(den) < 1e-12) return;
            const qx = u0.x - p.x;
            const qy = u0.y - p.y;
            const u = (qx * sy - qy * sx) / den;
            const v = (qx * nrm.y - qy * nrm.x) / den;
            if (v < -1e-6 || v > 1 + 1e-6 || u <= 0 || u > reach + INSIDE_MM) return;
            const sl = Math.hypot(sx, sy) || 1;
            if (Math.abs((t.x * sx + t.y * sy) / sl) >= PARALLEL_COS) hit = true;
          });
        }
        if (hit) met.push(((((Math.atan2(nrm.y, nrm.x) * 180) / Math.PI) % 360) + 360) % 360);
      }
    }
    if (surrounded(met)) continue;
    out.push({ chain: f.chain, label: f.label, text: f.text });
  }
  return out;
}

/** The outward directions that met a parallel line leave no gap wider than SURROUND_GAP_DEG. */
function surrounded(deg: number[]): boolean {
  if (deg.length < 2) return false;
  const a = deg.slice().sort((x, y) => x - y);
  let gap = 360 - a[a.length - 1] + a[0];
  for (let k = 1; k < a.length; k++) gap = Math.max(gap, a[k] - a[k - 1]);
  return gap < SURROUND_GAP_DEG;
}
