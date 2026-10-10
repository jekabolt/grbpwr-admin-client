// F11 probe — the raster adapter + the synthetic ground truth + the metrics, bundled by
// `raster.mjs` (node I/O lives there; everything here is pure and type-checked).

import type { IRPage, PtMm } from 'lib/pattern-import/types';

export * from 'lib/pattern-import/adapters/raster';
export { decode as decodePng, encode as encodePng } from 'fast-png';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Synthetic page: known vector geometry (mm, y-up, A4) written as a PDF content stream.
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Cmd =
  | ['M', number, number]
  | ['L', number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'];
type RGB = [number, number, number];

export type Drawable = {
  id: string;
  group: string;
  rgb: RGB;
  widthMm: number;
  dash: [number, number] | null;
  cmds: Cmd[];
};

export type TruthLine = { id: string; group: string; rgb: RGB; pts: PtMm[]; closed: boolean };

const SIZE_RGB: RGB[] = [
  [40, 80, 200],
  [230, 60, 140],
  [40, 170, 90],
  [240, 170, 20],
  [150, 60, 170],
];
const BLACK: RGB = [20, 20, 20];

function arc(cx: number, cy: number, r: number, a0: number, a1: number, segs: number): Cmd[] {
  const out: Cmd[] = [];
  const rad = (d: number) => (d * Math.PI) / 180;
  const step = (a1 - a0) / segs;
  const k = (4 / 3) * Math.tan(rad(step) / 4) * r;
  out.push(['M', cx + r * Math.cos(rad(a0)), cy + r * Math.sin(rad(a0))]);
  for (let i = 0; i < segs; i++) {
    const t0 = rad(a0 + i * step);
    const t1 = rad(a0 + (i + 1) * step);
    const p0 = [cx + r * Math.cos(t0), cy + r * Math.sin(t0)];
    const p3 = [cx + r * Math.cos(t1), cy + r * Math.sin(t1)];
    out.push([
      'C',
      p0[0] - k * Math.sin(t0),
      p0[1] + k * Math.cos(t0),
      p3[0] + k * Math.sin(t1),
      p3[1] - k * Math.cos(t1),
      p3[0],
      p3[1],
    ]);
  }
  return out;
}

export function synthDrawables(): Drawable[] {
  const d: Drawable[] = [];
  // A. 100 mm test square.
  d.push({
    id: 'square',
    group: 'square',
    rgb: BLACK,
    widthMm: 0.3,
    dash: null,
    cmds: [['M', 15, 182], ['L', 115, 182], ['L', 115, 282], ['L', 15, 282], ['Z']],
  });
  // B. Graded piece: 5 sizes, one colour each, scaled about the centre (gaps ≈ 1–3 mm).
  const base: Cmd[] = [
    ['M', -30, -45],
    ['L', 28, -45],
    ['C', 32, -20, 38, -5, 33, 18],
    ['C', 28, 38, 14, 44, 0, 46],
    ['C', -12, 44, -20, 38, -25, 26],
    ['C', -32, 8, -36, -20, -30, -45],
    ['Z'],
  ];
  const [cx, cy] = [163, 225];
  [1, 1.03, 1.06, 1.1, 1.15].forEach((s, k) => {
    const cmds = base.map((c): Cmd => {
      if (c[0] === 'Z') return c;
      if (c[0] === 'C')
        return [
          'C',
          cx + s * c[1],
          cy + s * c[2],
          cx + s * c[3],
          cy + s * c[4],
          cx + s * c[5],
          cy + s * c[6],
        ];
      return [c[0], cx + s * c[1], cy + s * c[2]];
    });
    d.push({ id: `piece-${k}`, group: 'piece', rgb: SIZE_RGB[k], widthMm: 0.3, dash: null, cmds });
  });
  // C. Same-colour wavy lines, spacings 1.0 / 1.5 / 2.0 / 3.0 mm.
  [140, 141, 142.5, 144.5, 147.5].forEach((y0, k) => {
    const cmds: Cmd[] = [];
    for (let x = 15; x <= 195 + 1e-9; x += 0.25) {
      const y = y0 + 4 * Math.sin((2 * Math.PI * (x - 15)) / 60);
      cmds.push([cmds.length ? 'L' : 'M', x, y]);
    }
    d.push({ id: `wave-${k}`, group: 'wave', rgb: BLACK, widthMm: 0.25, dash: null, cmds });
  });
  // D. Arcs 1.5 mm apart: two colours, and two of the same colour.
  d.push({
    id: 'arc-g',
    group: 'arc-colour',
    rgb: SIZE_RGB[2],
    widthMm: 0.3,
    dash: null,
    cmds: arc(60, 60, 30, 20, 160, 2),
  });
  d.push({
    id: 'arc-p',
    group: 'arc-colour',
    rgb: SIZE_RGB[1],
    widthMm: 0.3,
    dash: null,
    cmds: arc(60, 60, 31.5, 20, 160, 2),
  });
  d.push({
    id: 'arc-k0',
    group: 'arc-same',
    rgb: BLACK,
    widthMm: 0.25,
    dash: null,
    cmds: arc(150, 60, 22, 200, 340, 2),
  });
  d.push({
    id: 'arc-k1',
    group: 'arc-same',
    rgb: BLACK,
    widthMm: 0.25,
    dash: null,
    cmds: arc(150, 60, 23.5, 200, 340, 2),
  });
  // E. Notches: 5 mm ticks on a straight edge.
  d.push({
    id: 'edge',
    group: 'notch',
    rgb: BLACK,
    widthMm: 0.3,
    dash: null,
    cmds: [
      ['M', 110, 110],
      ['L', 200, 110],
    ],
  });
  [120, 140, 160, 180].forEach((x, k) =>
    d.push({
      id: `notch-${k}`,
      group: 'notch',
      rgb: BLACK,
      widthMm: 0.3,
      dash: null,
      cmds: [
        ['M', x, 110],
        ['L', x, 105],
      ],
    }),
  );
  // F. Dashed line 3 / 1.5.
  d.push({
    id: 'dash',
    group: 'dash',
    rgb: BLACK,
    widthMm: 0.25,
    dash: [3, 1.5],
    cmds: [
      ['M', 15, 100],
      ['L', 100, 100],
    ],
  });
  // G. Sharp corners.
  d.push({
    id: 'tri',
    group: 'corner',
    rgb: BLACK,
    widthMm: 0.3,
    dash: null,
    cmds: [['M', 20, 15], ['L', 80, 15], ['L', 50, 55], ['Z']],
  });
  return d;
}

const f = (v: number) => v.toFixed(4);

/** A one-page A4 PDF drawing the drawables (round joins so corners stay on the centre line). */
export function synthPdf(drawables: Drawable[]): Uint8Array {
  const k = 72 / 25.4;
  const ops: string[] = [`q ${f(k)} 0 0 ${f(k)} 0 0 cm 1 j 0 J`];
  for (const dr of drawables) {
    ops.push(`${dr.rgb.map((v) => f(v / 255)).join(' ')} RG ${f(dr.widthMm)} w`);
    ops.push(dr.dash ? `[${dr.dash.join(' ')}] 0 d` : '[] 0 d');
    for (const c of dr.cmds) {
      if (c[0] === 'M') ops.push(`${f(c[1])} ${f(c[2])} m`);
      else if (c[0] === 'L') ops.push(`${f(c[1])} ${f(c[2])} l`);
      else if (c[0] === 'C')
        ops.push(
          `${c
            .slice(1)
            .map((v) => f(v as number))
            .join(' ')} c`,
        );
      else ops.push('h');
    }
    ops.push('S');
  }
  ops.push('Q');
  const content = ops.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(210 * k)} ${f(297 * k)}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offs) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** Flatten to ≤ 0.02 mm steps; dashed drawables become one truth line per dash. */
export function synthTruth(drawables: Drawable[]): TruthLine[] {
  const out: TruthLine[] = [];
  for (const dr of drawables) {
    const pts: PtMm[] = [];
    let start: PtMm = { x: 0, y: 0 };
    let cur: PtMm = { x: 0, y: 0 };
    let closed = false;
    const push = (p: PtMm) => pts.push(p);
    for (const c of dr.cmds) {
      if (c[0] === 'M') {
        cur = { x: c[1], y: c[2] };
        start = cur;
        push(cur);
      } else if (c[0] === 'L' || c[0] === 'Z') {
        const to = c[0] === 'L' ? { x: c[1], y: c[2] } : start;
        const n = Math.max(1, Math.ceil(Math.hypot(to.x - cur.x, to.y - cur.y) / 0.02));
        for (let i = 1; i <= n; i++)
          push({ x: cur.x + ((to.x - cur.x) * i) / n, y: cur.y + ((to.y - cur.y) * i) / n });
        cur = to;
        if (c[0] === 'Z') closed = true;
      } else {
        const [, x1, y1, x2, y2, x3, y3] = c;
        const n = 2000;
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const u = 1 - t;
          push({
            x: u * u * u * cur.x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            y: u * u * u * cur.y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
          });
        }
        cur = { x: x3, y: y3 };
      }
    }
    if (!dr.dash) {
      out.push({ id: dr.id, group: dr.group, rgb: dr.rgb, pts, closed });
      continue;
    }
    // Split by arc length into dashes.
    const [on, off] = dr.dash;
    let s = 0;
    let seg: PtMm[] = [pts[0]];
    let k = 0;
    for (let i = 1; i < pts.length; i++) {
      s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      const phase = s % (on + off);
      if (phase <= on) seg.push(pts[i]);
      else if (seg.length > 1) {
        out.push({ id: `${dr.id}-${k++}`, group: dr.group, rgb: dr.rgb, pts: seg, closed: false });
        seg = [];
      } else seg = [];
    }
    if (seg.length > 1)
      out.push({ id: `${dr.id}-${k++}`, group: dr.group, rgb: dr.rgb, pts: seg, closed: false });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// "Scanner": rotation + anisotropic stretch about the centre, a light blur and sensor noise.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export function distortScan(
  src: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  ch: number,
  rotDeg: number,
  sx: number,
  sy: number,
  noise: number,
): Uint8Array {
  const out = new Uint8Array(w * h * 3);
  const th = (rotDeg * Math.PI) / 180;
  const cs = Math.cos(th);
  const sn = Math.sin(th);
  const cx = w / 2;
  const cy = h / 2;
  // forward: p' = c + R·S·(p − c); inverse for sampling.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const X = x + 0.5 - cx;
      const Y = y + 0.5 - cy;
      // R⁻¹
      const rx = cs * X + sn * Y;
      const ry = -sn * X + cs * Y;
      const u = rx / sx + cx - 0.5;
      const v = ry / sy + cy - 0.5;
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const tx = u - x0;
      const ty = v - y0;
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let dy = 0; dy <= 1; dy++) {
          for (let dx = 0; dx <= 1; dx++) {
            const xx = x0 + dx;
            const yy = y0 + dy;
            const val =
              xx < 0 || yy < 0 || xx >= w || yy >= h
                ? 255
                : src[(yy * w + xx) * ch + (ch >= 3 ? c : 0)];
            acc += val * (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty);
          }
        }
        out[(y * w + x) * 3 + c] = acc;
      }
    }
  }
  // [1 2 1]/4 blur, separable.
  const tmp = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        const l = out[(y * w + Math.max(0, x - 1)) * 3 + c];
        const m = out[(y * w + x) * 3 + c];
        const r = out[(y * w + Math.min(w - 1, x + 1)) * 3 + c];
        tmp[(y * w + x) * 3 + c] = (l + 2 * m + r) / 4;
      }
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        const t = tmp[(Math.max(0, y - 1) * w + x) * 3 + c];
        const m = tmp[(y * w + x) * 3 + c];
        const b = tmp[(Math.min(h - 1, y + 1) * w + x) * 3 + c];
        const v = (t + 2 * m + b) / 4 + noise * gauss();
        out[(y * w + x) * 3 + c] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Metrics
// ─────────────────────────────────────────────────────────────────────────────────────────────

class Grid {
  cell: number;
  map = new Map<string, number[]>();
  pts: PtMm[] = [];
  owner: number[] = [];
  constructor(cell: number) {
    this.cell = cell;
  }
  add(p: PtMm, owner: number) {
    const k = `${Math.floor(p.x / this.cell)}|${Math.floor(p.y / this.cell)}`;
    let a = this.map.get(k);
    if (!a) this.map.set(k, (a = []));
    a.push(this.pts.length);
    this.pts.push(p);
    this.owner.push(owner);
  }
  /** Nearest point within `r` (mm) → [distance, owner] or [Infinity, -1]. */
  nearest(p: PtMm, r: number, accept?: (owner: number) => boolean): [number, number] {
    const c = this.cell;
    const n = Math.ceil(r / c);
    const gx = Math.floor(p.x / c);
    const gy = Math.floor(p.y / c);
    let bd = Infinity;
    let bo = -1;
    for (let dy = -n; dy <= n; dy++)
      for (let dx = -n; dx <= n; dx++) {
        const a = this.map.get(`${gx + dx}|${gy + dy}`);
        if (!a) continue;
        for (const i of a) {
          if (accept && !accept(this.owner[i])) continue;
          const q = this.pts[i];
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < bd) {
            bd = d;
            bo = this.owner[i];
          }
        }
      }
    return bd <= r ? [bd, bo] : [Infinity, -1];
  }
}

function densify(pts: PtMm[], closed: boolean, step: number): PtMm[] {
  const out: PtMm[] = [];
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const k = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let j = 0; j < k; j++)
      out.push({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k });
  }
  if (!closed && n) out.push(pts[n - 1]);
  return out;
}

const pct = (v: number[], q: number) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
};

export type CompareResult = {
  tracedPoints: number;
  unmatchedTracedShare: number;
  p50: number;
  p95: number;
  max: number;
  recoveredShare: number;
  recoveredByGroup: Record<string, number>;
  colourCorrectShare: number;
  separation: {
    pair: string;
    spacingMm: number;
    a: number;
    b: number;
    bridges: number;
    separated: boolean;
  }[];
  /** Short features: traced length (paths whose majority truth line is this one) − true length. */
  lengthErr: { group: string; n: number; meanMm: number; minMm: number; maxMm: number }[];
  inkToTruth: { rgb: number[]; truthRgb: number[]; dist: number }[];
};

/**
 * traced (page frame, translated by `shift` so the squares' centroids coincide) vs truth.
 * Distances: every traced point (0.1 mm densified) to the nearest truth point (0.02 mm dense).
 * Recovery: truth points with a SAME-COLOUR traced point within `tolMm`.
 */
export function compareToTruth(
  page: IRPage,
  truth: TruthLine[],
  shift: PtMm,
  tolMm = 0.5,
): CompareResult {
  const truthGrid = new Grid(1);
  truth.forEach((t, k) => {
    for (const p of t.pts) truthGrid.add(p, k);
  });
  // Ink → nearest truth colour.
  const truthColours: number[][] = [];
  for (const t of truth)
    if (!truthColours.some((c) => c.join() === t.rgb.join())) truthColours.push(t.rgb);
  const styleTruth = new Map<number, number[]>();
  const inkToTruth: CompareResult['inkToTruth'] = [];
  for (const s of page.styles) {
    const rgb = s.strokeRgb ?? [0, 0, 0];
    let best = truthColours[0];
    let bd = Infinity;
    for (const c of truthColours) {
      const d = Math.hypot(c[0] - rgb[0], c[1] - rgb[1], c[2] - rgb[2]);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    styleTruth.set(s.id, best);
    inkToTruth.push({ rgb: [...rgb], truthRgb: best, dist: Math.round(bd) });
  }
  const tracedGrid = new Grid(1);
  const dists: number[] = [];
  let unmatched = 0;
  let total = 0;
  let colourOk = 0;
  const pathTruthHits: Map<number, Map<number, number>> = new Map();
  page.paths.forEach((p, pi) => {
    const style = page.styles.find((s) => s.id === p.style)!;
    if (style.fill) return;
    const pts = densify(
      p.pts.map((q) => ({ x: q.x + shift.x, y: q.y + shift.y })),
      p.closed,
      0.1,
    );
    const hits = new Map<number, number>();
    for (const q of pts) {
      tracedGrid.add(q, pi);
      total++;
      const [d, owner] = truthGrid.nearest(q, 5);
      if (!Number.isFinite(d)) {
        unmatched++;
        continue;
      }
      dists.push(d);
      hits.set(owner, (hits.get(owner) ?? 0) + 1);
      if (truth[owner].rgb.join() === styleTruth.get(p.style)!.join()) colourOk++;
    }
    pathTruthHits.set(pi, hits);
  });
  // Recovery per truth line.
  const recOf = truth.map((t) => {
    let ok = 0;
    for (const q of t.pts) {
      const [d] = tracedGrid.nearest(
        q,
        tolMm,
        (pi) => styleTruth.get(page.paths[pi].style)!.join() === t.rgb.join(),
      );
      if (Number.isFinite(d)) ok++;
    }
    return { ok, n: t.pts.length };
  });
  const groups: Record<string, { ok: number; n: number }> = {};
  truth.forEach((t, k) => {
    const g = (groups[t.group] ??= { ok: 0, n: 0 });
    g.ok += recOf[k].ok;
    g.n += recOf[k].n;
  });
  const all = recOf.reduce((s, r) => ({ ok: s.ok + r.ok, n: s.n + r.n }), { ok: 0, n: 0 });
  // Separation: neighbour pairs in the same-colour groups.
  const separation: CompareResult['separation'] = [];
  const pairs: [string, string, number][] = [
    ['wave-0', 'wave-1', 1.0],
    ['wave-1', 'wave-2', 1.5],
    ['wave-2', 'wave-3', 2.0],
    ['wave-3', 'wave-4', 3.0],
    ['arc-k0', 'arc-k1', 1.5],
    ['arc-g', 'arc-p', 1.5],
  ];
  for (const [ia, ib, sp] of pairs) {
    const a = truth.findIndex((t) => t.id === ia);
    const b = truth.findIndex((t) => t.id === ib);
    if (a < 0 || b < 0) continue;
    let bridges = 0;
    for (const hits of pathTruthHits.values()) {
      const ha = hits.get(a) ?? 0;
      const hb = hits.get(b) ?? 0;
      const tot = [...hits.values()].reduce((s, v) => s + v, 0);
      if (ha > 0.1 * tot && hb > 0.1 * tot) bridges++;
    }
    const ra = recOf[a].ok / recOf[a].n;
    const rb = recOf[b].ok / recOf[b].n;
    separation.push({
      pair: `${ia}|${ib}`,
      spacingMm: sp,
      a: +ra.toFixed(4),
      b: +rb.toFixed(4),
      bridges,
      separated: bridges === 0 && ra > 0.95 && rb > 0.95,
    });
  }
  // Length of short features (notch ticks, dashes): ends recovered or eaten by thinning?
  const tracedLenOf = new Map<number, number>();
  page.paths.forEach((p, pi) => {
    const hits = pathTruthHits.get(pi);
    if (!hits || !hits.size) return;
    let owner = -1;
    let best = 0;
    for (const [k, v] of hits)
      if (v > best) {
        best = v;
        owner = k;
      }
    let L = 0;
    const q = p.closed ? [...p.pts, p.pts[0]] : p.pts;
    for (let i = 1; i < q.length; i++) L += Math.hypot(q[i].x - q[i - 1].x, q[i].y - q[i - 1].y);
    tracedLenOf.set(owner, (tracedLenOf.get(owner) ?? 0) + L);
  });
  const lengthErr: CompareResult['lengthErr'] = [];
  for (const group of ['notch', 'dash']) {
    const errs: number[] = [];
    truth.forEach((t, k) => {
      if (t.group !== group || t.id === 'edge') return;
      let L = 0;
      for (let i = 1; i < t.pts.length; i++)
        L += Math.hypot(t.pts[i].x - t.pts[i - 1].x, t.pts[i].y - t.pts[i - 1].y);
      errs.push((tracedLenOf.get(k) ?? 0) - L);
    });
    if (errs.length)
      lengthErr.push({
        group,
        n: errs.length,
        meanMm: +(errs.reduce((a, b) => a + b, 0) / errs.length).toFixed(3),
        minMm: +Math.min(...errs).toFixed(3),
        maxMm: +Math.max(...errs).toFixed(3),
      });
  }
  return {
    lengthErr,
    tracedPoints: total,
    unmatchedTracedShare: total ? unmatched / total : 0,
    p50: pct(dists, 0.5),
    p95: pct(dists, 0.95),
    max: dists.length ? dists.reduce((m, v) => (v > m ? v : m), 0) : NaN,
    recoveredShare: all.n ? all.ok / all.n : 0,
    recoveredByGroup: Object.fromEntries(
      Object.entries(groups).map(([g, v]) => [g, +(v.ok / v.n).toFixed(4)]),
    ),
    colourCorrectShare: dists.length ? colourOk / dists.length : 0,
    separation,
    inkToTruth,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// C5: a scan at the pixel limit, for the peak-memory measurement behind PATIMPORT.maxRasterPixels.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export { PATIMPORT } from 'lib/pattern-import/types';

/** A pattern-like scan, RGBA: paper 246, a sheet-wide outline (the largest component), piece
 * outlines in black and red, notches, a grainline per piece, scattered short strokes. */
export function synthScan(w: number, h: number): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = 246;
    d[i * 4 + 1] = 245;
    d[i * 4 + 2] = 243;
    d[i * 4 + 3] = 255;
  }
  const dot = (x: number, y: number, r: number, g: number, b: number) => {
    x |= 0;
    y |= 0;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = (yy * w + xx) * 4;
        d[k] = r;
        d[k + 1] = g;
        d[k + 2] = b;
      }
  };
  const line = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++) dot(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, ...c);
  };
  const m = Math.round(Math.min(w, h) * 0.02);
  // sheet-wide frame (one component as large as the image)
  line(m, m, w - m, m, [20, 20, 20]);
  line(w - m, m, w - m, h - m, [20, 20, 20]);
  line(w - m, h - m, m, h - m, [20, 20, 20]);
  line(m, h - m, m, m, [20, 20, 20]);
  // pieces: 4 × 5 rounded outlines, alternating black / red, with a grainline and notches
  const cols = 4,
    rows = 5;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const cx = m + ((c + 0.5) * (w - 2 * m)) / cols,
        cy = m + ((r + 0.5) * (h - 2 * m)) / rows;
      const rx = ((w - 2 * m) / cols) * 0.42,
        ry = ((h - 2 * m) / rows) * 0.42;
      const col: [number, number, number] = (r + c) % 2 ? [200, 30, 30] : [25, 25, 25];
      const N = Math.ceil(2 * Math.PI * Math.max(rx, ry));
      let px = cx + rx,
        py = cy;
      for (let i = 1; i <= N; i++) {
        const t = (2 * Math.PI * i) / N;
        const k = 1 + 0.08 * Math.sin(5 * t);
        const x = cx + rx * k * Math.cos(t),
          y = cy + ry * k * Math.sin(t);
        line(px, py, x, y, col);
        px = x;
        py = y;
      }
      line(cx, cy - ry * 0.6, cx, cy + ry * 0.6, col);
      for (let q = 0; q < 6; q++) {
        const t = (q / 6) * 2 * Math.PI;
        const x = cx + rx * Math.cos(t),
          y = cy + ry * Math.sin(t);
        line(x, y, x - 12 * Math.cos(t), y - 12 * Math.sin(t), col);
      }
    }
  // scattered short strokes (text-like)
  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const strokes = Math.round((w * h) / 4000);
  for (let i = 0; i < strokes; i++) {
    const x = rnd() * w,
      y = rnd() * h;
    line(x, y, x + 6 + rnd() * 10, y + (rnd() - 0.5) * 8, [30, 30, 30]);
  }
  return d;
}
