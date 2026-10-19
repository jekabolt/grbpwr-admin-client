// F12 · SVG path-data parser (all commands, incl. elliptical arcs) + transform-list parser.
// Path data is fed to a `PathSink` in ABSOLUTE user coordinates; the sink transforms and
// flattens. Tolerant per SVG 1.1 §F: on a syntax error render up to the error and report it.

import type { Affine } from '../../types';
import { IDENTITY, mul, rotate, scale, translate } from '../vector/affine';

export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  cubicTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
  quadTo(x1: number, y1: number, x: number, y: number): void;
  arcTo(
    rx: number,
    ry: number,
    phiDeg: number,
    large: boolean,
    sweep: boolean,
    x: number,
    y: number,
  ): void;
  close(): void;
}

const ARGC: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** Returns an error description when the data was cut short, else null. */
export function parsePathData(d: string, sink: PathSink): string | null {
  const n = d.length;
  let i = 0;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastC: { x: number; y: number } | null = null; // last cubic control (for S)
  let lastQ: { x: number; y: number } | null = null; // last quad control (for T)
  let cmd = '';
  let started = false;

  const skipSep = () => {
    while (
      i < n &&
      (d[i] === ' ' ||
        d[i] === ',' ||
        d[i] === '\n' ||
        d[i] === '\r' ||
        d[i] === '\t' ||
        d[i] === '\f')
    )
      i++;
  };
  const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
  const num = (): number | null => {
    skipSep();
    NUM.lastIndex = i;
    const m = NUM.exec(d);
    if (!m) return null;
    i = NUM.lastIndex;
    return parseFloat(m[0]);
  };
  const flag = (): boolean | null => {
    skipSep();
    if (d[i] === '0' || d[i] === '1') return d[i++] === '1';
    return null;
  };

  while (i < n) {
    skipSep();
    if (i >= n) break;
    const ch = d[i];
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) {
      cmd = ch;
      i++;
    } else if (!cmd || cmd === 'Z' || cmd === 'z') {
      return `unexpected "${ch}" at ${i}`;
    }
    // (else: implicit repetition of the previous command)
    const up = cmd.toUpperCase();
    const rel = cmd !== up;
    if (!started && up !== 'M') return `path must start with M (got ${cmd})`;

    if (up === 'Z') {
      sink.close();
      cx = sx;
      cy = sy;
      lastC = lastQ = null;
      continue;
    }

    const args: number[] = [];
    for (let k = 0; k < ARGC[up]; k++) {
      let v: number | boolean | null;
      if (up === 'A' && (k === 3 || k === 4)) {
        v = flag();
        if (v !== null) v = v ? 1 : 0;
      } else v = num();
      if (v === null) {
        // A command letter with no (or partial) arguments ends the data.
        return `bad ${cmd} arguments at ${i}`;
      }
      args.push(v as number);
    }
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;

    switch (up) {
      case 'M': {
        cx = args[0] + ox;
        cy = args[1] + oy;
        sx = cx;
        sy = cy;
        sink.moveTo(cx, cy);
        started = true;
        cmd = rel ? 'l' : 'L';
        lastC = lastQ = null;
        break;
      }
      case 'L':
        cx = args[0] + ox;
        cy = args[1] + oy;
        sink.lineTo(cx, cy);
        lastC = lastQ = null;
        break;
      case 'H':
        cx = args[0] + (rel ? cx : 0);
        sink.lineTo(cx, cy);
        lastC = lastQ = null;
        break;
      case 'V':
        cy = args[0] + (rel ? cy : 0);
        sink.lineTo(cx, cy);
        lastC = lastQ = null;
        break;
      case 'C': {
        const x1 = args[0] + ox;
        const y1 = args[1] + oy;
        const x2 = args[2] + ox;
        const y2 = args[3] + oy;
        cx = args[4] + ox;
        cy = args[5] + oy;
        sink.cubicTo(x1, y1, x2, y2, cx, cy);
        lastC = { x: x2, y: y2 };
        lastQ = null;
        break;
      }
      case 'S': {
        const x1: number = lastC ? 2 * cx - lastC.x : cx;
        const y1: number = lastC ? 2 * cy - lastC.y : cy;
        const x2 = args[0] + ox;
        const y2 = args[1] + oy;
        cx = args[2] + ox;
        cy = args[3] + oy;
        sink.cubicTo(x1, y1, x2, y2, cx, cy);
        lastC = { x: x2, y: y2 };
        lastQ = null;
        break;
      }
      case 'Q': {
        const x1 = args[0] + ox;
        const y1 = args[1] + oy;
        cx = args[2] + ox;
        cy = args[3] + oy;
        sink.quadTo(x1, y1, cx, cy);
        lastQ = { x: x1, y: y1 };
        lastC = null;
        break;
      }
      case 'T': {
        const x1: number = lastQ ? 2 * cx - lastQ.x : cx;
        const y1: number = lastQ ? 2 * cy - lastQ.y : cy;
        cx = args[0] + ox;
        cy = args[1] + oy;
        sink.quadTo(x1, y1, cx, cy);
        lastQ = { x: x1, y: y1 };
        lastC = null;
        break;
      }
      case 'A': {
        const x = args[5] + ox;
        const y = args[6] + oy;
        sink.arcTo(args[0], args[1], args[2], args[3] === 1, args[4] === 1, x, y);
        cx = x;
        cy = y;
        lastC = lastQ = null;
        break;
      }
    }
  }
  return null;
}

/** `transform` attribute → affine (left-to-right composition, as SVG specifies). */
export function parseTransform(v: string | undefined): Affine {
  if (!v) return IDENTITY;
  let m = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let t: RegExpExecArray | null;
  while ((t = re.exec(v))) {
    const a = (t[2].match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(parseFloat);
    let k: Affine = IDENTITY;
    switch (t[1]) {
      case 'matrix':
        if (a.length >= 6) k = { a: a[0], b: a[1], c: a[2], d: a[3], e: a[4], f: a[5] };
        break;
      case 'translate':
        k = translate(a[0] ?? 0, a[1] ?? 0);
        break;
      case 'scale':
        k = scale(a[0] ?? 1, a[1] ?? a[0] ?? 1);
        break;
      case 'rotate':
        k = rotate(a[0] ?? 0);
        if (a.length >= 3) k = mul(translate(a[1], a[2]), mul(k, translate(-a[1], -a[2])));
        break;
      case 'skewX':
        k = { a: 1, b: 0, c: Math.tan(((a[0] ?? 0) * Math.PI) / 180), d: 1, e: 0, f: 0 };
        break;
      case 'skewY':
        k = { a: 1, b: Math.tan(((a[0] ?? 0) * Math.PI) / 180), c: 0, d: 1, e: 0, f: 0 };
        break;
    }
    m = mul(m, k);
  }
  return m;
}

/**
 * SVG arc endpoint → centre parameterisation (SVG 1.1 §F.6.5), radii corrected per §F.6.6.
 * Returns null for a degenerate arc (draw a straight line instead).
 */
export function arcCenter(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  phiDeg: number,
  large: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): { cx: number; cy: number; rx: number; ry: number; phi: number; t1: number; dt: number } | null {
  if (x1 === x2 && y1 === y2) return null;
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return null;
  const phi = (((phiDeg % 360) + 360) % 360) * (Math.PI / 180);
  const cs = Math.cos(phi);
  const sn = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cs * dx + sn * dy;
  const y1p = -sn * dx + cs * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) coef = -coef;
  const cxp = (coef * (rx * y1p)) / ry;
  const cyp = (coef * -(ry * x1p)) / rx;
  const cx = cs * cxp - sn * cyp + (x1 + x2) / 2;
  const cy = sn * cxp + cs * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  return { cx, cy, rx, ry, phi, t1, dt };
}
