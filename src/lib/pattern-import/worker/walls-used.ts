// The stretches of the source walls a written piece USES — the denominator of gate G3 (M7).
//
// `buildPieceSpecsDetailed(...).wallsOf` returns whole wall CHAINS. On a CLO DXF a chain is the
// piece's own outline, but on a PDF a chain runs on past the piece: a common edge shared with the
// neighbour, a size line that continues into the next piece. Measured whole, G3 blocked every PDF
// piece at 60–90 % while G4 was ≈ 0 (F13c).
//
// F13c cut each wall to the runs lying within 1 mm of the WRITTEN line. That made G3 a tautology:
// the denominator was defined by the output, so a stretch the output skipped (a corner cut by a
// chord, a bump bridged over) simply left the denominator and G3 still read ~100 %.
//
// Here the denominator comes from SOURCE topology. Each wall is split at its JUNCTIONS — the points
// where another wall of the same piece meets it: a crossing, or an end landing on (or within a
// bridged gap of) another wall. Between two junctions a wall is one segment; past its last
// junction it is a tail (an overshoot beyond a corner, or the run on into the neighbour). A segment
// is taken WHOLE or not at all: it belongs to this piece when at least half of it lies within
// `voteMm` (0.3 mm, the gate's own "on the line") of the vote line. The vote line is the fill's own snapped outline (source side) when
// the caller has it in the same frame, else the written line — and even then it only votes on
// whole junction-to-junction segments, it never trims one. So a stretch the output skips inside a
// used segment stays in the denominator and costs G3 its full length (plus the gate's contiguous
// gap rule, `PATIMPORT.coverageGapMm`). The only thing the vote can drop is a segment the line
// does not follow at all between two junctions — i.e. the piece went along a different wall there,
// which is a different outline, not a skipped stretch of this one.
import type { PtMm } from '../types';

const CELL = 4;
/** An open wall's end this close to another wall is a junction (T-joint or a gap the fill bridged). */
const TOUCH_MM = 5;
/** Junctions closer than this along one wall are one junction. */
const MERGE_MM = 0.5;
/** A segment belongs to the piece when this share of it is within `voteMm` of the vote line. */
const VOTE_SHARE = 0.5;

type Line = { pts: PtMm[]; cum: number[]; len: number; ring: boolean };

const d2 = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y);

function lineOf(pts: PtMm[]): Line {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + d2(pts[i - 1], pts[i]));
  const len = cum[cum.length - 1];
  return { pts, cum, len, ring: pts.length > 3 && d2(pts[0], pts[pts.length - 1]) < 1e-6 };
}

/** Uniform grid over segments of several polylines: key → [line, seg][]. */
class SegGrid {
  private cells = new Map<string, number[]>();
  constructor(
    private lines: Line[],
    closedLast = false,
  ) {
    lines.forEach((l, k) => {
      const n = l.pts.length - (closedLast ? 0 : 1);
      for (let i = 0; i < n; i++) {
        const a = l.pts[i];
        const b = l.pts[(i + 1) % l.pts.length];
        const x0 = Math.floor(Math.min(a.x, b.x) / CELL);
        const x1 = Math.floor(Math.max(a.x, b.x) / CELL);
        const y0 = Math.floor(Math.min(a.y, b.y) / CELL);
        const y1 = Math.floor(Math.max(a.y, b.y) / CELL);
        for (let x = x0; x <= x1; x++)
          for (let y = y0; y <= y1; y++) {
            const key = `${x},${y}`;
            const c = this.cells.get(key);
            if (c) c.push(k, i);
            else this.cells.set(key, [k, i]);
          }
      }
    });
  }
  /** Every (line, seg) pair in the cells within `reach` of p (may repeat). */
  near(p: PtMm, reach: number, fn: (k: number, i: number) => void) {
    const r = Math.ceil(reach / CELL);
    const cx = Math.floor(p.x / CELL);
    const cy = Math.floor(p.y / CELL);
    for (let x = cx - r; x <= cx + r; x++)
      for (let y = cy - r; y <= cy + r; y++) {
        const c = this.cells.get(`${x},${y}`);
        if (c) for (let j = 0; j < c.length; j += 2) fn(c[j], c[j + 1]);
      }
  }
  /** Every (line, seg) pair sharing a cell with segment a→b. */
  along(a: PtMm, b: PtMm, fn: (k: number, i: number) => void) {
    const x0 = Math.floor(Math.min(a.x, b.x) / CELL);
    const x1 = Math.floor(Math.max(a.x, b.x) / CELL);
    const y0 = Math.floor(Math.min(a.y, b.y) / CELL);
    const y1 = Math.floor(Math.max(a.y, b.y) / CELL);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const c = this.cells.get(`${x},${y}`);
        if (c) for (let j = 0; j < c.length; j += 2) fn(c[j], c[j + 1]);
      }
  }
}

function segNearest(p: PtMm, a: PtMm, b: PtMm): { d: number; u: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const u = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return { d: Math.hypot(a.x + u * dx - p.x, a.y + u * dy - p.y), u };
}

/** Proper intersection of a→b and c→d: [t on ab, u on cd] or null (parallel / apart). */
function segCross(a: PtMm, b: PtMm, c: PtMm, d: PtMm): [number, number] | null {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? [t, u] : null;
}

/** Point at arc position s of a line. */
function at(l: Line, s: number): PtMm {
  if (s <= 0) return l.pts[0];
  if (s >= l.len) return l.pts[l.pts.length - 1];
  let lo = 0;
  let hi = l.cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (l.cum[m] <= s) lo = m;
    else hi = m;
  }
  const L = l.cum[hi] - l.cum[lo] || 1;
  const t = (s - l.cum[lo]) / L;
  const a = l.pts[lo];
  const b = l.pts[hi];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** The line's points between arc positions a < b, ends interpolated. */
function stretch(l: Line, a: number, b: number): PtMm[] {
  const out: PtMm[] = [at(l, a)];
  for (let i = 0; i < l.cum.length; i++) if (l.cum[i] > a && l.cum[i] < b) out.push(l.pts[i]);
  out.push(at(l, b));
  return out;
}

/**
 * Junction arc positions of every wall: crossings with another wall, and an open wall's end that
 * lands on / within `TOUCH_MM` of another wall (that wall is split at the landing point too).
 * Pure source topology — the written line is not consulted.
 */
export function junctionsOf(walls: readonly PtMm[][]): number[][] {
  const lines = walls.map((w) => lineOf(w));
  const grid = new SegGrid(lines);
  const js: number[][] = lines.map(() => []);
  // crossings (each pair once: only against lines with a higher index)
  lines.forEach((li, i) => {
    for (let a = 0; a + 1 < li.pts.length; a++) {
      const p = li.pts[a];
      const q = li.pts[a + 1];
      const seen = new Set<number>();
      grid.along(p, q, (k, b) => {
        if (k <= i) return;
        const key = k * 1e7 + b;
        if (seen.has(key)) return;
        seen.add(key);
        const lk = lines[k];
        const x = segCross(p, q, lk.pts[b], lk.pts[b + 1]);
        if (!x) return;
        js[i].push(li.cum[a] + x[0] * (li.cum[a + 1] - li.cum[a]));
        js[k].push(lk.cum[b] + x[1] * (lk.cum[b + 1] - lk.cum[b]));
      });
    }
  });
  // ends landing on another wall
  lines.forEach((li, i) => {
    if (li.ring || li.pts.length < 2) return;
    for (const [end, s] of [
      [li.pts[0], 0],
      [li.pts[li.pts.length - 1], li.len],
    ] as const) {
      // nearest point of every other wall within reach; the end lands on the nearest one — and on
      // every wall drawn on top of it (a line repeated per size layer): a coincident duplicate must
      // not steal the junction from the wall that bounds the piece (I2, kombinezon's Style A knife
      // drawn once per size, ending on the side seam)
      const nearest = new Map<number, { d: number; s: number }>();
      grid.near(end, TOUCH_MM, (k, b) => {
        if (k === i) return;
        const lk = lines[k];
        const r = segNearest(end, lk.pts[b], lk.pts[b + 1]);
        const cur = nearest.get(k);
        if (!cur || r.d < cur.d)
          nearest.set(k, { d: r.d, s: lk.cum[b] + r.u * (lk.cum[b + 1] - lk.cum[b]) });
      });
      let best = Infinity;
      for (const v of nearest.values()) best = Math.min(best, v.d);
      if (!(best <= TOUCH_MM)) continue;
      js[i].push(s);
      for (const [k, v] of nearest) if (v.d <= best + MERGE_MM) js[k].push(v.s);
    }
  });
  return js.map((list, i) => {
    const sorted = list.sort((a, b) => a - b);
    const out: number[] = [];
    for (const s of sorted) if (!out.length || s - out[out.length - 1] > MERGE_MM) out.push(s);
    // a ring's seam: a junction at 0 and one at len are the same point
    const l = lines[i];
    if (l.ring && out.length > 1 && l.len - out[out.length - 1] + out[0] <= MERGE_MM) out.pop();
    return out;
  });
}

function voteIndex(vote: readonly PtMm[]) {
  const l = lineOf([...vote, vote[0]]);
  const grid = new SegGrid([l]);
  return (p: PtMm, reach: number): number => {
    let d = Infinity;
    grid.near(p, reach, (_k, i) => {
      const r = segNearest(p, l.pts[i], l.pts[i + 1]);
      if (r.d < d) d = r.d;
    });
    return d;
  };
}

/**
 * Walls cut to the junction-to-junction segments this piece uses (see the header). `vote` is a
 * closed line in the walls' frame — the fill's snapped outline when available, else the written
 * line. With no usable vote line the walls come back whole.
 *
 * Two passes: a wall the outline only grazed (a neighbouring size line running alongside, which the
 * snapper visited for a few samples) has no segment of its own, so it is dropped and the junctions
 * are computed again among the walls that remain — otherwise its crossings would chop the real
 * walls into short pieces and a whole skipped piece could be voted out.
 */
export function wallsUsedBy(
  walls: readonly PtMm[][],
  vote: readonly PtMm[] | null | undefined,
  voteMm = 0.3,
): PtMm[][] {
  if (!vote || vote.length < 3) return walls.map((w) => w.slice());
  const near = voteIndex(vote);
  const first = usedSegments(walls, near, voteMm);
  const keep = walls.filter((_, i) => first.some((r) => r.wall === i));
  if (keep.length === walls.length) return first.map((r) => r.pts);
  return usedSegments(keep, near, voteMm).map((r) => r.pts);
}

function usedSegments(
  walls: readonly PtMm[][],
  near: (p: PtMm, reach: number) => number,
  voteMm: number,
): { wall: number; pts: PtMm[] }[] {
  const lines = walls.map((w) => lineOf(w));
  const js = junctionsOf(walls);
  const share = (l: Line, a: number, b: number): number => {
    const n = Math.max(2, Math.ceil((b - a) / 0.5) + 1);
    let on = 0;
    for (let k = 0; k < n; k++)
      if (near(at(l, a + ((b - a) * k) / (n - 1)), voteMm) <= voteMm) on++;
    return on / n;
  };
  const out: { wall: number; pts: PtMm[] }[] = [];
  lines.forEach((l, i) => {
    if (l.len <= 0) return;
    const j = js[i];
    // segment boundaries along the wall; a ring without junctions is one closed segment
    const cuts = l.ring ? (j.length ? j : [0]) : [0, ...j.filter((s) => s > 0 && s < l.len), l.len];
    const segs: [number, number][] = [];
    if (l.ring) {
      for (let k = 0; k < cuts.length; k++) {
        const a = cuts[k];
        const b = k + 1 < cuts.length ? cuts[k + 1] : cuts[0] + l.len;
        segs.push([a, b]);
      }
    } else {
      for (let k = 0; k + 1 < cuts.length; k++) segs.push([cuts[k], cuts[k + 1]]);
    }
    // ring positions past len wrap round: split such a segment at the seam
    const piece = (a: number, b: number): PtMm[] =>
      b <= l.len
        ? stretch(l, a, b)
        : [...stretch(l, a, l.len), ...stretch(l, 0, b - l.len).slice(1)];
    const kept = segs.map(([a, b]) => {
      if (b - a < 1e-6) return false;
      const sh =
        b <= l.len
          ? share(l, a, b)
          : (share(l, a, l.len) * (l.len - a) + share(l, 0, b - l.len) * (b - l.len)) / (b - a);
      return sh >= VOTE_SHARE;
    });
    // merge consecutive kept segments into one polyline, so a skipped stretch is one contiguous
    // run for the gate's gap rule (a ring wraps its last run onto its first)
    let run: PtMm[] | null = null;
    const runs: PtMm[][] = [];
    for (let k = 0; k < segs.length; k++) {
      if (!kept[k]) {
        if (run) runs.push(run);
        run = null;
        continue;
      }
      const pts = piece(segs[k][0], segs[k][1]);
      run = run ? [...run, ...pts.slice(1)] : pts;
    }
    if (run) {
      if (l.ring && runs.length && kept[0] && kept[kept.length - 1])
        runs[0] = [...run, ...runs[0].slice(1)];
      else runs.push(run);
    }
    for (const r of runs) if (r.length >= 2) out.push({ wall: i, pts: r });
  });
  return out;
}
