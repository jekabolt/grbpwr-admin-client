// gate/chrome.ts (A8b) — the signatures of a cut line traced around tile chrome, for G19.
//
// Redcafe "Толстовка 44" (owner, 10.10): the tile corner brackets — filled 15 × 1 mm bars at the
// four corners of every tile — stayed live line work, and the wall tracing ran AROUND their arms:
// the written cut line has hairpins (…, (186.9, 619.7), (186.9, 620.7), (171.9, 620.7),
// (171.9, 619.7), (185.9, 619.7), …) — out along one side of the bar, round its 1 mm end, back
// along the other side. And the cut / seam line runs ON chrome (a frame, a bracket the clean
// stage masked or only offered). Either way the file must not be vouched for.
import type { PtMm } from '../types';

/** G19 thresholds (mutable for the probes' mutation checks). */
export const CHROME_GATE = {
  /** A hairpin: a cap this short (mm) between two legs running back along each other … */
  capMaxMm: 2,
  /** … the shorter leg this long (mm): a bracket arm is 15 mm, a tile label's stroke a few mm. */
  legMinMm: 3,
  legMaxMm: 25,
  /** Legs antiparallel within this angle (deg); the cap across them within this of 90°. */
  parallelDeg: 20,
  capSquareDeg: 25,
  /** An edge ON chrome: within this distance (mm), near-parallel, along at least this length (mm). */
  touchMm: 0.3,
  alongMinMm: 5,
  /** A hairpin is judged only this close (mm) to a chrome item: a standalone one may be a notch. */
  hairpinNearMm: 1,
  /** A stretch on a FRAME line warns (a CF / fold may lie on a tile edge); true = blocks (mutation). */
  frameBlocks: false,
  /** …and a stretch on frames longer than this in all (mm, per written line) blocks. */
  frameBlockMm: 100,
  /** … following it: the offset spreads at most this much (mm) over the stretch. */
  followSpreadMm: 0.1,
};

const len = (a: PtMm, b: PtMm) => Math.hypot(b.x - a.x, b.y - a.y);

/** The ring without zero-length steps and with straight runs merged (one vertex per corner). */
function corners(pts: readonly PtMm[], closed: boolean): PtMm[] {
  const out: PtMm[] = [];
  for (const p of pts) if (!out.length || len(out[out.length - 1], p) > 0.05) out.push(p);
  if (closed && out.length > 1 && len(out[0], out[out.length - 1]) <= 0.05) out.pop();
  // merge collinear runs (turn < 3°)
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      if (!closed && (i === 0 || i === out.length - 1)) continue;
      const a = out[(i - 1 + out.length) % out.length];
      const v = out[i];
      const c = out[(i + 1) % out.length];
      const u = { x: v.x - a.x, y: v.y - a.y };
      const w = { x: c.x - v.x, y: c.y - v.y };
      const L = Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y);
      if (
        L > 0 &&
        Math.abs(u.x * w.y - u.y * w.x) / L < Math.sin((3 * Math.PI) / 180) &&
        u.x * w.x + u.y * w.y > 0
      ) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/** A hairpin: its middle, cap width, the shorter leg, and the four corners (leg, cap, leg). */
export type Hairpin = { at: PtMm; capMm: number; legMm: number; pts: PtMm[] };

/**
 * Narrow rectangular excursions of a written line: a cap ≤ 2 mm, square to two legs 3–25 mm long
 * that run back along each other (antiparallel) — the line went out along one side of a 1 mm bar
 * and came back along the other. A real cut line does not fold back on itself like that (a slit
 * notch is written on the notch layer, a spike is stripped and G4 blocks one that is left).
 */
export function hairpins(pts: readonly PtMm[], closed: boolean): Hairpin[] {
  const q = corners(pts, closed);
  const n = q.length;
  const out: Hairpin[] = [];
  if (n < 4) return out;
  const cosPar = Math.cos((CHROME_GATE.parallelDeg * Math.PI) / 180);
  const sinSq = Math.sin((CHROME_GATE.capSquareDeg * Math.PI) / 180);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    // cap = q[i] → q[i+1]; legs = q[i-1] → q[i] and q[i+1] → q[i+2]
    if (!closed && (i === 0 || i + 2 > n - 1)) continue;
    const a = q[(i - 1 + n) % n];
    const b = q[i];
    const c = q[(i + 1) % n];
    const d = q[(i + 2) % n];
    const cap = len(b, c);
    const l1 = len(a, b);
    const l2 = len(c, d);
    if (cap > CHROME_GATE.capMaxMm || cap < 0.05) continue;
    // the shorter leg is the excursion (the longer one may run on: two bars end to end)
    const leg = Math.min(l1, l2);
    if (leg < CHROME_GATE.legMinMm || leg > CHROME_GATE.legMaxMm) continue;
    const u = { x: (b.x - a.x) / l1, y: (b.y - a.y) / l1 };
    const w = { x: (d.x - c.x) / l2, y: (d.y - c.y) / l2 };
    if (u.x * w.x + u.y * w.y > -cosPar) continue;
    const k = { x: (c.x - b.x) / cap, y: (c.y - b.y) / cap };
    if (Math.abs(k.x * u.x + k.y * u.y) > sinSq) continue;
    out.push({
      at: { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 },
      capMm: cap,
      legMm: Math.min(l1, l2),
      pts: [a, b, c, d],
    });
  }
  return out;
}

type Seg = { a: PtMm; b: PtMm; ux: number; uy: number; L: number };

const segD = (p: PtMm, s: Seg) => {
  const t = Math.max(0, Math.min(s.L, (p.x - s.a.x) * s.ux + (p.y - s.a.y) * s.uy));
  return Math.hypot(p.x - s.a.x - t * s.ux, p.y - s.a.y - t * s.uy);
};

/** Chrome lines as a cell index of segments (2 mm cells). */
export class ChromeIndex {
  private cells = new Map<string, Seg[]>();
  private all: Seg[] = [];
  readonly size: number;
  constructor(lines: readonly PtMm[][]) {
    let n = 0;
    for (const l of lines)
      for (let i = 0; i + 1 < l.length; i++) {
        const a = l[i];
        const b = l[i + 1];
        const L = len(a, b);
        if (L < 0.05) continue;
        const s = { a, b, ux: (b.x - a.x) / L, uy: (b.y - a.y) / L, L };
        this.all.push(s);
        n++;
        const x0 = Math.floor((Math.min(a.x, b.x) - 0.5) / 2);
        const x1 = Math.floor((Math.max(a.x, b.x) + 0.5) / 2);
        const y0 = Math.floor((Math.min(a.y, b.y) - 0.5) / 2);
        const y1 = Math.floor((Math.max(a.y, b.y) + 0.5) / 2);
        for (let x = x0; x <= x1; x++)
          for (let y = y0; y <= y1; y++) {
            const k = `${x},${y}`;
            const c = this.cells.get(k);
            if (c) c.push(s);
            else this.cells.set(k, [s]);
          }
      }
    this.size = n;
  }
  /** A chrome segment within `r` (≤ 2 mm) of p, any direction. */
  near(p: PtMm, r: number): boolean {
    if (r > 2) return this.all.some((s) => segD(p, s) <= r);
    const cx = Math.floor(p.x / 2);
    const cy = Math.floor(p.y / 2);
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let y = cy - 1; y <= cy + 1; y++)
        for (const s of this.cells.get(`${x},${y}`) ?? []) {
          const t = Math.max(0, Math.min(s.L, (p.x - s.a.x) * s.ux + (p.y - s.a.y) * s.uy));
          if (Math.hypot(p.x - s.a.x - t * s.ux, p.y - s.a.y - t * s.uy) <= r) return true;
        }
    return false;
  }
  /**
   * The signed offset (mm) of p from a chrome segment within `r` running along direction (dx, dy)
   * (|sin| ≤ 0.1), positive to the left of (dx, dy); null when none.
   */
  along(p: PtMm, dx: number, dy: number, r: number): number | null {
    const c = this.cells.get(`${Math.floor(p.x / 2)},${Math.floor(p.y / 2)}`);
    if (!c) return null;
    let best: number | null = null;
    for (const s of c) {
      if (Math.abs(s.ux * dy - s.uy * dx) > 0.1) continue;
      const t = Math.max(0, Math.min(s.L, (p.x - s.a.x) * s.ux + (p.y - s.a.y) * s.uy));
      const ex = p.x - s.a.x - t * s.ux;
      const ey = p.y - s.a.y - t * s.uy;
      const d = Math.hypot(ex, ey);
      if (d > r || (best !== null && d >= Math.abs(best))) continue;
      // the side of p, seen along the written line's direction
      const side = Math.sign(s.ux * dx + s.uy * dy) * (s.ux * ey - s.uy * ex);
      best = side < 0 ? -d : d;
    }
    return best;
  }
}

export type OnChrome = { from: PtMm; to: PtMm; lengthMm: number };

/**
 * Stretches ≥ 5 mm of a written line that run ON chrome (≤ 0.3 mm, near-parallel) at a constant
 * offset: a garment curve that CROSSES a frame line at a shallow angle (Redcafe's side seams, 2°)
 * or touches it (a neckline apex) is within 0.3 mm of it for 12–17 mm too, but its offset sweeps.
 */
export function onChrome(pts: readonly PtMm[], closed: boolean, idx: ChromeIndex): OnChrome[] {
  const out: OnChrome[] = [];
  if (!idx.size || pts.length < 2) return out;
  const n = pts.length;
  const segs = closed ? n : n - 1;
  const step = 0.5;
  let run: { from: PtMm; to: PtMm; L: number; lo: number; hi: number } | null = null;
  const flush = () => {
    // it FOLLOWS the chrome line: a constant offset (a curve tangent to a frame line, Redcafe's
    // neckline seam apex on a tile edge, comes in and leaves again — its offset spreads 0.3 mm)
    const follows = run && run.hi - run.lo <= CHROME_GATE.followSpreadMm;
    if (run && run.L >= CHROME_GATE.alongMinMm && follows)
      out.push({ from: run.from, to: run.to, lengthMm: run.L });
    run = null;
  };
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const L = len(a, b);
    if (L < 1e-6) continue;
    const dx = (b.x - a.x) / L;
    const dy = (b.y - a.y) / L;
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++) {
      const p = { x: a.x + (dx * L * j) / k, y: a.y + (dy * L * j) / k };
      const d = idx.along(p, dx, dy, CHROME_GATE.touchMm);
      if (d !== null) {
        if (run) {
          run.L += len(run.to, p);
          run.to = p;
          run.lo = Math.min(run.lo, d);
          run.hi = Math.max(run.hi, d);
        } else run = { from: p, to: p, L: 0, lo: d, hi: d };
      } else flush();
    }
  }
  flush();
  return out;
}
