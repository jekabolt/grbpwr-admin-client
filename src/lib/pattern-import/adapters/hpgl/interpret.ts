// F12 · HP-GL interpreter: commands → raw runs/labels in PLOTTER units (y-up, as plotters are).
// One pen-down run (pen goes down … pen up / pen or line-type change) = one `op`.
//
// Supported: IN DF SP PU PD PA PR PE LT PW PC LB DT SI SR DI DR LO CP CI AA AR AT RT BZ BR EA ER
// RA RR IP SC. Ignored with a warning: RO, EW/WG (wedges), DV. Everything else (VS, FS, PS, BP,
// NP, CR, TR, MC, PG, WU, …) changes nothing geometric for an importer and is skipped silently.

import type { WorkBudgetLike } from '../../types';
import type { HpglCmd } from './tokenize';
import { decodePe, PeError } from './pe';
import { curveSegments, flattenCubic, MAX_CURVE_SEGMENTS } from '../vector/flatten';

export type Pt = { x: number; y: number };

export type LineTypeState = { type: number | null; len: number; mode: 0 | 1 };

export type RawRun = {
  op: number;
  pts: Pt[]; // plotter units
  closed: boolean;
  pen: number;
  lt: LineTypeState;
  fill: boolean;
};

export type RawLabel = {
  op: number;
  line: number;
  text: string;
  /** Baseline-left anchor, plotter units. */
  anchor: Pt;
  /** Unit vector along the baseline. */
  dir: Pt;
  capHeightPu: number;
  /** Estimated width along dir, plotter units. */
  widthPu: number;
};

export type Interpreted = {
  runs: RawRun[];
  labels: RawLabel[];
  penWidthMm: Map<number, number>;
  penRgb: Map<number, [number, number, number]>;
  /** Diagonal |P2−P1| in plotter units when IP was given (relative LT lengths), else null. */
  ipDiagPu: number | null;
  warnings: string[];
  /** Commands that changed geometry or text (for the "no geometry" refusal). */
  drawn: number;
  peError: string | null;
};

type Scaling =
  | null
  | {
      kind: 0 | 1;
      xmin: number;
      xmax: number;
      ymin: number;
      ymax: number;
      left: number;
      bottom: number;
    }
  | { kind: 2; xmin: number; xf: number; ymin: number; yf: number };

/**
 * HP-GL/2 default fixed line-type patterns, % of the pattern length (dash, gap, dash, gap…).
 * Type 0 (HP-GL/1: dot at each vector end) is approximated as a dot pattern.
 */
const LT_TABLE: Record<number, number[]> = {
  0: [0, 100],
  1: [0, 100],
  2: [50, 50],
  3: [70, 30],
  4: [80, 10, 0, 10],
  5: [70, 10, 10, 10],
  6: [50, 10, 10, 10, 10, 10],
  7: [70, 10, 0, 10, 0, 10],
  8: [50, 10, 0, 10, 10, 10, 0, 10],
};

export function lineTypePercents(type: number): number[] | null {
  return LT_TABLE[Math.abs(Math.trunc(type))] ?? null;
}

const DEFAULT_SI = { wCm: 0.285, hCm: 0.375 }; // HP-GL absolute character size default

export function interpret(
  cmds: HpglCmd[],
  unitsPerMm: number,
  sagittaMm: number,
  budget?: WorkBudgetLike,
): Interpreted {
  const warnings = new Set<string>();
  const runs: RawRun[] = [];
  const labels: RawLabel[] = [];
  const penWidthMm = new Map<number, number>();
  const penRgb = new Map<number, [number, number, number]>();
  const sagPu = sagittaMm * unitsPerMm;

  let pos: Pt = { x: 0, y: 0 };
  let down = false;
  let absolute = true;
  let pen = 1;
  let lt: LineTypeState = { type: null, len: 4, mode: 0 };
  let ltPrev: LineTypeState = { type: 2, len: 4, mode: 0 };
  let p1: Pt = { x: 0, y: 0 };
  let p2: Pt | null = null;
  let sc: Scaling = null;
  let charW = DEFAULT_SI.wCm * 10 * unitsPerMm; // plotter units
  let charH = DEFAULT_SI.hCm * 10 * unitsPerMm;
  let dir: Pt = { x: 1, y: 0 };
  let lo = 1;
  let op = 0;
  let drawn = 0;
  let peError: string | null = null;
  let cur: RawRun | null = null;

  const endRun = () => {
    if (cur && cur.pts.length >= 2) runs.push(cur);
    cur = null;
  };
  const ensureRun = () => {
    if (!cur) {
      cur = { op: op++, pts: [{ ...pos }], closed: false, pen, lt: { ...lt }, fill: false };
      drawn++;
    }
    return cur;
  };
  const styleChanged = () => endRun();

  // ── user units ↔ plotter units ──────────────────────────────────────────────────────────
  const p2OrDefault = (): Pt => p2 ?? { x: p1.x + 10000, y: p1.y + 10000 };
  const scaleFactors = (): { sx: number; sy: number; ox: number; oy: number } => {
    if (!sc) return { sx: 1, sy: 1, ox: 0, oy: 0 };
    if (sc.kind === 2)
      return { sx: sc.xf, sy: sc.yf, ox: p1.x - sc.xmin * sc.xf, oy: p1.y - sc.ymin * sc.yf };
    const q = p2OrDefault();
    let sx = (q.x - p1.x) / (sc.xmax - sc.xmin || 1);
    let sy = (q.y - p1.y) / (sc.ymax - sc.ymin || 1);
    let ox = p1.x - sc.xmin * sx;
    let oy = p1.y - sc.ymin * sy;
    if (sc.kind === 1) {
      const s = Math.min(Math.abs(sx), Math.abs(sy));
      const usedX = s * (sc.xmax - sc.xmin);
      const usedY = s * (sc.ymax - sc.ymin);
      const offX = (Math.abs(q.x - p1.x) - usedX) * (sc.left / 100);
      const offY = (Math.abs(q.y - p1.y) - usedY) * (sc.bottom / 100);
      sx = Math.sign(sx || 1) * s;
      sy = Math.sign(sy || 1) * s;
      ox = p1.x + offX - sc.xmin * sx;
      oy = p1.y + offY - sc.ymin * sy;
    }
    return { sx, sy, ox, oy };
  };
  const toPu = (x: number, y: number, rel: boolean): Pt => {
    const f = scaleFactors();
    if (rel) return { x: pos.x + x * f.sx, y: pos.y + y * f.sy };
    return { x: f.ox + x * f.sx, y: f.oy + y * f.sy };
  };
  /** A length in user units along x (radii, chord). */
  const lenPu = (v: number): number => v * Math.abs(scaleFactors().sx);

  const spend = (n: number) => budget?.spend(n, 'the plotter moves');
  const lineTo = (q: Pt) => {
    spend(1);
    if (down) ensureRun().pts.push(q);
    pos = q;
  };
  const moveTo = (q: Pt) => {
    endRun();
    pos = q;
  };

  const coordPairs = (args: number[], rel: boolean, draw: boolean | null) => {
    for (let k = 0; k + 1 < args.length; k += 2) {
      const q = toPu(args[k], args[k + 1], rel);
      if (draw === null ? down : draw) {
        if (!down) down = true;
        lineTo(q);
      } else moveTo(q);
    }
  };

  /** Arc around c from the current point by sweepDeg (CCW positive, plotter y-up). */
  const arc = (c: Pt, sweepDeg: number, endExact?: Pt) => {
    const r = Math.hypot(pos.x - c.x, pos.y - c.y);
    if (!(r > 0) || sweepDeg === 0) return;
    const a0 = Math.atan2(pos.y - c.y, pos.x - c.x);
    const dt = (sweepDeg * Math.PI) / 180;
    const step = Math.min(Math.PI / 4, Math.sqrt((8 * sagPu) / r));
    const n = curveSegments(Math.abs(dt) / step);
    spend(n);
    const pts: Pt[] = [];
    for (let i = 1; i <= n; i++) {
      const t = a0 + (dt * i) / n;
      pts.push(
        i === n && endExact ? endExact : { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) },
      );
    }
    if (down) {
      const run = ensureRun();
      for (const q of pts) run.pts.push(q);
    }
    pos = pts[pts.length - 1];
  };

  /** Arc through three points: current → mid → end. */
  const arc3 = (mid: Pt, end: Pt) => {
    const a = pos;
    const d = 2 * (a.x * (mid.y - end.y) + mid.x * (end.y - a.y) + end.x * (a.y - mid.y));
    if (Math.abs(d) < 1e-9) {
      lineTo(end);
      return;
    }
    const a2 = a.x * a.x + a.y * a.y;
    const m2 = mid.x * mid.x + mid.y * mid.y;
    const e2 = end.x * end.x + end.y * end.y;
    const c = {
      x: (a2 * (mid.y - end.y) + m2 * (end.y - a.y) + e2 * (a.y - mid.y)) / d,
      y: (a2 * (end.x - mid.x) + m2 * (a.x - end.x) + e2 * (mid.x - a.x)) / d,
    };
    const ang = (p: Pt) => Math.atan2(p.y - c.y, p.x - c.x);
    const norm = (v: number) => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const t0 = ang(a);
    const ccwMid = norm(ang(mid) - t0);
    const ccwEnd = norm(ang(end) - t0);
    const sweep = ccwMid <= ccwEnd ? ccwEnd : ccwEnd - 2 * Math.PI;
    arc(c, (sweep * 180) / Math.PI, end);
  };

  const cubic = (c1: Pt, c2: Pt, end: Pt) => {
    const out: Pt[] = [];
    flattenCubic(pos, c1, c2, end, sagPu, out);
    spend(out.length);
    if (down) {
      const run = ensureRun();
      for (const q of out) run.pts.push(q);
    }
    pos = end;
  };

  /** A closed shape drawn regardless of pen state, as its own op; pen returns to `back`. */
  const shape = (pts: Pt[], fill: boolean, back: Pt) => {
    endRun();
    runs.push({ op: op++, pts, closed: true, pen, lt: { ...lt }, fill });
    drawn++;
    pos = back;
  };

  const resetDefaults = (full: boolean) => {
    endRun();
    absolute = true;
    lt = { type: null, len: 4, mode: 0 };
    sc = null;
    charW = DEFAULT_SI.wCm * 10 * unitsPerMm;
    charH = DEFAULT_SI.hCm * 10 * unitsPerMm;
    dir = { x: 1, y: 0 };
    lo = 1;
    if (full) {
      down = false;
      pos = { x: 0, y: 0 };
      p1 = { x: 0, y: 0 };
      p2 = null;
    }
  };

  const label = (raw: string, cmdOp: number) => {
    const text = raw.replace(/[\x00-\x07\x0b\x0c\x0e-\x1f]/g, '');
    const lines = text.split('\n');
    const u = dir;
    const v = { x: -u.y, y: u.x };
    const cell = 1.5 * charW;
    let start = { ...pos };
    let last: Pt = { ...pos };
    let lineNo = 0;
    for (const lineRaw of lines) {
      // CR returns to the line start; keep the text after the last CR (overstrike is rare).
      const parts = lineRaw.replace(/\r+$/, '').split('\r');
      const line = parts[parts.length - 1];
      const t = line.replace(/\s+$/, '');
      const fullPu = t.length > 0 ? t.length * cell - 0.5 * charW : 0;
      const body = t.trimStart();
      if (body.length > 0) {
        const lead = (t.length - body.length) * cell;
        const { fx, fy, ox, oy } = labelOrigin(lo, charW, charH);
        const dx = -fx * fullPu + ox + lead;
        const dy = -fy * charH + oy;
        const anchor = { x: start.x + dx * u.x + dy * v.x, y: start.y + dx * u.y + dy * v.y };
        const widthPu = body.length * cell - 0.5 * charW;
        labels.push({
          op: cmdOp,
          line: lineNo,
          text: body,
          anchor,
          dir: { ...u },
          capHeightPu: charH,
          widthPu,
        });
      }
      last = { x: start.x + line.length * cell * u.x, y: start.y + line.length * cell * u.y };
      // LF: down one line (2 × char height), back to the label's x.
      start = { x: start.x - 2 * charH * v.x, y: start.y - 2 * charH * v.y };
      lineNo++;
    }
    drawn++;
    // LO 1/2/3 leave the pen after the label; other origins return it to where it was.
    if (lo === 1 || lo === 2 || lo === 3 || lo === 11 || lo === 12 || lo === 13) pos = last;
  };

  for (const c of cmds) {
    const a = c.args;
    switch (c.op) {
      case 'IN':
        resetDefaults(true);
        pen = pen || 1;
        break;
      case 'DF':
        resetDefaults(false);
        break;
      case 'SP': {
        const np = a.length ? Math.trunc(a[0]) : 0;
        if (np !== pen) styleChanged();
        pen = np;
        break;
      }
      case 'PU':
        down = false;
        endRun();
        coordPairs(a, !absolute, false);
        break;
      case 'PD':
        down = true;
        if (a.length === 0) ensureRun();
        coordPairs(a, !absolute, true);
        break;
      case 'PA':
        absolute = true;
        coordPairs(a, false, null);
        break;
      case 'PR':
        absolute = false;
        coordPairs(a, true, null);
        break;
      case 'PE': {
        let ops;
        try {
          ops = decodePe(c.text ?? '');
        } catch (e) {
          peError = e instanceof PeError ? e.message : String(e);
          break;
        }
        for (const o of ops) {
          if (o.k === 'pen') {
            if (o.pen !== pen) styleChanged();
            pen = o.pen;
            continue;
          }
          const q = toPu(o.x, o.y, !o.abs);
          if (o.k === 'move') {
            down = false;
            moveTo(q);
          } else {
            down = true;
            lineTo(q);
          }
        }
        break;
      }
      case 'LT': {
        const next: LineTypeState =
          a.length === 0
            ? { type: null, len: lt.len, mode: lt.mode }
            : Math.trunc(a[0]) === 99
              ? { ...ltPrev }
              : {
                  type: Math.trunc(a[0]),
                  len: a.length > 1 ? a[1] : lt.len,
                  mode: a.length > 2 ? (a[2] === 1 ? 1 : 0) : lt.mode,
                };
        if (lt.type !== null) ltPrev = { ...lt };
        if (next.type !== null && !LT_TABLE[Math.abs(next.type)])
          warnings.add(`LT${next.type}: user-defined line type, dash unknown`);
        if (JSON.stringify(next) !== JSON.stringify(lt)) styleChanged();
        lt = next;
        break;
      }
      case 'PW': {
        const w = a.length ? a[0] : 0.35;
        const forPen = a.length > 1 ? [Math.trunc(a[1])] : null;
        styleChanged();
        if (forPen) penWidthMm.set(forPen[0], w);
        else {
          penWidthMm.set(-1, w); // all pens
          penWidthMm.forEach((_, k) => k >= 0 && penWidthMm.set(k, w));
        }
        break;
      }
      case 'PC': {
        if (a.length >= 4) {
          styleChanged();
          penRgb.set(Math.trunc(a[0]), [clamp255(a[1]), clamp255(a[2]), clamp255(a[3])]);
        }
        break;
      }
      case 'IP':
        if (a.length >= 4) {
          p1 = { x: a[0], y: a[1] };
          p2 = { x: a[2], y: a[3] };
        } else if (a.length >= 2) {
          const q = p2OrDefault();
          const d = { x: q.x - p1.x, y: q.y - p1.y };
          p1 = { x: a[0], y: a[1] };
          p2 = { x: p1.x + d.x, y: p1.y + d.y };
        } else {
          p1 = { x: 0, y: 0 };
          p2 = null;
        }
        break;
      case 'SC':
        if (a.length === 0) sc = null;
        else if (a.length >= 5 && Math.trunc(a[4]) === 2)
          sc = { kind: 2, xmin: a[0], xf: a[1], ymin: a[2], yf: a[3] };
        else if (a.length >= 4) {
          const kind = a.length >= 5 && Math.trunc(a[4]) === 1 ? 1 : 0;
          sc = {
            kind,
            xmin: a[0],
            xmax: a[1],
            ymin: a[2],
            ymax: a[3],
            left: a[5] ?? 50,
            bottom: a[6] ?? 50,
          };
          if (!p2)
            warnings.add('SC without IP: P1/P2 unknown, assumed P2 = P1 + 10000 plotter units');
        }
        break;
      case 'CI': {
        if (!a.length) break;
        const r = lenPu(Math.abs(a[0]));
        if (!(r > 0)) break;
        const cx = pos.x;
        const cy = pos.y;
        const step = Math.min(Math.PI / 4, Math.sqrt((8 * sagPu) / r));
        const n = Math.min(MAX_CURVE_SEGMENTS, Math.max(8, Math.ceil((2 * Math.PI) / step)));
        spend(n);
        const pts: Pt[] = [];
        for (let i = 0; i < n; i++) {
          const t = (2 * Math.PI * i) / n;
          pts.push({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
        }
        shape(pts, false, { x: cx, y: cy });
        break;
      }
      case 'AA':
        if (a.length >= 3) arc(toPu(a[0], a[1], false), a[2]);
        break;
      case 'AR':
        if (a.length >= 3) arc(toPu(a[0], a[1], true), a[2]);
        break;
      case 'AT':
        if (a.length >= 4) arc3(toPu(a[0], a[1], false), toPu(a[2], a[3], false));
        break;
      case 'RT':
        if (a.length >= 4) arc3(toPu(a[0], a[1], true), toPu(a[2], a[3], true));
        break;
      case 'BZ':
      case 'BR':
        for (let k = 0; k + 5 < a.length; k += 6) {
          const rel = c.op === 'BR';
          const base = { ...pos };
          const q = (x: number, y: number) => {
            if (!rel) return toPu(x, y, false);
            const f = scaleFactors();
            return { x: base.x + x * f.sx, y: base.y + y * f.sy };
          };
          cubic(q(a[k], a[k + 1]), q(a[k + 2], a[k + 3]), q(a[k + 4], a[k + 5]));
        }
        break;
      case 'EA':
      case 'ER':
      case 'RA':
      case 'RR': {
        if (a.length < 2) break;
        const o = { ...pos };
        const q = toPu(a[0], a[1], c.op === 'ER' || c.op === 'RR');
        shape([o, { x: q.x, y: o.y }, q, { x: o.x, y: q.y }], c.op === 'RA' || c.op === 'RR', o);
        break;
      }
      case 'SI':
        if (a.length >= 2) {
          charW = a[0] * 10 * unitsPerMm;
          charH = a[1] * 10 * unitsPerMm;
        } else {
          charW = DEFAULT_SI.wCm * 10 * unitsPerMm;
          charH = DEFAULT_SI.hCm * 10 * unitsPerMm;
        }
        break;
      case 'SR': {
        const q = p2OrDefault();
        if (!p2) warnings.add('SR without IP: relative character size based on an assumed P1/P2');
        const w = a.length >= 2 ? a[0] : 0.75;
        const h = a.length >= 2 ? a[1] : 1.5;
        charW = (Math.abs(q.x - p1.x) * w) / 100;
        charH = (Math.abs(q.y - p1.y) * h) / 100;
        break;
      }
      case 'DI':
      case 'DR': {
        if (c.op === 'DR') warnings.add('DR (relative direction) approximated as absolute DI');
        if (a.length >= 2 && (a[0] !== 0 || a[1] !== 0)) {
          const L = Math.hypot(a[0], a[1]);
          dir = { x: a[0] / L, y: a[1] / L };
        } else dir = { x: 1, y: 0 };
        break;
      }
      case 'LO':
        lo = a.length ? Math.trunc(a[0]) : 1;
        break;
      case 'CP': {
        const v = { x: -dir.y, y: dir.x };
        const spaces = a.length >= 2 ? a[0] : 0;
        const lines = a.length >= 2 ? a[1] : -1;
        const dx = spaces * 1.5 * charW;
        const dy = lines * 2 * charH;
        endRun();
        pos = { x: pos.x + dx * dir.x + dy * v.x, y: pos.y + dx * dir.y + dy * v.y };
        break;
      }
      case 'LB':
        endRun();
        label(c.text ?? '', op++);
        break;
      case 'RO':
        if (a.length && a[0] % 360 !== 0)
          warnings.add(
            `RO ${a[0]}: plot rotation ignored — geometry is in unrotated plotter frame`,
          );
        break;
      case 'EW':
      case 'WG':
        warnings.add(`${c.op}: wedges are not imported`);
        break;
      case 'DV':
        if (a.length && a[0] !== 0) warnings.add('DV: vertical label stacking ignored');
        break;
      default:
        break;
    }
  }
  endRun();

  const q = p2;
  return {
    runs,
    labels,
    penWidthMm,
    penRgb,
    ipDiagPu: q ? Math.hypot(q.x - p1.x, q.y - p1.y) : null,
    warnings: [...warnings],
    drawn,
    peError,
  };
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * LO position → fraction of (width, cap height) to subtract to get the baseline-left corner, and
 * the half-cell offsets of the 11–19 variants. 1/2/3 = left, 4/5/6 = centre, 7/8/9 = right;
 * 1/4/7 = baseline, 2/5/8 = middle, 3/6/9 = top.
 */
function labelOrigin(
  lo: number,
  charW: number,
  charH: number,
): { fx: number; fy: number; ox: number; oy: number } {
  const base = lo > 10 ? lo - 10 : lo;
  const k = base >= 1 && base <= 9 ? base : 1;
  const col = Math.floor((k - 1) / 3); // 0 left, 1 centre, 2 right
  const row = (k - 1) % 3; // 0 bottom, 1 middle, 2 top
  const fx = col / 2;
  const fy = row / 2;
  let ox = 0;
  let oy = 0;
  if (lo > 10) {
    ox = col === 0 ? 0.5 * charW : col === 2 ? -0.5 * charW : 0;
    oy = row === 0 ? 0.5 * charH : row === 2 ? -0.5 * charH : 0;
  }
  return { fx, fy, ox, oy };
}
